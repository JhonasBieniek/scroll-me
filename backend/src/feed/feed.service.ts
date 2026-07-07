import { Injectable } from '@nestjs/common';
import { PostsPage, PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import { DEFAULT_FEED_PAGE_SIZE } from './dto/feed-query.dto';

export interface FeedQuery {
  cursor?: string;
  take?: number;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly users: UsersService,
    private readonly posts: PostsService,
  ) {}

  /** Posts de usuários que o viewer segue. */
  async following(viewerId: string, query: FeedQuery): Promise<PostsPage> {
    const authorIds = await this.users.getFollowingIds(viewerId);
    if (authorIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    return this.posts.list(
      {
        cursor: query.cursor,
        take: query.take ?? DEFAULT_FEED_PAGE_SIZE,
        authorIds,
      },
      viewerId,
    );
  }

  /**
   * Descoberta global. Inclui posts do viewer (comportamento atual do v2).
   * `excludePostIds` evita repetir itens já exibidos no bloco "following".
   */
  discover(
    viewerId: string | undefined,
    query: FeedQuery,
    excludePostIds: string[] = [],
  ): Promise<PostsPage> {
    return this.posts.list(
      {
        cursor: query.cursor,
        take: query.take ?? DEFAULT_FEED_PAGE_SIZE,
        excludePostIds,
      },
      viewerId,
    );
  }
}
