import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const AUTH_ENDPOINT = /\/auth\/(login|register|refresh|logout)$/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const withAuth = (token: string | null): HttpRequest<unknown> =>
    req.clone({
      withCredentials: true,
      setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    });

  return next(withAuth(auth.accessToken)).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        error instanceof HttpErrorResponse && error.status === 401;

      if (!isUnauthorized || AUTH_ENDPOINT.test(req.url)) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap((res) => next(withAuth(res.accessToken))),
        catchError((refreshError: unknown) => throwError(() => refreshError)),
      );
    }),
  );
};
