import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthResult, AuthService, PublicUser } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GithubOAuthService } from './github-oauth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { AuthenticatedUser } from './types/jwt-payload';

const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly github: GithubOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toResponse(result);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toResponse(result);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('github')
  githubLogin(@Res() res: Response): void {
    res.redirect(this.github.buildAuthorizeUrl());
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !state) {
      res.redirect(this.githubErrorRedirect());
      return;
    }

    try {
      const result = await this.github.handleCallback(code, state);
      this.setRefreshCookie(res, result.refreshToken);
      res.redirect(this.githubSuccessRedirect());
    } catch {
      res.redirect(this.githubErrorRedirect());
    }
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.refresh(user.id);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toResponse(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private toResponse(result: AuthResult): AuthResponse {
    return { user: result.user, accessToken: result.accessToken };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }

  private cookieOptions(): CookieOptions {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  private frontendOrigin(): string {
    return this.config.get<string>('FRONTEND_ORIGIN', 'http://localhost:4200');
  }

  private githubSuccessRedirect(): string {
    return `${this.frontendOrigin()}/auth/callback`;
  }

  private githubErrorRedirect(): string {
    return `${this.frontendOrigin()}/auth/callback?error=github`;
  }
}
