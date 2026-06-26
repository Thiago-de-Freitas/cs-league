import type { Prisma, SeriesFormat } from '@prisma/client';
import { parseMapPool } from './cs2Maps';
import { coinFlipFirstBanTeam } from './mapVeto';

type Db = Prisma.TransactionClient | typeof import('./prisma').prisma;

export type PlayoffLeagueConfig = {
  seriesFormat: SeriesFormat;
  mapPool: Prisma.JsonValue | null;
  mapVetoEnabled: boolean;
};

export type CreatePlayoffSlotInput = {
  leagueId: string;
  team1Id: string;
  team2Id: string;
  round: number;
  bracketPosition: number;
  phase?: 'GROUP' | 'PLAYOFF';
  scheduledAt?: Date | null;
};

export function resolvePlayoffSlotPlan(league: PlayoffLeagueConfig): {
  useSeries: boolean;
  format: 'BO1' | 'BO3';
  gameCount: number;
} {
  const useSeries = league.seriesFormat === 'BO3' || league.mapVetoEnabled;
  const format = league.seriesFormat === 'BO3' ? 'BO3' : 'BO1';
  const gameCount = format === 'BO3' ? 3 : 1;
  return { useSeries, format, gameCount };
}

/** Cria partida única (BO1 sem série) ou série BO1/BO3 com veto. */
export async function createPlayoffSlot(
  db: Db,
  league: PlayoffLeagueConfig,
  input: CreatePlayoffSlotInput
): Promise<{ matchIds: string[]; primaryMatchId: string }> {
  const mapPool = parseMapPool(league.mapPool);
  const { useSeries, format, gameCount } = resolvePlayoffSlotPlan(league);

  if (!useSeries) {
    const match = await db.match.create({
      data: {
        leagueId: input.leagueId,
        team1Id: input.team1Id,
        team2Id: input.team2Id,
        round: input.round,
        bracketPosition: input.bracketPosition,
        phase: input.phase ?? 'PLAYOFF',
        scheduledAt: input.scheduledAt ?? null,
        status: 'SCHEDULED',
      },
    });
    return { matchIds: [match.id], primaryMatchId: match.id };
  }

  const firstActionTeamId = coinFlipFirstBanTeam(input.team1Id, input.team2Id);

  const series = await db.matchSeries.create({
    data: {
      leagueId: input.leagueId,
      team1Id: input.team1Id,
      team2Id: input.team2Id,
      format,
      mapPool,
      firstActionTeamId,
      vetoTurnTeamId: firstActionTeamId,
      vetoStatus: format === 'BO3' ? 'BAN_PHASE' : 'MAPS_ASSIGNED',
    },
  });

  const matchIds: string[] = [];
  for (let g = 1; g <= gameCount; g++) {
    const match = await db.match.create({
      data: {
        leagueId: input.leagueId,
        team1Id: input.team1Id,
        team2Id: input.team2Id,
        seriesId: series.id,
        seriesGameNumber: g,
        phase: input.phase ?? 'PLAYOFF',
        round: input.round,
        bracketPosition: input.bracketPosition,
        scheduledAt: input.scheduledAt ?? null,
        status: 'SCHEDULED',
      },
    });
    matchIds.push(match.id);
  }

  return { matchIds, primaryMatchId: matchIds[0] };
}

export async function resolveBracketSlotWinner(
  db: Db,
  leagueId: string,
  round: number,
  bracketPosition: number,
  walkoverWinnerId: string | null
): Promise<string | null> {
  if (walkoverWinnerId) return walkoverWinnerId;

  const slotMatches = await db.match.findMany({
    where: { leagueId, round, bracketPosition, phase: 'PLAYOFF' },
    orderBy: { seriesGameNumber: 'asc' },
    select: { id: true, winnerId: true, status: true, seriesId: true, seriesGameNumber: true },
  });

  if (slotMatches.length === 0) return null;

  const rep = slotMatches.find((m) => m.seriesGameNumber === 1) ?? slotMatches[0];
  if (rep.seriesId) {
    const series = await db.matchSeries.findUnique({
      where: { id: rep.seriesId },
      select: { status: true, winnerId: true },
    });
    if (series?.status === 'COMPLETED' && series.winnerId) {
      return series.winnerId;
    }
    return null;
  }

  if (rep.status === 'COMPLETED' && rep.winnerId) {
    return rep.winnerId;
  }

  return null;
}
