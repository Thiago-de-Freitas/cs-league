/** Nível global de ranking (1-10, estilo Faceit). */
export const MAX_PLAYER_LEVEL = 10;

/** Extrai o nível de uma entrada de ranking/perfil, com fallback para 1. */
export function getPlayerLevel(entry: { level?: number | null } | null | undefined): number {
  const level = entry?.level;
  if (typeof level !== 'number' || !Number.isFinite(level)) return 1;
  return Math.min(Math.max(Math.round(level), 1), MAX_PLAYER_LEVEL);
}

/** Classe CSS do badge de nível (usa tokens do design system). */
export function getLevelBadgeClass(level: number | null | undefined): string {
  const safe = getPlayerLevel({ level: level ?? undefined });
  return `gc-level-badge gc-level-badge--l${safe}`;
}
