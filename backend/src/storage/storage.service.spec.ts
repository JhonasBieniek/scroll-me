import { readdir, stat } from 'node:fs/promises';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(() => 'STREAM'),
}));

jest.mock('node:fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
}));

const sendMock = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn((input: unknown) => ({ input })),
  GetObjectCommand: jest.fn((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example/signed'),
}));

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const statMock = stat as jest.MockedFunction<typeof stat>;
const getSignedUrlMock = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'scroll-me-media',
    PRESIGNED_URL_TTL: '900',
    UPLOAD_TMP_DIR: '/tmp/uploads',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const v = values[key];
      if (v === undefined) {
        throw new Error(`missing ${key}`);
      }
      return v;
    }),
  } as unknown as ConfigService;
}

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockResolvedValue({});
  });

  it('usa o TTL configurado', () => {
    const service = new StorageService(makeConfig());
    expect(service.presignTtlSeconds).toBe(900);
  });

  it('sobe artefatos HLS e retorna a key do manifesto', async () => {
    const service = new StorageService(makeConfig());
    readdirMock.mockResolvedValue([
      'index.m3u8',
      'seg_000.ts',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);
    statMock.mockResolvedValue({ size: 42 } as Awaited<
      ReturnType<typeof stat>
    >);

    const manifestKey = await service.uploadHlsBundle('/tmp/hls', 'posts/p1');
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(manifestKey).toBe('posts/p1/index.m3u8');
  });

  it('rejeita bundle HLS sem segmentos .ts', async () => {
    const service = new StorageService(makeConfig());
    readdirMock.mockResolvedValue(['index.m3u8'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    await expect(
      service.uploadHlsBundle('/tmp/hls', 'posts/p1'),
    ).rejects.toThrow('Nenhum segmento `.ts` gerado para upload.');
  });

  it('rejeita caminho fora do tmp root no uploadFile', async () => {
    const service = new StorageService(makeConfig());
    await expect(
      service.uploadFile('/etc/passwd', 'evil', 'text/plain'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança ServiceUnavailable sem credenciais R2', async () => {
    const service = new StorageService(
      makeConfig({ R2_ENDPOINT: '', R2_ACCESS_KEY_ID: '' }),
    );
    await expect(
      service.getPresignedUrl('posts/p1/index.m3u8'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('assina URL com TTL configurado', async () => {
    const service = new StorageService(makeConfig());
    const url = await service.getPresignedUrl('posts/p1/index.m3u8');
    expect(url).toBe('https://r2.example/signed');
    const [, , options] = getSignedUrlMock.mock.calls[0];
    expect(options).toEqual({ expiresIn: 900 });
  });
});
