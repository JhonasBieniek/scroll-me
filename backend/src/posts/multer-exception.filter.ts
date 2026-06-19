import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MulterExceptionFilter.name);

  catch(error: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const httpError: HttpException =
      error.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeException(
            'Arquivo excede o tamanho máximo permitido.',
          )
        : new BadRequestException(`Upload inválido: ${error.message}`);

    this.logger.warn(
      `${request.method} ${request.url} → ${httpError.getStatus()}: ${error.code} ${error.message}`,
    );

    response.status(httpError.getStatus()).json(httpError.getResponse());
  }
}
