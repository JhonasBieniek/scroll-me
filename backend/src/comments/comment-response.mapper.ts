import { StorageService } from '../storage/storage.service';
import { CommentWithAuthor } from './comments.service';

export interface CommentResponse {
  id: string;
  body: string;
  createdAt: Date;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export async function mapCommentToResponse(
  comment: CommentWithAuthor,
  storage: StorageService,
): Promise<CommentResponse> {
  const avatarUrl = comment.author.avatarKey
    ? await storage.getPresignedUrl(comment.author.avatarKey)
    : null;

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    author: {
      username: comment.author.username,
      displayName: comment.author.displayName,
      avatarUrl,
    },
  };
}

export async function mapCommentsToResponse(
  comments: CommentWithAuthor[],
  storage: StorageService,
): Promise<CommentResponse[]> {
  return Promise.all(
    comments.map((comment) => mapCommentToResponse(comment, storage)),
  );
}
