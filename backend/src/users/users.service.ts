import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidUsername, normalizeUsername } from './username.util';

export interface CreateUserInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role?: Role;
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
      passwordHash: data.passwordHash,
      role: data.role ?? Role.USER,
    };
    return this.prisma.user.create({ data: payload });
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
