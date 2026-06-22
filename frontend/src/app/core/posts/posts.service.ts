import {
  HttpClient,
  HttpEventType,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';
import { API_BASE_URL } from '../api.config';
import {
  FeedPage,
  ManifestResponse,
  PostSummary,
  UploadEvent,
  UploadPostPayload,
} from './posts.models';

@Injectable({ providedIn: 'root' })
export class PostsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly manifestCache = new Map<string, Observable<ManifestResponse>>();

  followingFeed(cursor?: string, take = 10): Observable<FeedPage> {
    return this.feedPage('following', cursor, take);
  }

  discoverFeed(cursor?: string, take = 10): Observable<FeedPage> {
    return this.feedPage('discover', cursor, take);
  }

  upload(payload: UploadPostPayload): Observable<UploadEvent> {
    const form = new FormData();
    if (payload.caption) {
      form.append('caption', payload.caption);
    }
    form.append('video', payload.video, payload.video.name);

    const request = new HttpRequest(
      'POST',
      `${this.baseUrl}/posts/upload`,
      form,
      { withCredentials: true, reportProgress: true },
    );

    return this.http.request<PostSummary>(request).pipe(
      filter(
        (event) =>
          event.type === HttpEventType.UploadProgress ||
          event.type === HttpEventType.Response,
      ),
      map((event): UploadEvent => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total ?? 0;
          const progress =
            total > 0 ? Math.round((event.loaded / total) * 100) : 0;
          return { type: 'progress', progress };
        }
        const response = event as HttpResponse<PostSummary>;
        if (!response.body) {
          throw new Error('Resposta de upload vazia.');
        }
        return { type: 'done', post: response.body };
      }),
    );
  }

  getManifest(postId: string): Observable<ManifestResponse> {
    let cached = this.manifestCache.get(postId);
    if (!cached) {
      cached = this.http
        .get<ManifestResponse>(`${this.baseUrl}/posts/${postId}/manifest`, {
          withCredentials: true,
        })
        .pipe(shareReplay(1));
      this.manifestCache.set(postId, cached);
    }
    return cached;
  }

  prefetchManifests(postIds: string[]): void {
    for (const postId of postIds) {
      this.getManifest(postId).subscribe();
    }
  }

  like(postId: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/posts/${postId}/like`,
      {},
      { withCredentials: true },
    );
  }

  unlike(postId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/posts/${postId}/like`, {
      withCredentials: true,
    });
  }

  private feedPage(
    kind: 'following' | 'discover',
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
    return this.http.get<FeedPage>(`${this.baseUrl}/feed/${kind}`, {
      params,
      withCredentials: true,
    });
  }
}
