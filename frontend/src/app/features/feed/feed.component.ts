import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PostsService } from '../../core/posts/posts.service';
import { PostSummary } from '../../core/posts/posts.models';
import { PlaybackResumeService } from '../../core/playback/playback-resume.service';
import { ShellState } from '../../core/shell/shell.state';
import { VideoCardComponent } from './video-card/video-card.component';

const ACTIVE_RATIO = 0.75;
const PRELOAD_AHEAD = 3;
const PREFETCH_THRESHOLD = PRELOAD_AHEAD;

type FeedPhase = 'following' | 'discover';

@Component({
  selector: 'app-feed',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.scss'],
})
export class FeedComponent implements AfterViewInit, OnDestroy {
  private readonly postsService = inject(PostsService);
  private readonly auth = inject(AuthService);
  protected readonly shell = inject(ShellState);
  private readonly playbackResume = inject(PlaybackResumeService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('feedScroll') feedScroll?: ElementRef<HTMLElement>;
  @ViewChildren(VideoCardComponent) cards!: QueryList<VideoCardComponent>;

  posts: PostSummary[] = [];
  activeIndex = 0;
  activeResumeFrom: number | null = null;
  loading = false;
  suggestionsIndex = -1;

  private observer: IntersectionObserver | null = null;
  private phase: FeedPhase = this.auth.isAuthenticated() ? 'following' : 'discover';
  private cursor: string | null = null;
  private endReached = false;
  private loadInFlight = false;
  private prevReloadTick = this.shell.feedReloadTick();
  private tabResumeLock = false;
  private pendingTabResume: { postId: string; currentTime: number } | null =
    null;
  private resumeScrollIndex: number | null = null;
  private pageSub: Subscription | null = null;
  private cardsSub: Subscription | null = null;
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.pendingTabResume = this.playbackResume.consumeTabLeave();
    if (this.pendingTabResume) {
      this.tabResumeLock = true;
      this.activeIndex = -1;
    }

    effect(() => {
      const tick = this.shell.feedReloadTick();
      if (tick === this.prevReloadTick) {
        return;
      }
      this.prevReloadTick = tick;
      this.resetFeed();
      this.loadPage();
    });

    effect(() => {
      const postId = this.shell.pendingCommentsPostId();
      if (!postId) {
        return;
      }
      queueMicrotask(() => this.tryOpenPendingComments());
    });

    this.loadPage();
  }

  ngAfterViewInit(): void {
    this.cardsSub = this.cards.changes.subscribe(() => {
      this.observeCards();
      this.tryOpenPendingComments();
      this.tryApplyTabResume();
      this.attemptResumeScroll();
    });
    this.observeCards();
    this.tryOpenPendingComments();
    this.tryApplyTabResume();
    this.attemptResumeScroll();
    this.snapshotInterval = setInterval(() => this.refreshFeedSnapshot(), 500);
  }

  ngOnDestroy(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.observer?.disconnect();
    this.pageSub?.unsubscribe();
    this.cardsSub?.unsubscribe();
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.shouldIgnoreKeyboardShortcut()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.goTo(this.activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.goTo(this.activeIndex - 1);
        break;
      case ' ':
        event.preventDefault();
        this.cards.get(this.activeIndex)?.togglePlay();
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
      default:
        break;
    }
  }

  toggleMute(): void {
    this.shell.toggleFeedMuted();
  }

  onResumeApplied(index: number): void {
    if (index !== this.activeIndex) {
      return;
    }
    this.activeResumeFrom = null;
    this.cdr.markForCheck();
  }

  isPreload(i: number): boolean {
    const diff = i - this.activeIndex;
    return diff === -1 || (diff >= 1 && diff <= PRELOAD_AHEAD);
  }

