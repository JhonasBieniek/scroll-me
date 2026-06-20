import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { CommentSummary, CommentsPage } from './comments.models';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listByPost(
    postId: string,
    cursor?: string,
    take = 20,
  ): Observable<CommentsPage> {
    let params = new HttpParams().set('take', String(take));
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<CommentsPage>(
      `${this.baseUrl}/posts/${postId}/comments`,
      { params, withCredentials: true },
    );
  }

  addComment(postId: string, body: string): Observable<CommentSummary> {
    return this.http.post<CommentSummary>(
      `${this.baseUrl}/posts/${postId}/comments`,
      { body },
      { withCredentials: true },
    );
  }

  deleteComment(commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/comments/${commentId}`, {
      withCredentials: true,
    });
  }
}
