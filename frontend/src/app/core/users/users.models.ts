export interface ProfileCounts {
  posts: number;
  followers: number;
  following: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  counts: ProfileCounts;
  isMe: boolean;
  isFollowing: boolean;
}
