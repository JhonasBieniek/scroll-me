import { rewriteHlsManifestWithPresignedSegments } from './hls-manifest.util';

describe('rewriteHlsManifestWithPresignedSegments', () => {
  it('preserva tags e assina linhas de segmento relativas', async () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      'seg_000.ts',
      'seg_001.ts',
    ].join('\n');

    const signKey = jest.fn((key: string) =>
      Promise.resolve(`https://signed/${key}`),
    );

    const result = await rewriteHlsManifestWithPresignedSegments(
      body,
      'posts/p1/',
      signKey,
    );

    expect(result).toContain('#EXTM3U');
    expect(result).toContain('https://signed/posts/p1/seg_000.ts');
    expect(signKey).toHaveBeenCalledTimes(2);
  });

  it('não re-assina URIs absolutas http(s)', async () => {
    const body = 'https://cdn.example/seg_000.ts';
    const signKey = jest.fn();

    const result = await rewriteHlsManifestWithPresignedSegments(
      body,
      'posts/p1/',
      signKey,
    );

    expect(result).toBe(body);
    expect(signKey).not.toHaveBeenCalled();
  });
});
