import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidUsername, normalizeUsername } from './username.util';

export interface CreateUserInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash?: string | null;
  role?: Role;
  authProvider?: AuthProvider;
  githubId?: string | null;
}

export interface GithubUserInput {
  githubId: string;
  login: string;
  displayName: string;
  email: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  username?: string;
  avatarKey?: string | null;
}

export interface ProfileCounts {
  posts: number;
  followers: number;
  following: number;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
    });
  }

  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  async getByUsernameOrFail(username: string): Promise<User> {
    const user = await this.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  findByGithubId(githubId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { githubId } });
  }

  async findOrCreateFromGithub(input: GithubUserInput): Promise<User> {
    const existing = await this.findByGithubId(input.githubId);
    if (existing) {
      return existing;
    }

    const emailOwner = await this.findByEmail(input.email);
    if (emailOwner) {
      if (emailOwner.githubId && emailOwner.githubId !== input.githubId) {
        throw new ConflictException('Não foi possível concluir o login.');
      }
      return this.prisma.user.update({
        where: { id: emailOwner.id },
        data: {
          githubId: input.githubId,
          authProvider: AuthProvider.GITHUB,
        },
      });
    }

    const username = await this.allocateGithubUsername(input.login);
    return this.create({
      username,
      displayName: input.displayName,
      email: input.email,
      authProvider: AuthProvider.GITHUB,
      githubId: input.githubId,
      passwordHash: null,
    });
  }

  private async allocateGithubUsername(login: string): Promise<string> {
    const base = this.sanitizeGithubLogin(login);
    let candidate = base;
    let suffix = 0;

    while (await this.findByUsername(candidate)) {
      suffix += 1;
      const suffixText = String(suffix);
      const trimmedBase = base.slice(0, Math.max(3, 30 - suffixText.length));
      candidate = `${trimmedBase}${suffixText}`;
    }

    return candidate;
  }

  private sanitizeGithubLogin(login: string): string {
    const normalized = normalizeUsername(
      login.replace(/[^a-zA-Z0-9_.]/g, '_'),
    );
    if (isValidUsername(normalized)) {
      return normalized;
    }
    const fallback = normalizeUsername(`gh_${login.replace(/[^a-zA-Z0-9]/g, '')}`);
    if (isValidUsername(fallback)) {
      return fallback;
    }
    return `gh_user_${Date.now().toString(36).slice(-6)}`;
  }

  async create(data: CreateUserInput): Promise<User> {
    const username = normalizeUsername(data.username);
    if (!isValidUsername(username)) {
      throw new ConflictException('Username inválido.');
    }

    const existingUsername = await this.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Não foi possível concluir o registro.');
    }

    const payload: Prisma.UserCreateInput = {
      username,
      displayName: data.displayName.trim(),
      email: data.email,
      passwordHash: data.passwordHash ?? null,
      authProvider: data.authProvider ?? AuthProvider.LOCAL,
      githubId: data.githubId ?? null,
      role: data.role ?? Role.USER,
    };
    return this.prisma.user.create({ data: payload });
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<User> {
    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) {
      data.displayName = input.displayName.trim();
    }
    if (input.bio !== undefined) {
      data.bio = input.bio;
    }
    if (input.avatarKey !== undefined) {
      data.avatarKey = input.avatarKey;
    }
    if (input.username !== undefined) {
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username)) {
        throw new ConflictException('Username inválido.');
      }
      const existing = await this.findByUsername(username);
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username já em uso.');
      }
      data.username = username;
    }
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async getCounts(userId: string): Promise<ProfileCounts> {
    const [posts, followers, following] = await Promise.all([
      this.prisma.post.count({ where: { userId } }),
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { posts, followers, following };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const row = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
    return row !== null;
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) {
      throw new ConflictException('Não é possível seguir a si mesmo.');
    }
    await this.getByIdOrFail(followingId);
    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: { followerId, followingId },
      },
      create: { followerId, followingId },
      update: {},
    });
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
  }

  /** IDs dos usuários que `followerId` segue (para montagem do feed). */
  async getFollowingIds(followerId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId },
      select: { followingId: true },
    });
    return rows.map((row) => row.followingId);
  }
}
