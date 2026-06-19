import path from 'path';
import fs from 'fs';

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

/** Garante caminho absoluto para o worker localizar o arquivo. */
export function resolveDemoFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }

  const storage = getDemoStoragePath();
  const fromStorage = path.resolve(storage, filePath);
  if (fs.existsSync(fromStorage)) {
    return fromStorage;
  }

  return path.resolve(process.cwd(), filePath);
}
