import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Post } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: {
    post: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    like: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const viewerId = '11111111-1111-1111-1111-111111111111';
  const basePost: Post = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: viewerId,
    caption: 'Demo',
    videoManifestUrl: 'posts/22222222-2222-2222-2222-222222222222/index.m3u8',
    thumbnailKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const author = {
    id: viewerId,
    username: 'demo',
    displayName: 'Demo',
    avatarKey: null,
  };

  beforeEach(() => {
    prisma = {
      post: {
        create: jest.fn().mockResolvedValue(basePost),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn().mockResolvedValue(basePost),
      },
      like: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new PostsService(
      prisma as unknown as PrismaService,
      { deletePrefix: jest.fn() } as unknown as StorageService,
    );
  });

  const makeRow = (
    id: string,
    likedByViewer = false,
    likeCount = 2,
    commentCount = 1,
  ) => ({
    ...basePost,
    id,
    user: author,
    _count: { likes: likeCount, comments: commentCount },
    ...(likedByViewer ? { likes: [{ userId: viewerId }] } : { likes: [] }),
  });

  it('cria post passando caption e id controlado', async () => {
    const result = await service.create({
      id: basePost.id,
      userId: basePost.userId,
      caption: 'Demo',
      videoManifestUrl: basePost.videoManifestUrl,
    });

    expect(prisma.post.create).toHaveBeenCalled();
    expect(result).toEqual(basePost);
  });

  it('getOrFail lança NotFound quando o post não existe', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.getOrFail('inexistente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list com viewerId inclui likeCount, commentCount e likedByMe', async () => {
    prisma.post.findMany.mockResolvedValue([makeRow('a', true, 5, 3)]);

    const page = await service.list({ take: 10 }, viewerId);

    expect(page.items[0]).toMatchObject({
      id: 'a',
      likeCount: 5,
      commentCount: 3,
      likedByMe: true,
    });
  });

  it('like é idempotente via upsert', async () => {
    prisma.post.findUnique.mockResolvedValue(basePost);
    await service.like(basePost.id, viewerId);
    expect(prisma.like.upsert).toHaveBeenCalledWith({
      where: { userId_postId: { userId: viewerId, postId: basePost.id } },
      create: { userId: viewerId, postId: basePost.id },
      update: {},
    });
  });

  it('deleteOwned lança Forbidden para não-dono', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...basePost,
      userId: '99999999-9999-9999-9999-999999999999',
    });
    await expect(
      service.deleteOwned(basePost.id, viewerId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
