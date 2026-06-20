import path from 'path';
import fs from 'fs';
import { isPathInsideBase } from './pathSafe';

/** Caminho absoluto e estável para armazenamento de demos (independente do cwd). */
export function getDemoStoragePath(): string {
  const configured = process.env.DEMO_STORAGE_PATH;
  const base = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured)
    : path.resolve(__dirname, '../../data/demos');

  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  return base;
}

/**
 * Resolve caminho absoluto da demo garantindo que permaneça dentro do storage.
 * Lança erro se houver tentativa de path traversal.
 */
export function resolveDemoFilePath(filePath: string): string {
  const storage = getDemoStoragePath();
  const normalized = path.normalize(filePath);

  const resolved = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(storage, normalized);

  if (!isPathInsideBase(resolved, storage)) {
    throw new Error('Caminho de demo inválido');
  }

  return resolved;
}

/** Variante segura que retorna null em vez de lançar (para leitura defensiva). */
export function tryResolveDemoFilePath(filePath: string): string | null {
  try {
    return resolveDemoFilePath(filePath);
  } catch {
    return null;
  }
}
