import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Post } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { objectKeyPrefix, StorageService } from '../storage/storage.service';
import {
  DEFAULT_FEED_PAGE_SIZE,
  MAX_FEED_PAGE_SIZE,
} from '../feed/dto/feed-query.dto';

export interface CreatePostInput {
  id: string;
  userId: string;
  caption: string;
  videoManifestUrl: string;
  thumbnailKey?: string;
}

export interface ListPostsInput {
  cursor?: string;
  take?: number;
  userId?: string;
  excludeUserId?: string;
  authorIds?: string[];
  excludePostIds?: string[];
}

export interface PostWithMeta extends Post {
  likeCount: number;
  likedByMe: boolean;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarKey: string | null;
  };
}

export interface PostsPage {
  items: PostWithMeta[];
  nextCursor: string | null;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  create(input: CreatePostInput): Promise<Post> {
    return this.prisma.post.create({
      data: {
        id: input.id,
        userId: input.userId,
        caption: input.caption,
        videoManifestUrl: input.videoManifestUrl,
        thumbnailKey: input.thumbnailKey ?? null,
      },
    });
  }

  findById(id: string): Promise<Post | null> {
    return this.prisma.post.findUnique({ where: { id } });
  }

  async list(input: ListPostsInput = {}): Promise<PostsPage> {
    const take = this.normalizeTake(input.take);
    const where = this.buildWhere(input);

    const rows = await this.prisma.post.findMany({
      where,
      take: take + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    const items: PostWithMeta[] = slice.map((row) => {
      const { user, ...post } = row;
      return {
        ...post,
        likeCount: 0,
        likedByMe: false,
        author: user,
      };
    });

    return { items, nextCursor };
  }

  async getOrFail(id: string): Promise<Post> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException('Post não encontrado.');
    }
    return post;
  }

  async getWithMeta(postId: string): Promise<PostWithMeta | null> {
    const row = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    const { user, ...post } = row;
    return {
      ...post,
      likeCount: 0,
      likedByMe: false,
      author: user,
    };
  }

  async deleteOwned(postId: string, userId: string): Promise<Post> {
    const post = await this.getOrFail(postId);
    if (post.userId !== userId) {
      throw new ForbiddenException('Sem permissão para excluir este post.');
    }
    const deleted = await this.prisma.post.delete({ where: { id: postId } });
    const prefix = objectKeyPrefix(post.videoManifestUrl);
    if (prefix) {
      await this.storage.deletePrefix(prefix);
    }
    return deleted;
  }

  private buildWhere(input: ListPostsInput): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (input.userId) {
      where.userId = input.userId;
    }
    if (input.excludeUserId) {
      where.userId = { not: input.excludeUserId };
    }
    if (input.authorIds && input.authorIds.length > 0) {
      where.userId = { in: input.authorIds };
    }
    if (input.excludePostIds && input.excludePostIds.length > 0) {
      where.id = { notIn: input.excludePostIds };
    }
    return where;
  }

  private normalizeTake(take?: number): number {
    if (take === undefined || !Number.isFinite(take)) {
      return DEFAULT_FEED_PAGE_SIZE;
    }
    return Math.min(Math.max(Math.trunc(take), 1), MAX_FEED_PAGE_SIZE);
  }
}
