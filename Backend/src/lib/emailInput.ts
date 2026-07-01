const EMAIL_LOCAL_MAX = 64;
const EMAIL_DOMAIN_MAX = 253;
const EMAIL_TOTAL_MAX = 255;

/** RFC 5322 simplificado — local@domain com TLD. */
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function parseEmailInput(value: unknown, maxLength = EMAIL_TOTAL_MAX): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength) return null;
  if (normalized.includes('..') || normalized.includes('@.') || normalized.includes('.@')) {
    return null;
  }

  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (local.length > EMAIL_LOCAL_MAX || domain.length > EMAIL_DOMAIN_MAX) return null;
  if (!EMAIL_PATTERN.test(normalized)) return null;

  return normalized;
}
