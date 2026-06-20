import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  HostListener,
  inject,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PostsService } from '../../core/posts/posts.service';
import { PostSummary } from '../../core/posts/posts.models';
import { ShellState } from '../../core/shell/shell.state';
import { VideoCardComponent } from './video-card/video-card.component';

const ACTIVE_RATIO = 0.75;
const PREFETCH_THRESHOLD = 2;

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
  protected readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChildren(VideoCardComponent) cards!: QueryList<VideoCardComponent>;

  posts: PostSummary[] = [];
  activeIndex = 0;
  loading = false;
  suggestionsIndex = -1;

  private observer: IntersectionObserver | null = null;
  private phase: FeedPhase = 'following';
  private cursor: string | null = null;
  private endReached = false;
  private loadInFlight = false;
  private prevReloadTick = -1;
  private pageSub: Subscription | null = null;
  private cardsSub: Subscription | null = null;

  constructor() {
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
  }

  ngAfterViewInit(): void {
    this.cardsSub = this.cards.changes.subscribe(() => {
      this.observeCards();
      this.tryOpenPendingComments();
    });
    this.observeCards();
    this.tryOpenPendingComments();
  }

  ngOnDestroy(): void {
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
    this.posts = [];
    this.activeIndex = 0;
    this.suggestionsIndex = -1;
    this.phase = 'following';
    this.cursor = null;
    this.endReached = false;
    this.loadInFlight = false;
    this.loading = false;
  }

  private goTo(index: number): void {
    const target = this.cards.get(index);
    target?.scrollIntoView();
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
    this.activeIndex = index;
    if (index >= this.posts.length - PREFETCH_THRESHOLD) {
      this.loadPage();
    }
    this.cdr.markForCheck();
  }

  private appendPosts(incoming: PostSummary[]): void {
    if (incoming.length === 0) {
      return;
    }
    const seen = new Set(this.posts.map((p) => p.id));
    const fresh = incoming.filter((p) => !seen.has(p.id));
    if (fresh.length > 0) {
      this.posts = [...this.posts, ...fresh];
      this.cdr.markForCheck();
      this.tryOpenPendingComments();
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
