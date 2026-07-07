import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { friendlyHttpError } from '../../../core/http/http-error-message';
import { ShellState } from '../../../core/shell/shell.state';

const ACTION_LABELS: Record<string, string> = {
  like: 'curtir',
  comment: 'comentar',
  follow: 'seguir',
  post: 'publicar',
  profile: 'acessar seu perfil',
};

@Component({
  selector: 'app-login-prompt-modal',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-prompt-modal.component.html',
  styleUrls: ['./login-prompt-modal.component.scss'],
})
export class LoginPromptModalComponent {
  private readonly auth = inject(AuthService);
  private readonly shell = inject(ShellState);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly promptText = computed(() => {
    const action = this.shell.loginPromptAction();
    const label = action ? (ACTION_LABELS[action] ?? 'fazer isso') : 'interagir';
    return `Faça login para ${label}.`;
  });

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  close(): void {
    this.shell.closeLoginPrompt();
  }

  continueAsGuest(): void {
    this.close();
  }

  goToRegister(): void {
    this.close();
    void this.router.navigate(['/register']);
  }

  submit(): void {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.loading.set(false);
        this.close();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.serverError.set(friendlyHttpError(error, 'Credenciais inválidas.'));
      },
    });
  }
}
