import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Comment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';
import {
  DEFAULT_COMMENT_PAGE_SIZE,
  MAX_COMMENT_PAGE_SIZE,
} from './dto/list-comments-query.dto';

export interface ListCommentsInput {
  postId: string;
  cursor?: string;
  take?: number;
}

export interface CommentWithAuthor {
  id: string;
  postId: string;
  userId: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarKey: string | null;
  };
}

export interface CommentsPage {
  items: CommentWithAuthor[];
  nextCursor: string | null;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  async listByPost(input: ListCommentsInput): Promise<CommentsPage> {
    await this.posts.getOrFail(input.postId);
    const take = this.normalizeTake(input.take);

    const rows = await this.prisma.comment.findMany({
      where: { postId: input.postId },
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

    const items: CommentWithAuthor[] = slice.map((row) => {
      const { user, ...comment } = row;
      return {
        ...comment,
        author: user,
      };
    });

    return { items, nextCursor };
  }

  async create(
    postId: string,
    userId: string,
    body: string,
  ): Promise<CommentWithAuthor> {
    await this.posts.getOrFail(postId);
    const row = await this.prisma.comment.create({
      data: { postId, userId, body },
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
    const { user, ...comment } = row;
    return { ...comment, author: user };
  }

  async deleteOwned(commentId: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException(
        'Sem permissão para excluir este comentário.',
      );
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  private normalizeTake(take?: number): number {
    if (take === undefined || !Number.isFinite(take)) {
      return DEFAULT_COMMENT_PAGE_SIZE;
    }
    return Math.min(Math.max(Math.trunc(take), 1), MAX_COMMENT_PAGE_SIZE);
  }
}
