import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly accessTokenSig = signal<string | null>(null);
  private readonly userSig = signal<AuthUser | null>(null);

  readonly user = this.userSig.asReadonly();
  readonly isAuthenticated = computed(() => this.userSig() !== null);

  get accessToken(): string | null {
    return this.accessTokenSig();
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/register`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.setSession(res)));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/login`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.setSession(res)));
  }

  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(
        `${this.baseUrl}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(tap((res) => this.setSession(res)));
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearSession()));
  }

  private setSession(res: AuthResponse): void {
    this.accessTokenSig.set(res.accessToken);
    this.userSig.set(res.user);
  }

  private clearSession(): void {
    this.accessTokenSig.set(null);
    this.userSig.set(null);
  }
}
