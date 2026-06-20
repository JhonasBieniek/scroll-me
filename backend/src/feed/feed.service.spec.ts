import { PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  it('following usa authorIds de getFollowingIds', async () => {
    const users: jest.Mocked<Pick<UsersService, 'getFollowingIds'>> = {
      getFollowingIds: jest.fn().mockResolvedValue(['author-1', 'author-2']),
    };
    const posts: jest.Mocked<Pick<PostsService, 'list'>> = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const service = new FeedService(
      users as unknown as UsersService,
      posts as unknown as PostsService,
    );

    await service.following('viewer-1', { take: 5 });

    expect(users.getFollowingIds).toHaveBeenCalledWith('viewer-1');
    expect(posts.list).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        authorIds: ['author-1', 'author-2'],
      }),
      'viewer-1',
    );
  });

  it('following retorna vazio quando não segue ninguém', async () => {
    const users: jest.Mocked<Pick<UsersService, 'getFollowingIds'>> = {
      getFollowingIds: jest.fn().mockResolvedValue([]),
    };
    const posts: jest.Mocked<Pick<PostsService, 'list'>> = {
      list: jest.fn(),
    };
    const service = new FeedService(
      users as unknown as UsersService,
      posts as unknown as PostsService,
    );

    const page = await service.following('viewer-1', {});

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(posts.list).not.toHaveBeenCalled();
  });

  it('discover inclui posts do viewer e passa viewerId', async () => {
    const users: jest.Mocked<Pick<UsersService, 'getFollowingIds'>> = {
      getFollowingIds: jest.fn(),
    };
    const posts: jest.Mocked<Pick<PostsService, 'list'>> = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const service = new FeedService(
      users as unknown as UsersService,
      posts as unknown as PostsService,
    );

    await service.discover('user-1', { take: 5 });

    expect(posts.list).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, excludePostIds: [] }),
      'user-1',
    );
    const listArg = posts.list.mock.calls[0][0];
    expect(listArg).not.toHaveProperty('excludeUserId');
  });
});
