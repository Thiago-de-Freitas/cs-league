export function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '');
}

export function parseOriginList(value: string | undefined, fallback = 'http://localhost:4200'): string[] {
  return (value || fallback)
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
}
