import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Post } from '@prisma/client';
import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { assertPathUnderRoot } from '../common/safe-path';
import { resolveUploadTmpDir } from './upload.config';
import { CreatePostInput, PostsService } from './posts.service';

export interface UploadedFile {
  path: string;
  originalname: string;
  size: number;
}

export interface ProcessUploadInput {
  file: UploadedFile;
  userId: string;
  caption?: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly posts: PostsService,
    private readonly config: ConfigService,
  ) {}

  async process(input: ProcessUploadInput): Promise<Post> {
    const postId = randomUUID();
    const tmpRoot = resolveUploadTmpDir(
      this.config.get<string>('UPLOAD_TMP_DIR'),
    );
    const jobDir = join(tmpRoot, postId);
    const hlsDir = join(jobDir, 'hls');

    try {
      await mkdir(hlsDir, { recursive: true });

      const { thumbnailPath } = await this.media.transcodeToHls(
        input.file.path,
        hlsDir,
      );

      const keyPrefix = `posts/${postId}`;
      const manifestKey = await this.storage.uploadHlsBundle(hlsDir, keyPrefix);

      const thumbnailKey = `${keyPrefix}/thumb.jpg`;
      await this.storage.uploadFile(thumbnailPath, thumbnailKey, 'image/jpeg');

      const data: CreatePostInput = {
        id: postId,
        userId: input.userId,
        caption: input.caption?.trim() ?? '',
        videoManifestUrl: manifestKey,
        thumbnailKey,
      };
      const post = await this.posts.create(data);

      this.logger.log(`Post ${postId} criado (manifesto: ${manifestKey}).`);
      return post;
    } catch (error) {
      this.logger.error(
        `Falha ao processar upload ${postId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Não foi possível processar o vídeo enviado.',
      );
    } finally {
      await this.cleanup(input.file.path, jobDir);
    }
  }

  private async cleanup(originalPath: string, jobDir: string): Promise<void> {
    const tmpRoot = resolveUploadTmpDir(
      this.config.get<string>('UPLOAD_TMP_DIR'),
    );
    const safeOriginalPath = assertPathUnderRoot(tmpRoot, originalPath);
    const safeJobDir = assertPathUnderRoot(tmpRoot, jobDir);
    await Promise.allSettled([
      rm(safeOriginalPath, { force: true }),
      rm(safeJobDir, { recursive: true, force: true }),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.warn(
            `Falha na limpeza temporária: ${String(result.reason)}`,
          );
        }
      }
    });
  }
}
