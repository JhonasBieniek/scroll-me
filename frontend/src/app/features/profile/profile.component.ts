import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
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
  protected readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  profile: UserProfile | null = null;
  loading = false;
  error: string | null = null;
  followBusy = false;

  private sub: Subscription | null = null;
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
    this.sub?.unsubscribe();
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
    this.sub?.unsubscribe();

    const profile$ = username
      ? this.users.getProfile(username)
      : this.users.me();

    this.sub = profile$.subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'Não foi possível carregar o perfil.';
        this.profile = null;
        this.cdr.markForCheck();
      },
    });
  }
}
