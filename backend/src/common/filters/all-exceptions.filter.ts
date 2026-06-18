import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
}

const RATE_LIMIT_MESSAGE = 'Muitas tentativas. Tente novamente em instantes.';
const INTERNAL_MESSAGE = 'Erro interno do servidor.';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  private get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body, internal } = this.resolve(exception);

    const where = `${request.method} ${request.url} → ${status}`;
    if (status >= 500) {
      this.logger.error(where, internal);
    } else {
      this.logger.warn(`${where}: ${body.message}`);
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    body: ErrorBody;
    internal: string;
  } {
    if (exception instanceof ThrottlerException) {
      const status = HttpStatus.TOO_MANY_REQUESTS;
      return {
        status,
        body: {
          statusCode: status,
          message: RATE_LIMIT_MESSAGE,
          error: 'Too Many Requests',
        },
        internal: 'ThrottlerException',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: this.normalizeHttp(status, exception.getResponse()),
        internal: exception.stack ?? exception.message,
      };
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const realMessage =
      exception instanceof Error ? exception.message : String(exception);
    return {
      status,
      body: {
        statusCode: status,
        message: this.isProduction ? INTERNAL_MESSAGE : realMessage,
        error: 'Internal Server Error',
      },
      internal:
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
    };
  }

  private normalizeHttp(status: number, res: string | object): ErrorBody {
    if (typeof res === 'string') {
      return { statusCode: status, message: res };
    }

    const obj = res as Record<string, unknown>;
    const rawMessage = obj['message'];
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : 'Erro na requisição.';
    const error = typeof obj['error'] === 'string' ? obj['error'] : undefined;

    return error
      ? { statusCode: status, message, error }
      : { statusCode: status, message };
  }
}
