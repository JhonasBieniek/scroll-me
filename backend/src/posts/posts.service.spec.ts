import { NotFoundException } from '@nestjs/common';
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
    };
  };

  const basePost: Post = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: '11111111-1111-1111-1111-111111111111',
    caption: 'Demo',
    videoManifestUrl: 'posts/22222222-2222-2222-2222-222222222222/index.m3u8',
    thumbnailKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const author = {
    id: basePost.userId,
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
      },
    };
    service = new PostsService(
      prisma as unknown as PrismaService,
      { deletePrefix: jest.fn() } as unknown as StorageService,
    );
  });

  const makeRow = (id: string) => ({
    ...basePost,
    id,
    user: author,
  });

  it('cria post passando caption e id controlado', async () => {
    const result = await service.create({
      id: basePost.id,
      userId: basePost.userId,
      caption: 'Demo',
      videoManifestUrl: basePost.videoManifestUrl,
    });

    expect(prisma.post.create).toHaveBeenCalledWith({
      data: {
        id: basePost.id,
        userId: basePost.userId,
        caption: 'Demo',
        videoManifestUrl: basePost.videoManifestUrl,
        thumbnailKey: null,
      },
    });
    expect(result).toEqual(basePost);
  });

  it('findById retorna null quando inexistente', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.findById('x')).resolves.toBeNull();
  });

  it('getOrFail lança NotFound quando o post não existe', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.getOrFail('inexistente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list detecta próxima página e devolve nextCursor', async () => {
    prisma.post.findMany.mockResolvedValue([
      makeRow('a'),
      makeRow('b'),
      makeRow('c'),
    ]);

    const page = await service.list({ take: 2 });
    expect(page.items.map((p) => p.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
    expect(page.items[0].likeCount).toBe(0);
  });
});
