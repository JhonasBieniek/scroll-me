import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AuthResult, AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface OAuthStatePayload {
  purpose: 'github-oauth';
  nonce: string;
}

@Injectable()
export class GithubOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  buildAuthorizeUrl(): string {
    const clientId = this.requireClientId();
    const redirectUri = this.callbackUrl();
    const state = this.signState();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<AuthResult> {
    this.verifyState(state);
    const accessToken = await this.exchangeCode(code);
    const profile = await this.fetchGithubUser(accessToken);
    const email = await this.resolveEmail(accessToken, profile);
    const user = await this.users.findOrCreateFromGithub({
      githubId: String(profile.id),
      login: profile.login,
      displayName: profile.name?.trim() || profile.login,
      email,
    });
    return this.auth.buildAuthResult(user);
  }

  private requireClientId(): string {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new UnauthorizedException('Login com GitHub indisponível.');
    }
    return clientId;
  }

  private callbackUrl(): string {
    return (
      this.config.get<string>('GITHUB_CALLBACK_URL')?.trim() ||
      `${this.config.get<string>('API_BASE_URL', 'http://localhost:3000')}/auth/github/callback`
    );
  }

  private signState(): string {
    const payload: OAuthStatePayload = {
      purpose: 'github-oauth',
      nonce: randomBytes(16).toString('hex'),
    };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '10m',
    });
  }

  private verifyState(state: string): void {
    try {
      const payload = this.jwt.verify<OAuthStatePayload>(state, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.purpose !== 'github-oauth') {
        throw new Error('invalid purpose');
      }
    } catch {
      throw new UnauthorizedException('Estado OAuth inválido.');
    }
  }

  private async exchangeCode(code: string): Promise<string> {
    const clientId = this.requireClientId();
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET')?.trim();
    if (!clientSecret) {
      throw new UnauthorizedException('Login com GitHub indisponível.');
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: this.callbackUrl(),
      }),
    });

    const data = (await response.json()) as GithubTokenResponse;
    if (!response.ok || !data.access_token) {
      throw new UnauthorizedException('Não foi possível autenticar com GitHub.');
    }
    return data.access_token;
  }

  private async fetchGithubUser(accessToken: string): Promise<GithubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'scroll-me-v2',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Não foi possível ler o perfil do GitHub.');
    }

    return (await response.json()) as GithubUser;
  }

  private async resolveEmail(
    accessToken: string,
    profile: GithubUser,
  ): Promise<string> {
    if (profile.email) {
      return profile.email.toLowerCase();
    }

    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'scroll-me-v2',
      },
    });

    if (response.ok) {
      const emails = (await response.json()) as GithubEmail[];
      const primary = emails.find((item) => item.primary && item.verified);
      const verified = emails.find((item) => item.verified);
      const chosen = primary ?? verified ?? emails[0];
      if (chosen?.email) {
        return chosen.email.toLowerCase();
      }
    }

    return `${profile.id}+${profile.login}@users.noreply.github.com`;
  }
}
