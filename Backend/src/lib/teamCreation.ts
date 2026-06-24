/** Interpreta ownerAsMember do body da API (padrão: true). */
export function parseOwnerAsMember(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== '0';
}
