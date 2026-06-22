import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PostSummary } from '../../../core/posts/posts.models';
import { PostsService } from '../../../core/posts/posts.service';
import { PlaybackResumeService } from '../../../core/playback/playback-resume.service';
import { ShellState } from '../../../core/shell/shell.state';
import { UsersService } from '../../../core/users/users.service';
import { VideoCardComponent } from '../../feed/video-card/video-card.component';

const ACTIVE_RATIO = 0.75;
const PRELOAD_AHEAD = 3;
const PREFETCH_THRESHOLD = PRELOAD_AHEAD;

@Component({
  selector: 'app-profile-reel',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-reel.component.html',
  styleUrls: ['./profile-reel.component.scss'],
})
export class ProfileReelComponent implements AfterViewInit, OnDestroy {
  private readonly users = inject(UsersService);
  private readonly postsService = inject(PostsService);
  protected readonly shell = inject(ShellState);
  private readonly playbackResume = inject(PlaybackResumeService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChildren(VideoCardComponent) cards!: QueryList<VideoCardComponent>;

  posts: PostSummary[] = [];
  activeIndex = 0;
  activeResumeFrom: number | null = null;

  private observer: IntersectionObserver | null = null;
  private cursor: string | null = null;
  private endReached = false;
  private loading = false;
  private scrolledToStart = false;
  private pageSub: Subscription | null = null;
  private cardsSub: Subscription | null = null;

  constructor() {
    const reel = this.shell.profileReel();
    if (reel) {
      this.loadPage(reel.username);
    }
  }

  ngAfterViewInit(): void {
    this.cardsSub = this.cards.changes.subscribe(() => {
      this.observeCards();
      this.maybeScrollToStart();
    });
    this.observeCards();
    this.maybeScrollToStart();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.pageSub?.unsubscribe();
    this.cardsSub?.unsubscribe();
  }

  close(): void {
    this.shell.closeProfileReel();
  }

  toggleMute(): void {
    this.shell.toggleFeedMuted();
  }

  isPreload(i: number): boolean {
    const diff = i - this.activeIndex;
    return diff === -1 || (diff >= 1 && diff <= PRELOAD_AHEAD);
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
    if (!this.scrolledToStart) {
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
      this.playbackResume.saveScroll(prevPost.id, prevCard.getCurrentTime());
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

    const reel = this.shell.profileReel();
    if (reel && index >= this.posts.length - PREFETCH_THRESHOLD) {
      this.loadPage(reel.username);
    }
    this.prefetchManifestsAhead(index);
    this.cdr.markForCheck();
  }

  private maybeScrollToStart(): void {
    if (this.scrolledToStart) {
      return;
    }
    const reel = this.shell.profileReel();
    if (!reel) {
      return;
    }
    const index = this.posts.findIndex((p) => p.id === reel.startPostId);
    if (index < 0) {
      if (!this.endReached) {
        this.loadPage(reel.username);
      } else {
        this.scrolledToStart = true;
      }
      return;
    }
    const card = this.cards.get(index);
    if (card) {
      card.hostElement.scrollIntoView({ block: 'start' });
      this.activeIndex = index;
      this.prefetchManifestsAhead(index);
      this.scrolledToStart = true;
      this.cdr.markForCheck();
    }
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

  private loadPage(username: string): void {
    if (this.loading || this.endReached) {
      return;
    }
    this.loading = true;
    this.pageSub?.unsubscribe();
    this.pageSub = this.users
      .userPosts(username, this.cursor ?? undefined, 12)
      .subscribe({
        next: (page) => {
          const seen = new Set(this.posts.map((p) => p.id));
          const fresh = page.items.filter((p) => !seen.has(p.id));
          if (fresh.length > 0) {
            const wasEmpty = this.posts.length === 0;
            this.posts = [...this.posts, ...fresh];
            if (wasEmpty) {
              const reel = this.shell.profileReel();
              const startInBatch = reel?.startPostId
                ? fresh.find((post) => post.id === reel.startPostId)
                : undefined;
              this.postsService
                .getManifest((startInBatch ?? fresh[0]).id)
                .subscribe();
            }
            this.prefetchManifestsAhead(this.activeIndex);
          }
          this.cursor = page.nextCursor;
          this.endReached = page.nextCursor === null;
          this.loading = false;
          this.cdr.markForCheck();
          this.maybeScrollToStart();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }
}
