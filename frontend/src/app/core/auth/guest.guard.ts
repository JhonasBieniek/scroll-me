import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const guestGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return of(router.createUrlTree(['/']));
  }

  return auth.refresh().pipe(
    map(() => router.createUrlTree(['/'])),
    catchError(() => of(true)),
  );
};
