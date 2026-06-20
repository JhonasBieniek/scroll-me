import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { UserProfile } from './users.models';

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
