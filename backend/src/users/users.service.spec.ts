import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    post: { count: jest.Mock };
    follow: {
      findUnique: jest.Mock;
      count: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      post: { count: jest.fn() },
      follow: {
        findUnique: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('getCounts retorna posts, followers e following', async () => {
    prisma.post.count.mockResolvedValue(3);
    prisma.follow.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);

    const counts = await service.getCounts(userId);

    expect(counts).toEqual({ posts: 3, followers: 10, following: 5 });
  });

  it('isFollowing retorna true quando relação existe', async () => {
    prisma.follow.findUnique.mockResolvedValue({
      followerId: userId,
      followingId: otherId,
    });
    await expect(service.isFollowing(userId, otherId)).resolves.toBe(true);
  });

  it('follow faz upsert idempotente', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: otherId });
    prisma.follow.upsert.mockResolvedValue({});

    await service.follow(userId, otherId);

    expect(prisma.follow.upsert).toHaveBeenCalledWith({
      where: {
        followerId_followingId: { followerId: userId, followingId: otherId },
      },
      create: { followerId: userId, followingId: otherId },
      update: {},
    });
  });

  it('follow bloqueia seguir a si mesmo', async () => {
    await expect(service.follow(userId, userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.follow.upsert).not.toHaveBeenCalled();
  });

  it('unfollow remove relação', async () => {
    prisma.follow.deleteMany.mockResolvedValue({ count: 1 });
    await service.unfollow(userId, otherId);
    expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
      where: { followerId: userId, followingId: otherId },
    });
  });

  it('getFollowingIds retorna lista de IDs', async () => {
    prisma.follow.findMany.mockResolvedValue([
      { followingId: otherId },
      { followingId: '33333333-3333-3333-3333-333333333333' },
    ]);
    await expect(service.getFollowingIds(userId)).resolves.toEqual([
      otherId,
      '33333333-3333-3333-3333-333333333333',
    ]);
  });

  it('getByUsernameOrFail lança NotFound quando inexistente', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getByUsernameOrFail('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
