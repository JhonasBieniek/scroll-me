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
}
