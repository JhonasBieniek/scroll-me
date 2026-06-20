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
import { ShellState } from '../../../core/shell/shell.state';
import { UsersService } from '../../../core/users/users.service';
import { VideoCardComponent } from '../../feed/video-card/video-card.component';

const ACTIVE_RATIO = 0.75;
const PREFETCH_THRESHOLD = 2;

@Component({
  selector: 'app-profile-reel',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-reel.component.html',
  styleUrls: ['./profile-reel.component.scss'],
})
export class ProfileReelComponent implements AfterViewInit, OnDestroy {
  private readonly users = inject(UsersService);
  protected readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChildren(VideoCardComponent) cards!: QueryList<VideoCardComponent>;

  posts: PostSummary[] = [];
  activeIndex = 0;

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
    this.activeIndex = index;
    const reel = this.shell.profileReel();
    if (reel && index >= this.posts.length - PREFETCH_THRESHOLD) {
      this.loadPage(reel.username);
    }
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
      this.scrolledToStart = true;
      this.cdr.markForCheck();
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
            this.posts = [...this.posts, ...fresh];
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
