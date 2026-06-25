export type ManualPlayerStatInput = {
  userId?: string | null;
  steamId?: string | null;
  playerName: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  hsPercent: number;
  damage: number;
};

export function calcPlayerAdr(damage: number, totalRounds: number): number {
  if (totalRounds <= 0 || damage <= 0) return 0;
  return Math.round((damage / totalRounds) * 10) / 10;
}

export function resolveTotalRounds(
  team1Rounds: number | null | undefined,
  team2Rounds: number | null | undefined,
  fallbackTotalRounds?: number | null
): number | null {
  const fromScore =
    team1Rounds != null && team2Rounds != null ? team1Rounds + team2Rounds : 0;
  if (fromScore > 0) return fromScore;
  if (fallbackTotalRounds != null && fallbackTotalRounds > 0) return fallbackTotalRounds;
  return null;
}

function parseNonNegativeInt(value: unknown, field: string, max = 999): number | { error: string } {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > max) {
    return { error: `${field} inválido.` };
  }
  return num;
}

function parseHsPercent(value: unknown): number | { error: string } {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    return { error: '%HS inválido (use 0 a 100).' };
  }
  return Math.round(num * 10) / 10;
}

export function parseManualPlayerStats(
  players: unknown,
  allowedTeamIds: [string, string]
): { players: ManualPlayerStatInput[] } | { error: string } {
  if (!Array.isArray(players) || players.length === 0) {
    return { error: 'Informe as estatísticas de pelo menos um jogador.' };
  }

  const parsed: ManualPlayerStatInput[] = [];
  const seen = new Set<string>();

  for (const raw of players) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'Dados de jogador inválidos.' };
    }

    const row = raw as Record<string, unknown>;
    const teamId = typeof row.teamId === 'string' ? row.teamId.trim() : '';
    if (!teamId || !allowedTeamIds.includes(teamId)) {
      return { error: 'Time do jogador inválido.' };
    }

    const playerName = typeof row.playerName === 'string' ? row.playerName.trim() : '';
    if (!playerName) {
      return { error: 'Nome do jogador é obrigatório.' };
    }

    const dedupeKey = `${teamId}:${(row.userId as string | undefined) || playerName.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const kills = parseNonNegativeInt(row.kills, 'Vítimas');
    if (typeof kills === 'object') return kills;
    const deaths = parseNonNegativeInt(row.deaths, 'Mortes');
    if (typeof deaths === 'object') return deaths;
    const assists = parseNonNegativeInt(row.assists, 'Assistências');
    if (typeof assists === 'object') return assists;
    const damage = parseNonNegativeInt(row.damage, 'Dano', 99999);
    if (typeof damage === 'object') return damage;
    const hsPercent = parseHsPercent(row.hsPercent);
    if (typeof hsPercent === 'object') return hsPercent;

    if (kills === 0 && deaths === 0 && assists === 0 && damage === 0) {
      continue;
    }

    parsed.push({
      userId: typeof row.userId === 'string' ? row.userId : null,
      steamId: typeof row.steamId === 'string' ? row.steamId.trim() || null : null,
      playerName,
      teamId,
      kills,
      deaths,
      assists,
      hsPercent,
      damage,
    });
  }

  if (parsed.length === 0) {
    return { error: 'Informe estatísticas para pelo menos um jogador com dados preenchidos.' };
  }

  return { players: parsed };
}
