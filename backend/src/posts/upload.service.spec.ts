import { rm } from 'node:fs/promises';
import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Post } from '@prisma/client';
import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { PostsService } from './posts.service';
import { UploadService, UploadedFile } from './upload.service';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

const rmMock = rm as jest.MockedFunction<typeof rm>;

describe('UploadService', () => {
  let service: UploadService;
  let media: { transcodeToHls: jest.Mock };
  let storage: { uploadHlsBundle: jest.Mock; uploadFile: jest.Mock };
  let posts: { create: jest.Mock };

  const file: UploadedFile = {
    path: '/tmp/uploads/original-abc.mp4',
    originalname: 'demo.mp4',
    size: 1024,
  };

  const createdPost: Post = {
    id: 'fixed-id',
    userId: 'user-1',
    caption: 'Demo',
    videoManifestUrl: 'posts/fixed-id/index.m3u8',
    thumbnailKey: 'posts/fixed-id/thumb.jpg',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    media = {
      transcodeToHls: jest.fn().mockResolvedValue({
        manifestPath: 'x',
        thumbnailPath: '/tmp/thumb.jpg',
      }),
    };
    storage = {
      uploadHlsBundle: jest.fn().mockResolvedValue('posts/fixed-id/index.m3u8'),
      uploadFile: jest.fn().mockResolvedValue(undefined),
    };
    posts = { create: jest.fn().mockResolvedValue(createdPost) };
    const config = {
      get: jest.fn().mockReturnValue('/tmp/uploads'),
    } as unknown as ConfigService;

    service = new UploadService(
      media as unknown as MediaService,
      storage as unknown as StorageService,
      posts as unknown as PostsService,
      config,
    );
  });

  it('processa upload e remove temporários no sucesso', async () => {
    const result = await service.process({
      file,
      userId: 'user-1',
      caption: 'Demo',
    });

    expect(result).toEqual(createdPost);
    expect(rmMock).toHaveBeenCalled();
  });

  it('remove temporários quando ffmpeg falha', async () => {
    media.transcodeToHls.mockRejectedValue(new Error('ffmpeg crash'));

    await expect(
      service.process({ file, userId: 'user-1', caption: 'Demo' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(rmMock).toHaveBeenCalled();
  });

  it('preserva HttpException do R2 (503)', async () => {
    storage.uploadHlsBundle.mockRejectedValue(
      new ServiceUnavailableException('Armazenamento R2 não configurado.'),
    );

    await expect(
      service.process({ file, userId: 'user-1', caption: 'Demo' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejeita limpeza quando caminho está fora do tmp root', async () => {
    await expect(
      service.process({
        file: { ...file, path: '/etc/passwd' },
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
