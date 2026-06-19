import {
  isAllowedVideo,
  resolveMaxUploadBytes,
  resolveUploadTmpDir,
} from './upload.config';

describe('upload.config', () => {
  describe('isAllowedVideo', () => {
    it('aceita .mp4 com mimetype video/mp4', () => {
      expect(isAllowedVideo('demo.mp4', 'video/mp4')).toBe(true);
    });

    it('rejeita extensão não permitida', () => {
      expect(isAllowedVideo('demo.mov', 'video/mp4')).toBe(false);
    });
  });

  describe('resolveMaxUploadBytes', () => {
    it('usa o valor configurado (MB → bytes)', () => {
      expect(resolveMaxUploadBytes('10')).toBe(10 * 1024 * 1024);
    });

    it('cai no padrão de 50MB com valor inválido', () => {
      expect(resolveMaxUploadBytes(undefined)).toBe(50 * 1024 * 1024);
    });
  });

  describe('resolveUploadTmpDir', () => {
    it('cai no padrão /tmp/uploads quando ausente', () => {
      expect(resolveUploadTmpDir(undefined)).toBe('/tmp/uploads');
    });
  });
});
