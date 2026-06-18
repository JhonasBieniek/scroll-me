import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { isValidUsername, normalizeUsername } from '../users/username.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';

const BCRYPT_SALT_ROUNDS = 12;
const DUMMY_HASH =
  '$2b$12$abcdefghijklmnopqrstuuM/xqQ8s8sN7v0w3i7zJ8m3sQ0Yy2wK';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string | null;
  avatarKey: string | null;
  role: Role;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const username = normalizeUsername(dto.username);
    if (!isValidUsername(username)) {
      throw new ConflictException('Não foi possível concluir o registro.');
    }

    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Não foi possível concluir o registro.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.users.create({
      username,
      displayName: dto.displayName,
      email: dto.email,
      passwordHash,
    });

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return this.buildAuthResult(user);
  }

  async refresh(userId: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    return this.buildAuthResult(user);
  }

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_TTL',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    };
    const refreshOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_TTL',
        '7d',
      ) as JwtSignOptions['expiresIn'],
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, accessOptions),
      this.jwt.signAsync(payload, refreshOptions),
    ]);

    return { user: this.toPublicUser(user), accessToken, refreshToken };
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      avatarKey: user.avatarKey,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
