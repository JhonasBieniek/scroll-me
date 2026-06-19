import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { Options } from 'multer';
import type { Request } from 'express';

const DEFAULT_TMP_DIR = '/tmp/uploads';
const DEFAULT_MAX_UPLOAD_MB = 50;
const ALLOWED_EXTENSION = '.mp4';
const ALLOWED_MIMETYPES: ReadonlySet<string> = new Set([
  'video/mp4',
  'application/mp4',
]);

export function resolveUploadTmpDir(configured?: string | null): string {
  const dir =
    configured && configured.trim().length > 0 ? configured : DEFAULT_TMP_DIR;
  return dir;
}

export function resolveMaxUploadBytes(configured?: string | null): number {
  const parsed = configured ? Number.parseInt(configured, 10) : NaN;
  const mb =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}

export function isAllowedVideo(
  originalname: string,
  mimetype: string,
): boolean {
  const ext = extname(originalname).toLowerCase();
  return ext === ALLOWED_EXTENSION && ALLOWED_MIMETYPES.has(mimetype);
}

export function buildMulterOptions(): Options {
  const tmpDir = resolveUploadTmpDir(process.env.UPLOAD_TMP_DIR);
  const maxBytes = resolveMaxUploadBytes(process.env.MAX_UPLOAD_MB);

  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        try {
          mkdirSync(tmpDir, { recursive: true });
          cb(null, tmpDir);
        } catch (error) {
          cb(
            error instanceof Error ? error : new Error('mkdir falhou'),
            tmpDir,
          );
        }
      },
      filename: (_req, _file, cb) => {
        cb(null, `${randomUUID()}${ALLOWED_EXTENSION}`);
      },
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (!isAllowedVideo(file.originalname, file.mimetype)) {
        cb(
          new BadRequestException(
            'Apenas arquivos .mp4 (video/mp4) são aceitos.',
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}
