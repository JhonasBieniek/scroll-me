export interface CommentAuthor {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentSummary {
  id: string;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

export interface CommentsPage {
  items: CommentSummary[];
  nextCursor: string | null;
}
