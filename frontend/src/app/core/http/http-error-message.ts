import { HttpErrorResponse } from '@angular/common/http';

export const RATE_LIMIT_MESSAGE =
  'Muitas tentativas. Tente novamente em instantes.';

export const SESSION_EXPIRED_MESSAGE =
  'Sessão expirada. Faça login novamente e tente publicar.';

export function friendlyHttpError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  if (error.status === 401 || error.status === 403) {
    return SESSION_EXPIRED_MESSAGE;
  }

  if (error.status === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  if (error.status === 503) {
    return 'Armazenamento indisponível. Verifique a configuração R2 no servidor.';
  }

  if (error.status === 0) {
    return 'Não foi possível conectar à API. Confira se o container api está rodando (porta 3000).';
  }

  const body = error.error;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body['message'];
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}
