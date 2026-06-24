import fs from 'fs';
import path from 'path';
import { isPathInsideBase } from './pathSafe';

const BARE_UPLOAD_FILE = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i;

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
  const filePath = publicUploadFilePath(publicUrl);
  return !!filePath && fs.existsSync(filePath);
}

/** Retorna a URL pública apenas se o arquivo existir no storage. */
export function sanitizePublicUploadUrl(publicUrl: string | null | undefined): string | null {
  const normalized = normalizePublicUploadUrl(publicUrl);
  if (!normalized) return null;
  return publicUploadFileExists(normalized) ? normalized : null;
}
