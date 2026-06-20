import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { resolveUploadTmpDir } from '../posts/upload.config';

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function buildAvatarMulterOptions() {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, resolveUploadTmpDir(process.env.UPLOAD_TMP_DIR));
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        cb(null, `avatar-${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (
      _req: Express.Request,
      file: Express.Multer.File,
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED.has(ext)) {
        cb(
          new BadRequestException(
            'Formato de imagem não suportado (use JPG, PNG ou WebP).',
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}
