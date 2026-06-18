import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { API_BASE_URL } from '../api.config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

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
      providers: [{ provide: API_BASE_URL, useValue: apiBase }],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('login armazena access token e usuário em memória', () => {
    service.login({ email: 'dev@scroll.me', password: 'senhaForte123' }).subscribe();

    const req = http.expectOne(`${apiBase}/auth/login`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ user: authUser, accessToken: 'access.jwt' });

    expect(service.accessToken).toBe('access.jwt');
    expect(service.user()).toEqual(authUser);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('logout limpa a sessão em memória', () => {
    service.login({ email: 'dev@scroll.me', password: 'senhaForte123' }).subscribe();
    http.expectOne(`${apiBase}/auth/login`).flush({
      user: authUser,
      accessToken: 'access.jwt',
    });

    service.logout().subscribe();
    const req = http.expectOne(`${apiBase}/auth/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);

    expect(service.accessToken).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
