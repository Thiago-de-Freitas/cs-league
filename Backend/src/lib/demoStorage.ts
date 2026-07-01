import os from 'os';
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
export function tryResolveDemoFilePath(filePath: string | null | undefined): string | null {
  if (!filePath?.trim()) return null;
  try {
    return resolveDemoFilePath(filePath);
  } catch {
    return null;
  }
}

export function displayDemoFileName(
  fileName: string | null | undefined,
  isManual = false
): string {
  if (isManual) return 'Stats manuais';
  return fileName?.trim() || 'demo.dem';
}

/** Diretório local rápido para receber o stream do upload antes de mover para o volume. */
export function getDemoUploadTempPath(): string {
  const base = path.join(os.tmpdir(), 'cs-league-demo-uploads');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

/** Move demo do diretório temporário para o storage persistente (volume /data). */
export function moveDemoFileToStorage(tempPath: string): string {
  const resolvedTemp = path.resolve(tempPath);
  const fileName = path.basename(resolvedTemp);
  const finalPath = path.join(getDemoStoragePath(), fileName);

  try {
    fs.renameSync(resolvedTemp, finalPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV') {
      fs.copyFileSync(resolvedTemp, finalPath);
      fs.unlinkSync(resolvedTemp);
    } else {
      throw err;
    }
  }

  return finalPath;
}
