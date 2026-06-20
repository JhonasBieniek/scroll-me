import { BadRequestException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertPathUnderRoot,
  assertSafeBasename,
  resolvePathUnderRoot,
  safeRmUnderRoot,
} from './safe-path';

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
}));

const rmMock = rm as jest.MockedFunction<typeof rm>;

describe('assertSafeBasename', () => {
  it('aceita basename simples', () => {
    expect(assertSafeBasename('abc.mp4')).toBe('abc.mp4');
  });

  it('rejeita path completo (espera basename)', () => {
    expect(() => assertSafeBasename('/tmp/uploads/abc.mp4')).toThrow(
      BadRequestException,
    );
  });

  it('rejeita traversal no basename', () => {
    expect(() => assertSafeBasename('..')).toThrow(BadRequestException);
    expect(() => assertSafeBasename('.')).toThrow(BadRequestException);
  });

  it('rejeita separadores no basename', () => {
    expect(() => assertSafeBasename('foo/bar.mp4')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeBasename('foo\\bar.mp4')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeBasename('../etc/passwd')).toThrow(
      BadRequestException,
    );
  });
});

describe('resolvePathUnderRoot', () => {
  const root = '/tmp/uploads';

  it('reconstrói caminho sob a raiz a partir do basename', () => {
    expect(resolvePathUnderRoot(root, '/etc/passwd')).toBe(
      resolve('/tmp/uploads/passwd'),
    );
  });

  it('aceita caminho legítimo de upload', () => {
    expect(resolvePathUnderRoot(root, '/tmp/uploads/abc.mp4')).toBe(
      resolve('/tmp/uploads/abc.mp4'),
    );
  });

  it('rejeita basename .. extraído de path', () => {
    expect(() => resolvePathUnderRoot(root, '/tmp/uploads/..')).toThrow(
      BadRequestException,
    );
  });
});

describe('safeRmUnderRoot', () => {
  const root = '/tmp/uploads';

  beforeEach(() => {
    rmMock.mockClear();
  });

  it('remove apenas caminho reconstruído sob a raiz', async () => {
    await safeRmUnderRoot(root, 'passwd', { force: true });

    expect(rmMock).toHaveBeenCalledWith(resolve('/tmp/uploads/passwd'), {
      force: true,
    });
  });
});

describe('assertPathUnderRoot', () => {
  const root = '/tmp/uploads';

  it('aceita caminho exatamente na raiz', () => {
    expect(assertPathUnderRoot(root, '/tmp/uploads')).toBe(
      resolve('/tmp/uploads'),
    );
  });

  it('aceita caminho dentro da raiz', () => {
    expect(assertPathUnderRoot(root, '/tmp/uploads/abc.mp4')).toBe(
      resolve('/tmp/uploads/abc.mp4'),
    );
  });

  it('aceita subdiretórios aninhados', () => {
    expect(
      assertPathUnderRoot(root, '/tmp/uploads/post-id/hls/thumb.jpg'),
    ).toBe(resolve('/tmp/uploads/post-id/hls/thumb.jpg'));
  });

  it('rejeita path traversal fora da raiz', () => {
    expect(() =>
      assertPathUnderRoot(root, '/tmp/uploads/../etc/passwd'),
    ).toThrow(BadRequestException);
  });

  it('rejeita prefixo falso (uploads-evil)', () => {
    expect(() =>
      assertPathUnderRoot(root, '/tmp/uploads-evil/abc.mp4'),
    ).toThrow(BadRequestException);
  });

  it('rejeita caminho completamente fora da raiz', () => {
    expect(() => assertPathUnderRoot(root, '/etc/passwd')).toThrow(
      BadRequestException,
    );
  });
});
