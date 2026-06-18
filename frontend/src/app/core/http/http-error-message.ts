import { HttpErrorResponse } from '@angular/common/http';

export const RATE_LIMIT_MESSAGE =
  'Muitas tentativas. Tente novamente em instantes.';

export function friendlyHttpError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.status === 429) {
    return RATE_LIMIT_MESSAGE;
  }
  return fallback;
}
