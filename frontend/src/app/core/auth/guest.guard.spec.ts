import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { guestGuard } from './guest.guard';

describe('guestGuard', () => {
  let http: HttpTestingController;
  let router: Router;

  const apiBase = 'http://localhost:3000';
  const authUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'devuser',
    displayName: 'Dev User',
    email: 'dev@scroll.me',
    bio: null,
    avatarKey: null,
    role: 'USER' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: API_BASE_URL, useValue: apiBase },
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
  });

  async function runGuard(): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
    if (isObservable(result)) {
      return firstValueFrom(result) as Promise<boolean | UrlTree>;
    }
    return result as boolean | UrlTree;
  }

  it('permite acesso quando não há sessão e refresh falha', async () => {
    const guardPromise = runGuard();

    const req = http.expectOne(`${apiBase}/auth/refresh`);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    await expectAsync(guardPromise).toBeResolvedTo(true);
  });

  it('redireciona para home quando refresh restaura a sessão', async () => {
    const guardPromise = runGuard();

    const req = http.expectOne(`${apiBase}/auth/refresh`);
    req.flush({ user: authUser, accessToken: 'access.jwt' });

    const result = await guardPromise;
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });

  it('redireciona para home quando já autenticado em memória', async () => {
    const { AuthService } = await import('./auth.service');
    const auth = TestBed.inject(AuthService);

    auth.login({ email: 'dev@scroll.me', password: 'senhaForte123' }).subscribe();
    http.expectOne(`${apiBase}/auth/login`).flush({
      user: authUser,
      accessToken: 'access.jwt',
    });

    const result = await runGuard();
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });
});
