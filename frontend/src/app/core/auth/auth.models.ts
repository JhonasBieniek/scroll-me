export type UserRole = 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string | null;
  avatarKey: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  displayName: string;
  email: string;
  password: string;
}
