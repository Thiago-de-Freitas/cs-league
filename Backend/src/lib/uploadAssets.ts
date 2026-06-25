import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import { isPathInsideBase } from './pathSafe';

const BARE_UPLOAD_FILE = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i;

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function isDataImageUrl(value: string | null | undefined): boolean {
  return !!value?.trim().startsWith('data:image/');
}

export function mimeTypeFromExtension(ext: string): string | null {
  return EXT_TO_MIME[ext.toLowerCase()] ?? null;
}

/** Converte buffer de upload (multer memory) em data URL para persistir no banco. */
export function encodeUploadedImageToDataUrl(file: Express.Multer.File): string {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = mimeTypeFromExtension(ext);
  if (!mime || !file.buffer?.length) {
    throw new Error('Apenas imagens PNG, JPG, WEBP ou GIF são permitidas');
  }
  const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
  if (!dataUrl.startsWith('data:image/') || !dataUrl.includes(';base64,')) {
    throw new Error('Imagem inválida');
  }
  return dataUrl;
}

export function getTeamLogoStoragePath(): string {
  return process.env.TEAM_LOGO_STORAGE_PATH || path.join(__dirname, '../../data/team-logos');
}

export function getUserAvatarStoragePath(): string {
  return process.env.USER_AVATAR_STORAGE_PATH || path.join(__dirname, '../../data/user-avatars');
}

export function ensureUploadStorageDirectories(): void {
  for (const dir of [getTeamLogoStoragePath(), getUserAvatarStoragePath()]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function normalizePublicUploadUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl?.trim()) return null;
  const trimmed = publicUrl.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('/uploads/team-logos/') || trimmed.startsWith('/uploads/user-avatars/')) {
    return trimmed;
  }
  const bare = path.basename(trimmed);
  if (BARE_UPLOAD_FILE.test(bare)) {
    return `/uploads/team-logos/${bare}`;
  }
  return null;
}

export function publicUploadFilePath(publicUrl: string | null | undefined): string | null {
  if (isDataImageUrl(publicUrl)) return null;
  const normalized = normalizePublicUploadUrl(publicUrl);
  if (!normalized) return null;

  const fileName = path.basename(normalized);
  if (fileName.includes('..') || fileName.includes('\0')) return null;

  if (normalized.startsWith('/uploads/team-logos/')) {
    const base = getTeamLogoStoragePath();
    const resolved = path.join(base, fileName);
    if (!isPathInsideBase(resolved, base)) return null;
    return resolved;
  }

  if (normalized.startsWith('/uploads/user-avatars/')) {
    const base = getUserAvatarStoragePath();
    const resolved = path.join(base, fileName);
    if (!isPathInsideBase(resolved, base)) return null;
    return resolved;
  }

  return null;
}

export function publicUploadFileExists(publicUrl: string | null | undefined): boolean {
  if (isDataImageUrl(publicUrl)) return true;
  const filePath = publicUploadFilePath(publicUrl);
  return !!filePath && fs.existsSync(filePath);
}

/** Retorna a URL pública apenas se o arquivo existir no storage legado em disco. */
export function sanitizePublicUploadUrl(publicUrl: string | null | undefined): string | null {
  if (isDataImageUrl(publicUrl)) return publicUrl!.trim();
  const normalized = normalizePublicUploadUrl(publicUrl);
  if (!normalized) return null;
  return publicUploadFileExists(normalized) ? normalized : null;
}

/** URL para respostas da API — data URLs e caminhos legados `/uploads/`. */
export function publicUploadUrlForResponse(publicUrl: string | null | undefined): string | null {
  return normalizePublicUploadUrl(publicUrl);
}

/** Remove arquivo legado em disco (ignora data URLs armazenadas no banco). */
export function deleteLegacyUploadFile(publicUrl: string | null | undefined): void {
  const filePath = publicUploadFilePath(publicUrl);
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // arquivo pode já ter sido removido manualmente
  }
}

function countFilesInDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

export function getUploadStorageStatus() {
  const teamLogosPath = getTeamLogoStoragePath();
  const userAvatarsPath = getUserAvatarStoragePath();
  const teamLogosOnDisk = countFilesInDir(teamLogosPath);
  const userAvatarsOnDisk = countFilesInDir(userAvatarsPath);

  return {
    teamLogos: { path: teamLogosPath, filesOnDisk: teamLogosOnDisk },
    userAvatars: { path: userAvatarsPath, filesOnDisk: userAvatarsOnDisk },
    storageMode: 'database-base64' as const,
    warnings: [] as string[],
  };
}
