import { basename, join, resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { BadRequestException } from '@nestjs/common';

function normalizeAbsolutePath(filePath: string): string {
  return resolve(filePath).replace(/\\/g, '/');
}

/**
 * Valida que `name` é um basename seguro (sem separadores ou traversal).
 * Deve receber apenas o nome de arquivo (ex.: multer `filename`), não um path completo.
 */
export function assertSafeBasename(name: string): string {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new BadRequestException('Nome de arquivo inválido.');
  }
  return name;
}

/**
 * Reconstrói um caminho seguro sob `root` a partir de um basename confiável
 * (ex.: `file.filename` gerado pelo multer).
 */
export function resolvePathUnderRootFromBasename(
  root: string,
  untrustedBasename: string,
): string {
  const safeBasename = assertSafeBasename(untrustedBasename);
  return assertPathUnderRoot(root, join(root, safeBasename));
}

/**
 * Reconstrói um caminho seguro sob `root` usando apenas o basename de
 * `untrustedPath`, descartando qualquer componente de diretório controlado
 * pelo usuário.
 */
export function resolvePathUnderRoot(
  root: string,
  untrustedPath: string,
): string {
  return resolvePathUnderRootFromBasename(root, basename(untrustedPath));
}

/**
 * Remove um arquivo reconstruindo o caminho a partir de `root` + basename.
 * O argumento passado a `rm` nunca inclui componentes do path não confiável.
 */
export async function safeRmUnderRoot(
  root: string,
  untrustedBasename: string,
  options?: Parameters<typeof rm>[1],
): Promise<void> {
  const safePath = resolvePathUnderRootFromBasename(root, untrustedBasename);
  await rm(safePath, options);
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
