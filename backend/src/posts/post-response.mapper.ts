import { StorageService } from '../storage/storage.service';
import { PostWithMeta } from './posts.service';

export interface PostResponse {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export async function mapPostToResponse(
  post: PostWithMeta,
  storage: StorageService,
): Promise<PostResponse> {
  const thumbnailUrl = post.thumbnailKey
    ? await storage.getPresignedUrl(post.thumbnailKey)
    : null;
  const avatarUrl = post.author.avatarKey
    ? await storage.getPresignedUrl(post.author.avatarKey)
    : null;

  return {
    id: post.id,
    caption: post.caption,
    thumbnailUrl,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    likedByMe: post.likedByMe,
    commentCount: post.commentCount,
    author: {
      username: post.author.username,
      displayName: post.author.displayName,
      avatarUrl,
    },
  };
}

export async function mapPostsToResponse(
  posts: PostWithMeta[],
  storage: StorageService,
): Promise<PostResponse[]> {
  return Promise.all(posts.map((post) => mapPostToResponse(post, storage)));
}
