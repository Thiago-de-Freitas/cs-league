/** Interpreta ownerAsMember do body da API (padrão: true). */
export function parseOwnerAsMember(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== '0';
}

export const TEAM_NAME_MAX_LENGTH = 100;

/** Nome de time: texto visível, 1–100 caracteres após trim. */
export function parseTeamName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TEAM_NAME_MAX_LENGTH) return null;
  return trimmed;
}
