/** Normaliza username para lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Valida formato: a-z, 0-9, _, . — 3 a 30 caracteres. */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_.]{3,30}$/.test(username);
}
