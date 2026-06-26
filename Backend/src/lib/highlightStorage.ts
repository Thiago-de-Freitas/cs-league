import path from 'path';
import fs from 'fs';
import { isPathInsideBase } from './pathSafe';

export function getHighlightClipsPath(): string {
  const configured = process.env.HIGHLIGHT_CLIPS_PATH;
  const base = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured)
    : path.resolve(__dirname, '../../data/highlights');

  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  return base;
}

export function resolveHighlightClipPath(filePath: string): string {
  const storage = getHighlightClipsPath();
  const normalized = path.normalize(filePath);
  const resolved = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(storage, normalized);

  if (!isPathInsideBase(resolved, storage)) {
    throw new Error('Caminho de clipe inválido');
  }

  return resolved;
}

export function buildHighlightClipFileName(highlightId: string): string {
  return `${highlightId}.mp4`;
}

export function getHighlightClipPublicUrl(clipVideoPath: string | null | undefined): string | null {
  if (!clipVideoPath?.trim()) return null;
  const fileName = path.basename(clipVideoPath);
  return `/uploads/highlights/${fileName}`;
}
