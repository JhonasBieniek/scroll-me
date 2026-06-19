import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertPathUnderRoot } from '../common/safe-path';
import { resolveUploadTmpDir } from '../posts/upload.config';
import { rewriteHlsManifestWithPresignedSegments } from './hls-manifest.util';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const DEFAULT_PRESIGNED_TTL_SECONDS = 1800;

export function objectKeyPrefix(key: string): string {
  return key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  get presignTtlSeconds(): number {
    const raw = this.config.get<string>('PRESIGNED_URL_TTL');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_PRESIGNED_TTL_SECONDS;
  }

  async uploadHlsBundle(localDir: string, keyPrefix: string): Promise<string> {
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');

    const entries = await readdir(localDir);
    const hlsFiles = entries.filter(
      (name) => this.contentTypeFor(name) !== null,
    );

    if (hlsFiles.length === 0) {
      throw new InternalServerErrorException(
        'Nenhum artefato HLS gerado para upload.',
      );
    }

    const segmentFiles = hlsFiles.filter((name) => name.endsWith('.ts'));
    if (segmentFiles.length === 0) {
      throw new InternalServerErrorException(
        'Nenhum segmento `.ts` gerado para upload.',
      );
    }

    let manifestKey: string | null = null;

    for (const fileName of hlsFiles) {
      const filePath = join(localDir, fileName);
      const { size } = await stat(filePath);
      const key = `${keyPrefix}/${fileName}`;
      const contentType = this.contentTypeFor(fileName);

      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentLength: size,
            ContentType: contentType ?? 'application/octet-stream',
          }),
        );
      } catch (error) {
        this.logger.error(
          `Falha ao enviar ${key} para R2 (${size} bytes): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }

      if (fileName.endsWith('.m3u8')) {
        manifestKey = key;
      }
    }

    if (!manifestKey) {
      throw new InternalServerErrorException(
        'Bundle HLS sem manifesto `.m3u8`.',
      );
    }

    this.logger.log(
      `Upload HLS concluído (${hlsFiles.length} arquivos, ${segmentFiles.length} segmentos) em ${keyPrefix}.`,
    );
    return manifestKey;
  }

  async uploadFile(
    localPath: string,
    key: string,
    contentType: string,
  ): Promise<void> {
    const tmpRoot = resolveUploadTmpDir(
      this.config.get<string>('UPLOAD_TMP_DIR'),
    );
    const safePath = assertPathUnderRoot(tmpRoot, localPath);
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');
    const { size } = await stat(safePath);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(safePath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');
    let continuationToken: string | undefined;

    do {
      const listing = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (listing.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((key): key is string => Boolean(key));

      await Promise.all(
        keys.map((key) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
        ),
      );

      continuationToken = listing.IsTruncated
        ? listing.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async getPresignedUrl(key: string): Promise<string> {
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: this.presignTtlSeconds },
    );
  }

  async getSignedHlsPlaylist(manifestKey: string): Promise<string> {
    const client = this.getClient();
    const bucket = this.config.getOrThrow<string>('R2_BUCKET');

    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: manifestKey }),
    );

    const body = await response.Body?.transformToString('utf-8');
    if (!body) {
      throw new InternalServerErrorException(
        'Manifesto HLS vazio ou inacessível.',
      );
    }

    const prefix = objectKeyPrefix(manifestKey);

    return rewriteHlsManifestWithPresignedSegments(body, prefix, (segmentKey) =>
      this.getPresignedUrl(segmentKey),
    );
  }

  private contentTypeFor(fileName: string): string | null {
    const name = basename(fileName).toLowerCase();
    if (name.endsWith('.m3u8')) {
      return CONTENT_TYPES['.m3u8'];
    }
    if (name.endsWith('.ts')) {
      return CONTENT_TYPES['.ts'];
    }
    return null;
  }

  private getClient(): S3Client {
    if (this.client) {
      return this.client;
    }

    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.resolveEndpoint();

    if (!accessKeyId || !secretAccessKey || !endpoint) {
      throw new ServiceUnavailableException(
        'Armazenamento R2 não configurado (defina R2_ENDPOINT/R2_ACCOUNT_ID e credenciais).',
      );
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.client;
  }

  private resolveEndpoint(): string | null {
    const explicit = this.config.get<string>('R2_ENDPOINT');
    if (explicit && explicit.trim().length > 0) {
      return explicit.trim();
    }
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    if (accountId && accountId.trim().length > 0) {
      return `https://${accountId.trim()}.r2.cloudflarestorage.com`;
    }
    return null;
  }
}
