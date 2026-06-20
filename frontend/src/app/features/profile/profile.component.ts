import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PostSummary } from '../../core/posts/posts.models';
import { ShellState } from '../../core/shell/shell.state';
import { UserProfile } from '../../core/users/users.models';
import { UsersService } from '../../core/users/users.service';

@Component({
  selector: 'app-profile',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnDestroy {
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  profile: UserProfile | null = null;
  posts: PostSummary[] = [];
  loading = false;
  error: string | null = null;
  followBusy = false;

  private profileSub: Subscription | null = null;
  private postsSub: Subscription | null = null;
  private prevReloadTick = -1;
  private prevUsername: string | null | undefined = undefined;

  constructor() {
    effect(() => {
      const tick = this.shell.profileReloadTick();
      const username = this.shell.profileUsername();
      if (
        tick !== this.prevReloadTick ||
        username !== this.prevUsername
      ) {
        this.prevReloadTick = tick;
        this.prevUsername = username;
        this.loadProfile(username);
      }
    });
    this.loadProfile(this.shell.profileUsername());
  }

  ngOnDestroy(): void {
    this.profileSub?.unsubscribe();
    this.postsSub?.unsubscribe();
  }

  goBack(): void {
    this.shell.goBackFromProfile();
  }

  openEdit(): void {
    this.shell.openEditProfile();
  }

  logout(): void {
    const done = () => {
      this.shell.openFeed();
      void this.router.navigate(['/login']);
    };
    this.auth.logout().subscribe({ next: done, error: done });
  }

  openReel(post: PostSummary): void {
    const username = this.profile?.username;
    if (username) {
      this.shell.openProfileReel(username, post.id);
    }
  }

  toggleFollow(): void {
    const current = this.profile;
    if (!current || current.isMe || this.followBusy) {
      return;
    }
    const next = !current.isFollowing;
    this.applyFollow(next);
    this.followBusy = true;
    this.cdr.markForCheck();

    const request = next
      ? this.users.follow(current.username)
      : this.users.unfollow(current.username);

    request.subscribe({
      next: () => {
        this.followBusy = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.applyFollow(!next);
        this.followBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  private applyFollow(isFollowing: boolean): void {
    if (!this.profile) {
      return;
    }
    this.profile = {
      ...this.profile,
      isFollowing,
      counts: {
        ...this.profile.counts,
        followers: Math.max(
          0,
          this.profile.counts.followers + (isFollowing ? 1 : -1),
        ),
      },
    };
  }

  private loadProfile(username: string | null): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    this.profileSub?.unsubscribe();

    const profile$ = username
      ? this.users.getProfile(username)
      : this.users.me();

    this.profileSub = profile$.subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
        this.loadPosts(profile.username);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'Não foi possível carregar o perfil.';
        this.profile = null;
        this.posts = [];
        this.cdr.markForCheck();
      },
    });
  }

  private loadPosts(username: string): void {
    this.postsSub?.unsubscribe();
    this.postsSub = this.users.userPosts(username, undefined, 30).subscribe({
      next: (page) => {
        this.posts = page.items;
        this.cdr.markForCheck();
      },
      error: () => {
        this.posts = [];
        this.cdr.markForCheck();
      },
    });
  }
}
