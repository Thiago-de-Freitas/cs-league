import path from 'path';

/** Verifica se `resolvedPath` está contido em `baseDir` (sem path traversal). */
export function isPathInsideBase(resolvedPath: string, baseDir: string): boolean {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(resolvedPath);
  return resolved === base || resolved.startsWith(base + path.sep);
}

/** Resolve caminho dentro de `baseDir`; retorna null se escapar do diretório base. */
export function resolvePathInsideBase(baseDir: string, ...segments: string[]): string | null {
  const resolved = path.resolve(baseDir, ...segments);
  if (!isPathInsideBase(resolved, baseDir)) {
    return null;
  }
  return resolved;
}

/** Retorna extensão normalizada se estiver na allowlist; caso contrário null. */
export function sanitizeFileExtension(originalName: string, allowedExtensions: readonly string[]): string | null {
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return null;
  }
  return ext;
}

/** Valida IDs no formato cuid (Prisma default) ou UUID v4. */
export function isValidResourceId(value: string): boolean {
  if (!value || value.length > 64) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  return /^c[a-z0-9]{20,}$/i.test(value);
}

/** Rejeita segmentos de path perigosos em URLs de upload estático. */
export function isSafeStaticRequestPath(requestPath: string): boolean {
  if (!requestPath || requestPath.includes('\0')) return false;
  const raw = requestPath.replace(/\\/g, '/');
  if (raw.includes('..')) return false;
  const normalized = path.posix.normalize(raw);
  if (normalized.startsWith('..') || normalized.includes('/..')) return false;
  return true;
}
