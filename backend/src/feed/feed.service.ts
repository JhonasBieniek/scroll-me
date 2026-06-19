import { Injectable } from '@nestjs/common';
import { PostsPage, PostsService } from '../posts/posts.service';
import { DEFAULT_FEED_PAGE_SIZE } from './dto/feed-query.dto';

export interface FeedQuery {
  cursor?: string;
  take?: number;
}

@Injectable()
export class FeedService {
  constructor(private readonly posts: PostsService) {}

  /** Sem tabela Follow ainda — retorna feed vazio. */
  following(viewerId: string, query: FeedQuery): Promise<PostsPage> {
    void viewerId;
    void query;
    return Promise.resolve({ items: [], nextCursor: null });
  }

  discover(
    viewerId: string,
    query: FeedQuery,
    excludePostIds: string[] = [],
  ): Promise<PostsPage> {
    void viewerId;
    return this.posts.list({
      cursor: query.cursor,
      take: query.take ?? DEFAULT_FEED_PAGE_SIZE,
      excludePostIds,
    });
  }
}
