import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const shellGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.canBrowse()) {
    return of(true);
  }

  return auth.refresh().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
