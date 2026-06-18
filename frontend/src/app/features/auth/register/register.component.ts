import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { friendlyHttpError } from '../../../core/http/http-error-message';

const PASSWORD_MIN_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      username: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
          Validators.pattern(USERNAME_PATTERN),
        ],
      }),
      displayName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(64)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(PASSWORD_MIN_LENGTH),
        ],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  get usernameControl(): FormControl<string> {
    return this.form.controls.username;
  }

  get displayNameControl(): FormControl<string> {
    return this.form.controls.displayName;
  }

  get emailControl(): FormControl<string> {
    return this.form.controls.email;
  }

  get passwordControl(): FormControl<string> {
    return this.form.controls.password;
  }

  get confirmControl(): FormControl<string> {
    return this.form.controls.confirmPassword;
  }

  showMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      (this.confirmControl.touched || this.confirmControl.dirty)
    );
  }

  submit(): void {
    this.serverError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { username, displayName, email, password } = this.form.getRawValue();

    this.auth.register({ username, displayName, email, password }).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/']);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.serverError.set(
          friendlyHttpError(
            error,
            'Não foi possível concluir o registro. Verifique os dados e tente novamente.',
          ),
        );
      },
    });
  }
}
