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
  private readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  profile: UserProfile | null = null;
  loading = false;
  error: string | null = null;

  private sub: Subscription | null = null;
  private prevReloadTick = -1;

  constructor() {
    effect(() => {
      const tick = this.shell.profileReloadTick();
      if (tick !== this.prevReloadTick) {
        this.prevReloadTick = tick;
        this.loadProfile();
      }
    });
    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private loadProfile(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    this.sub?.unsubscribe();

    this.sub = this.users.me().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'Não foi possível carregar o perfil.';
        this.cdr.markForCheck();
      },
    });
  }
}