  private shouldIgnoreKeyboardShortcut(): boolean {
    if (this.cards?.some((card) => card.commentsOpen)) {
      return true;
    }

    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) {
      return false;
    }

    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  }

  private resetFeed(): void {
    this.playbackResume.clearAll();
    this.pendingTabResume = null;
    this.resumeScrollIndex = null;
    this.tabResumeLock = false;
    this.activeResumeFrom = null;
    this.posts = [];
    this.activeIndex = 0;
    this.suggestionsIndex = -1;
    this.phase = this.auth.isAuthenticated() ? 'following' : 'discover';
    this.cursor = null;
    this.endReached = false;
    this.loadInFlight = false;
    this.loading = false;
  }

  private goTo(index: number): void {
    if (index < 0 || index >= this.posts.length) {
      return;
    }
    this.scrollFeedToIndex(index);
  }

  private observeCards(): void {
    this.observer?.disconnect();
    const observer = this.ensureObserver();
    for (const card of this.cards) {
      observer.observe(card.hostElement);
    }
  }

  private ensureObserver(): IntersectionObserver {
    if (this.observer) {
      return this.observer;
    }
    this.observer = new IntersectionObserver(
      (entries) => this.onIntersect(entries),
      { threshold: [ACTIVE_RATIO] },
    );
    return this.observer;
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    if (this.tabResumeLock) {
      return;
    }
    const cardList = this.cards.toArray();
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_RATIO) {
        const index = cardList.findIndex(
          (card) => card.hostElement === entry.target,
        );
        if (index >= 0) {
          this.setActive(index);
        }
      }
    }
  }

  private setActive(index: number): void {
    if (index === this.activeIndex) {
      return;
    }

    const prevCard = this.cards?.get(this.activeIndex);
    const prevPost = this.posts[this.activeIndex];
    if (prevCard && prevPost) {
      const prevTime = prevCard.getCurrentTime();
      this.playbackResume.saveScroll(prevPost.id, prevTime);
      this.playbackResume.updateFeedSnapshot(prevPost.id, prevTime);
      prevCard.pause();
    }

    this.activeIndex = index;
    this.activeResumeFrom = null;

    const nextPost = this.posts[index];
    if (nextPost) {
      const resumeTime = this.playbackResume.consumeScroll(nextPost.id);
      if (resumeTime !== null) {
        this.activeResumeFrom = resumeTime;
      }
    }

    if (index >= this.posts.length - PREFETCH_THRESHOLD) {
      this.loadPage();
    }
    this.prefetchManifestsAhead(index);
    this.cdr.markForCheck();
  }

  private refreshFeedSnapshot(): void {
    const card = this.cards?.get(this.activeIndex);
    const post = this.posts[this.activeIndex];
    if (!card || !post || this.activeIndex < 0) {
      return;
    }
    this.playbackResume.updateFeedSnapshot(post.id, card.getCurrentTime());
  }

  private tryApplyTabResume(): void {
    if (!this.pendingTabResume || this.posts.length === 0) {
      return;
    }

    const { postId, currentTime } = this.pendingTabResume;
    const index = this.posts.findIndex((post) => post.id === postId);
    if (index < 0) {
      if (!this.endReached && !this.loadInFlight) {
        this.loadPage();
      } else if (this.endReached) {
        this.pendingTabResume = null;
        this.resumeScrollIndex = null;
        this.tabResumeLock = false;
        this.activeIndex = 0;
        this.cdr.markForCheck();
      }
      return;
    }

    this.tabResumeLock = true;
    this.activeIndex = index;
    this.activeResumeFrom = currentTime > 0 ? currentTime : null;
    this.resumeScrollIndex = index;
    this.postsService.getManifest(postId).subscribe();
    this.prefetchManifestsAhead(index);
    this.cdr.detectChanges();
    this.attemptResumeScroll(48);
  }

  private attemptResumeScroll(attemptsLeft = 48): void {
    if (this.resumeScrollIndex === null || !this.feedScroll?.nativeElement) {
      return;
    }

    const index = this.resumeScrollIndex;
    this.scrollFeedToIndex(index);

    if (!this.isScrollAtIndex(index)) {
      if (attemptsLeft > 0) {
        requestAnimationFrame(() => this.attemptResumeScroll(attemptsLeft - 1));
      }
      return;
    }

    this.pendingTabResume = null;
    this.scheduleResumeUnlock(index);
  }

  private scrollFeedToIndex(index: number): void {
    const container = this.feedScroll?.nativeElement;
    if (!container || index < 0) {
      return;
    }

    const stride = this.getCardScrollStride(index);
    container.scrollTop = index * stride;
  }

  private getCardScrollStride(index: number): number {
    const card = this.cards?.get(index)?.hostElement;
    if (card && card.offsetHeight > 0) {
      return card.offsetHeight;
    }
    const sibling = this.cards?.first?.hostElement;
    if (sibling && sibling.offsetHeight > 0) {
      return sibling.offsetHeight;
    }
    return containerContentHeight(this.feedScroll?.nativeElement);
  }

  private isScrollAtIndex(index: number): boolean {
    const container = this.feedScroll?.nativeElement;
    if (!container) {
      return false;
    }
    const expected = index * this.getCardScrollStride(index);
    return Math.abs(container.scrollTop - expected) <= 2;
  }

  private scheduleResumeUnlock(index: number): void {
    const tryUnlock = (attemptsLeft: number): void => {
      if (!this.isScrollAtIndex(index)) {
        this.scrollFeedToIndex(index);
        if (attemptsLeft > 0) {
          requestAnimationFrame(() => tryUnlock(attemptsLeft - 1));
        }
        return;
      }

      const card = this.cards?.get(index);
      const playerReady =
        !card ||
        !this.activeResumeFrom ||
        this.activeResumeFrom <= 0 ||
        Math.abs(card.getCurrentTime() - this.activeResumeFrom) < 1.5;

      if (!playerReady && attemptsLeft > 0) {
        requestAnimationFrame(() => tryUnlock(attemptsLeft - 1));
        return;
      }

      this.resumeScrollIndex = null;
      this.tabResumeLock = false;
      this.cdr.markForCheck();
    };

    requestAnimationFrame(() => tryUnlock(24));
  }

  private appendPosts(incoming: PostSummary[]): void {
    if (incoming.length === 0) {
      return;
    }
    const wasEmpty = this.posts.length === 0;
    const seen = new Set(this.posts.map((p) => p.id));
    const fresh = incoming.filter((p) => !seen.has(p.id));
    if (fresh.length > 0) {
      this.posts = [...this.posts, ...fresh];
      if (wasEmpty) {
        const resumeId = this.pendingTabResume?.postId ?? fresh[0].id;
        this.postsService.getManifest(resumeId).subscribe();
      }
      this.prefetchManifestsAhead(this.activeIndex);
      this.cdr.markForCheck();
      this.tryOpenPendingComments();
      this.tryApplyTabResume();
    }
  }

  private tryOpenPendingComments(): void {
    const postId = this.shell.pendingCommentsPostId();
    if (!postId || !this.cards) {
      return;
    }

    const index = this.posts.findIndex((post) => post.id === postId);
    if (index < 0) {
      return;
    }

    const card = this.cards.get(index);
    if (!card) {
      return;
    }

    this.shell.pendingCommentsPostId.set(null);
    card.scrollIntoView();
    card.openComments();
  }

  private prefetchManifestsAhead(fromIndex: number): void {
    const ids: string[] = [];
    for (
      let i = fromIndex + 1;
      i <= fromIndex + PRELOAD_AHEAD && i < this.posts.length;
      i++
    ) {
      ids.push(this.posts[i].id);
    }
    if (ids.length > 0) {
      this.postsService.prefetchManifests(ids);
    }
  }

  private loadPage(): void {
    if (this.loadInFlight || this.endReached) {
      return;
    }
    this.loadInFlight = true;
    this.loading = true;
    this.cdr.markForCheck();
    this.pageSub?.unsubscribe();

    const source =
      this.phase === 'following'
        ? this.postsService.followingFeed(this.cursor ?? undefined)
        : this.postsService.discoverFeed(this.cursor ?? undefined);

    this.pageSub = source.subscribe({
      next: (page) => {
        this.appendPosts(page.items);
        this.cursor = page.nextCursor;
        this.loadInFlight = false;
        this.loading = false;

        if (page.nextCursor === null) {
          if (this.phase === 'following') {
            this.phase = 'discover';
            this.cursor = null;
            if (this.posts.length > 0) {
              this.suggestionsIndex = this.posts.length;
            }
            this.loadPage();
          } else {
            this.endReached = true;
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadInFlight = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}

function containerContentHeight(el: HTMLElement | undefined): number {
  if (!el) {
    return window.innerHeight;
  }
  const raw = getComputedStyle(el).getPropertyValue('--content-height').trim();
  if (raw.endsWith('px')) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return el.clientHeight > 0 ? el.clientHeight : window.innerHeight;
}
