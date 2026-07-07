import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { friendlyHttpError } from '../../../core/http/http-error-message';

@Component({
  selector: 'app-auth-callback',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="callback">
      <p>{{ message() }}</p>
    </main>
  `,
  styles: [
    `
      .callback {
        min-height: 100vh;
        display: grid;
        place-items: center;
        color: #fafafa;
        background: #000;
      }
    `,
  ],
})
export class AuthCallbackComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly message = signal('Conectando com GitHub…');

  constructor() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      this.message.set('Não foi possível entrar com GitHub.');
      void this.router.navigate(['/login']);
      return;
    }

    this.auth.refresh().subscribe({
      next: () => {
        void this.router.navigate(['/']);
      },
      error: () => {
        this.message.set('Não foi possível concluir o login.');
        void this.router.navigate(['/login']);
      },
    });
  }
}
