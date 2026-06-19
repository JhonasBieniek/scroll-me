/**
 * Reescreve linhas de segmento do manifesto HLS com Presigned URLs.
 * Linhas de tag (#EXT*) e vazias são preservadas.
 */
export async function rewriteHlsManifestWithPresignedSegments(
  manifestBody: string,
  keyPrefix: string,
  signKey: (objectKey: string) => Promise<string>,
): Promise<string> {
  const lines = manifestBody.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    const segmentKey = trimmed.startsWith('http')
      ? null
      : trimmed.includes('/')
        ? trimmed
        : `${keyPrefix}${trimmed}`;

    if (segmentKey === null) {
      out.push(line);
      continue;
    }

    out.push(await signKey(segmentKey));
  }

  return out.join('\n');
}
