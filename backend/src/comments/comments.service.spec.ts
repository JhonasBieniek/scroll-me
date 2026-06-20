import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let posts: jest.Mocked<Pick<PostsService, 'getOrFail'>>;
  let prisma: {
    comment: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  const postId = '22222222-2222-2222-2222-222222222222';
  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '33333333-3333-3333-3333-333333333333';

  const author = {
    id: userId,
    username: 'demo',
    displayName: 'Demo',
    avatarKey: null,
  };

  beforeEach(() => {
    posts = { getOrFail: jest.fn().mockResolvedValue({ id: postId }) };
    prisma = {
      comment: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CommentsService(
      prisma as unknown as PrismaService,
      posts as unknown as PostsService,
    );
  });

  it('create persiste comentário após validar post', async () => {
    const created = {
      id: '44444444-4444-4444-4444-444444444444',
      postId,
      userId,
      body: 'Olá!',
      createdAt: new Date(),
      user: author,
    };
    prisma.comment.create.mockResolvedValue(created);

    const result = await service.create(postId, userId, 'Olá!');

    expect(posts.getOrFail).toHaveBeenCalledWith(postId);
    expect(result.body).toBe('Olá!');
    expect(result.author.username).toBe('demo');
  });

  it('listByPost retorna página com cursor', async () => {
    prisma.comment.findMany.mockResolvedValue([
      {
        id: 'a',
        postId,
        userId,
        body: 'Um',
        createdAt: new Date(),
        user: author,
      },
      {
        id: 'b',
        postId,
        userId,
        body: 'Dois',
        createdAt: new Date(),
        user: author,
      },
      {
        id: 'c',
        postId,
        userId,
        body: 'Três',
        createdAt: new Date(),
        user: author,
      },
    ]);

    const page = await service.listByPost({ postId, take: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('b');
  });

  it('deleteOwned lança Forbidden para não-dono', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'x',
      postId,
      userId: otherUserId,
      body: 'x',
      createdAt: new Date(),
    });

    await expect(service.deleteOwned('x', userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  it('deleteOwned lança NotFound quando inexistente', async () => {
    prisma.comment.findUnique.mockResolvedValue(null);
    await expect(service.deleteOwned('x', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
