const BARE_UPLOAD_FILE = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i;

/** Normaliza URLs de uploads retornadas pela API. */
export function resolveUploadAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (BARE_UPLOAD_FILE.test(trimmed)) {
    return `/uploads/team-logos/${trimmed}`;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
