import { resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';

function normalizeAbsolutePath(filePath: string): string {
  return resolve(filePath).replace(/\\/g, '/');
}

/**
 * Garante que `targetPath` resolve para um caminho dentro de `root`
 * (defesa contra path traversal antes de operações fs).
 */
export function assertPathUnderRoot(root: string, targetPath: string): string {
  const resolvedRoot = normalizeAbsolutePath(root);
  const resolvedTarget = normalizeAbsolutePath(targetPath);
  const rootPrefix = resolvedRoot.endsWith('/')
    ? resolvedRoot
    : `${resolvedRoot}/`;

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(rootPrefix)
  ) {
    throw new BadRequestException('Caminho de arquivo inválido.');
  }

  return resolve(targetPath);
}
