export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

export function parsePasswordInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return null;
  return value;
}
