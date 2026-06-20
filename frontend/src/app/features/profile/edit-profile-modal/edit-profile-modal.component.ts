import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { friendlyHttpError } from '../../../core/http/http-error-message';
import { ShellState } from '../../../core/shell/shell.state';
import { UserProfile } from '../../../core/users/users.models';
import { UsersService } from '../../../core/users/users.service';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

@Component({
  selector: 'app-edit-profile-modal',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-profile-modal.component.html',
  styleUrls: ['./edit-profile-modal.component.scss'],
})
export class EditProfileModalComponent implements OnDestroy {
  private readonly users = inject(UsersService);
  private readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  saving = false;
  error: string | null = null;
  avatarPreview: string | null = null;

  readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(64)],
    }),
    username: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(USERNAME_PATTERN),
      ],
    }),
    bio: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
  });

  private avatarFile: File | null = null;
  private avatarObjectUrl: string | null = null;
  private loadedUsername: string | null = null;
  private loadSub: Subscription | null = null;

  constructor() {
    this.loadSub = this.users.me().subscribe({
      next: (profile) => {
        this.loadedUsername = profile.username;
        this.form.patchValue({
          displayName: profile.displayName,
          username: profile.username,
          bio: profile.bio ?? '',
        });
        this.avatarPreview = profile.avatarUrl;
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.revokeAvatar();
  }

  close(): void {
    this.shell.closeEditProfile();
  }

  onAvatarChange(event: Event): void {
    this.error = null;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error = 'Selecione uma imagem.';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.error = 'Imagem excede 5 MB.';
      this.cdr.markForCheck();
      return;
    }
    this.avatarFile = file;
    this.revokeAvatar();
    this.avatarObjectUrl = URL.createObjectURL(file);
    this.avatarPreview = this.avatarObjectUrl;
    this.cdr.markForCheck();
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }
    this.error = null;
    this.saving = true;
    this.cdr.markForCheck();

    const { displayName, username, bio } = this.form.getRawValue();
    const persistProfile = () => {
      this.users.updateProfile({ displayName, username, bio }).subscribe({
        next: (profile) => this.onSaved(profile),
        error: (err: unknown) => this.fail(err),
      });
    };

    if (this.avatarFile) {
      this.users.uploadAvatar(this.avatarFile).subscribe({
        next: () => persistProfile(),
        error: (err: unknown) => this.fail(err),
      });
    } else {
      persistProfile();
    }
  }

  private onSaved(profile: UserProfile): void {
    this.saving = false;
    const viewedUsername = this.shell.profileUsername();
    if (
      viewedUsername !== null &&
      this.loadedUsername !== null &&
      viewedUsername === this.loadedUsername
    ) {
      this.shell.profileUsername.set(profile.username);
    }
    this.shell.bumpProfileReload();
    this.close();
    this.cdr.markForCheck();
  }

  private fail(err: unknown): void {
    this.saving = false;
    this.error = friendlyHttpError(
      err,
      'Não foi possível salvar as alterações.',
    );
    this.cdr.markForCheck();
  }

  private revokeAvatar(): void {
    if (this.avatarObjectUrl) {
      URL.revokeObjectURL(this.avatarObjectUrl);
      this.avatarObjectUrl = null;
    }
  }
}
