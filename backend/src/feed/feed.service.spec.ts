import { PostsService } from '../posts/posts.service';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  it('following retorna vazio sem tabela Follow', async () => {
    const posts = { list: jest.fn() };
    const service = new FeedService(posts as unknown as PostsService);

    const page = await service.following('user-1', {});

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(posts.list).not.toHaveBeenCalled();
  });

  it('discover inclui posts do viewer', async () => {
    const posts = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const service = new FeedService(posts as unknown as PostsService);

    await service.discover('user-1', { take: 5 });

    expect(posts.list).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, excludePostIds: [] }),
    );
    expect(posts.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ excludeUserId: expect.anything() }),
    );
  });
});
