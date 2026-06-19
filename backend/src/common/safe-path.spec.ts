import { BadRequestException } from '@nestjs/common';
import { resolve } from 'node:path';
import { assertPathUnderRoot } from './safe-path';

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

  it('rejeita path traversal fora da raiz', () => {
    expect(() =>
      assertPathUnderRoot(root, '/tmp/uploads/../etc/passwd'),
    ).toThrow(BadRequestException);
  });

  it('rejeita caminho completamente fora da raiz', () => {
    expect(() => assertPathUnderRoot(root, '/etc/passwd')).toThrow(
      BadRequestException,
    );
  });
});
