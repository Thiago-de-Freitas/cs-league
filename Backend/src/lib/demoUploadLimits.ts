const DEFAULT_MAX_MB = 1024;
const MIN_MAX_MB = 50;
const MAX_MAX_MB = 2048;

function parseDemoMaxUploadMb(): number {
  const raw = process.env.DEMO_MAX_UPLOAD_MB?.trim();
  if (!raw) {
    return DEFAULT_MAX_MB;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_MAX_MB) {
    return DEFAULT_MAX_MB;
  }
  return Math.min(Math.floor(parsed), MAX_MAX_MB);
}

export function getDemoMaxUploadMb(): number {
  return parseDemoMaxUploadMb();
}

export function getDemoMaxUploadBytes(): number {
  return getDemoMaxUploadMb() * 1024 * 1024;
}

export function formatDemoMaxUploadLabel(): string {
  const mb = getDemoMaxUploadMb();
  if (mb >= 1024 && mb % 1024 === 0) {
    return `${mb / 1024} GB`;
  }
  return `${mb} MB`;
}

export function getDemoMaxUploadErrorMessage(): string {
  return `Arquivo muito grande. O limite é ${formatDemoMaxUploadLabel()}.`;
}
