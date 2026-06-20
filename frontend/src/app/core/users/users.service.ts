import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { FeedPage } from '../posts/posts.models';
import {
  UpdateProfilePayload,
  UserProfile,
} from './users.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  me(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/users/me`, {
      withCredentials: true,
    });
  }

  getProfile(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}`,
      { withCredentials: true },
    );
  }

  updateProfile(payload: UpdateProfilePayload): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.baseUrl}/users/me`, payload, {
      withCredentials: true,
    });
  }

  uploadAvatar(file: File): Observable<UserProfile> {
    const form = new FormData();
    form.append('avatar', file, file.name);
    return this.http.post<UserProfile>(`${this.baseUrl}/users/me/avatar`, form, {
      withCredentials: true,
    });
  }

  userPosts(
    username: string,
    cursor?: string,
    take?: number,
  ): Observable<FeedPage> {
    let params = new HttpParams();
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    if (take !== undefined) {
      params = params.set('take', String(take));
    }
    return this.http.get<FeedPage>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}/posts`,
      { params, withCredentials: true },
    );
  }

  follow(username: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}/follow`,
      {},
      { withCredentials: true },
    );
  }

  unfollow(username: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}/follow`,
      { withCredentials: true },
    );
  }
}
