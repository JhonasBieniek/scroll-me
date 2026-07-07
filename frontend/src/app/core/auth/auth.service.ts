import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { PlaybackResumeService } from '../playback/playback-resume.service';
import { ShellState } from '../shell/shell.state';
import {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from './auth.models';

export const GUEST_STORAGE_KEY = 'scroll-me.guest';

function readGuestFromSession(): boolean {
  try {
    return sessionStorage.getItem(GUEST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly shell = inject(ShellState);
  private readonly playbackResume = inject(PlaybackResumeService);

  private readonly accessTokenSig = signal<string | null>(null);
  private readonly userSig = signal<AuthUser | null>(null);
  private readonly guestModeSig = signal(readGuestFromSession());

  readonly user = this.userSig.asReadonly();
  readonly isAuthenticated = computed(() => this.userSig() !== null);
  readonly isGuest = computed(
    () => this.guestModeSig() && this.userSig() === null,
  );
  readonly canBrowse = computed(
    () => this.isAuthenticated() || this.isGuest(),
  );

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

  enterGuestMode(): void {
    try {
      sessionStorage.setItem(GUEST_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    this.guestModeSig.set(true);
  }

  exitGuestMode(): void {
    try {
      sessionStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    this.guestModeSig.set(false);
  }

  requireAuth(action: string): boolean {
    if (this.isAuthenticated()) {
      return true;
    }
    this.shell.openLoginPrompt(action);
    return false;
  }

  /** Usado pelo interceptor quando refresh falha (sessão inválida). */
  clearSessionForExpiredAuth(): void {
    this.clearSession();
  }

  private setSession(res: AuthResponse): void {
    this.exitGuestMode();
    this.shell.closeLoginPrompt();
    this.shell.bumpFeedReload();
    this.accessTokenSig.set(res.accessToken);
    this.userSig.set(res.user);
  }

  private clearSession(): void {
    this.exitGuestMode();
    this.shell.resetFeedMutedPreference();
    this.playbackResume.clearAll();
    this.accessTokenSig.set(null);
    this.userSig.set(null);
  }
}
