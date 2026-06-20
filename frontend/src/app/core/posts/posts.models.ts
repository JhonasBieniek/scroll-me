export interface PostAuthor {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostSummary {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  author: PostAuthor;
}

export interface FeedPage {
  items: PostSummary[];
  nextCursor: string | null;
}

export interface ManifestResponse {
  playlist: string;
  expiresIn: number;
}

export interface UploadPostPayload {
  caption?: string;
  video: File;
}

export type UploadEvent =
  | { type: 'progress'; progress: number }
  | { type: 'done'; post: PostSummary };
