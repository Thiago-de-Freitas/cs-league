import type { MatchSeries, Prisma, SeriesFormat, SeriesVetoStatus } from '@prisma/client';
import { prisma } from './prisma';
import { parseMapPool } from './cs2Maps';
import { coinFlipFirstBanTeam, getOtherTeamId, remainingMaps } from './mapVeto';
import {
  bo3BansCompleted,
  bo3PicksCompleted,
  getBo3ActionTeam,
  getBo3SidePickTeam,
  randomBo3Ban,
  randomBo3Pick,
  resolveBo3MapAssignment,
  BO3_BANS_REQUIRED,
  BO3_PICKS_REQUIRED,
} from './mapVetoBo3';
import { computeBo3SeriesAfterMapWin } from './seriesAdvance';
import { initializeMatchMapVeto } from './mapVetoService';
import { buildVetoDeadlineInfo, isVetoActionAllowed } from './mapVetoDeadline';

function parseStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

export type SeriesVetoView = {
  seriesId: string;
  format: string;
  mapPool: string[];
  bannedMaps: string[];
  pickedMaps: string[];
  assignedMaps: { game: number; map: string | null }[];
  firstActionTeamId: string;
  vetoTurnTeamId: string | null;
  vetoStatus: string;
  activeGameNumber: number;
  team1MapWins: number;
  team2MapWins: number;
  isStale: boolean;
  autoResolved: boolean;
  vetoDeadlineAt: string | null;
  deadlineExpired: boolean;
  vetoReopenedByAdmin: boolean;
};

const STALE_MS = 15 * 60 * 1000;

export function formatSeriesVetoView(
  series: MatchSeries,
  scheduledAt: Date | null = null,
  now = new Date()
): SeriesVetoView {
  const banned = parseStringArray(series.bannedMaps);
  const picked = parseStringArray(series.pickedMaps);
  const assigned = resolveBo3MapAssignment(parseStringArray(series.mapPool), banned, picked);
  const games =
    series.format === 'BO3'
      ? [
          { game: 1, map: assigned?.map1 ?? (picked[0] ?? null) },
          { game: 2, map: assigned?.map2 ?? (picked[1] ?? null) },
          { game: 3, map: assigned?.map3 ?? null },
        ]
      : [{ game: 1, map: assigned?.map1 ?? null }];

  const deadline = buildVetoDeadlineInfo(scheduledAt, series.vetoReopenedByAdmin, now);

  return {
    seriesId: series.id,
    format: series.format.toLowerCase(),
    mapPool: parseStringArray(series.mapPool),
    bannedMaps: banned,
    pickedMaps: picked,
    assignedMaps: games,
    firstActionTeamId: series.firstActionTeamId,
    vetoTurnTeamId: series.vetoTurnTeamId,
    vetoStatus: series.vetoStatus.toLowerCase(),
    activeGameNumber: series.activeGameNumber,
    team1MapWins: series.team1MapWins,
    team2MapWins: series.team2MapWins,
    isStale: now.getTime() - series.lastActionAt.getTime() > STALE_MS,
    autoResolved: series.autoResolved,
    vetoDeadlineAt: deadline.vetoDeadlineAt?.toISOString() ?? null,
    deadlineExpired: deadline.deadlineExpired,
    vetoReopenedByAdmin: series.vetoReopenedByAdmin,
  };
}

export async function createMatchSeries(input: {
  leagueId: string;
  team1Id: string;
  team2Id: string;
  format: SeriesFormat;
  mapPool: string[];
  mapVetoEnabled: boolean;
  phase?: 'GROUP' | 'PLAYOFF';
  round?: number;
  bracketPosition?: number;
  scheduledAt?: Date | null;
}): Promise<{ seriesId: string; matchIds: string[] }> {
  const firstActionTeamId = coinFlipFirstBanTeam(input.team1Id, input.team2Id);
  const gameCount = input.format === 'BO3' ? 3 : 1;

  const series = await prisma.matchSeries.create({
    data: {
      leagueId: input.leagueId,
      team1Id: input.team1Id,
      team2Id: input.team2Id,
      format: input.format,
      mapPool: input.mapPool,
      firstActionTeamId,
      vetoTurnTeamId: firstActionTeamId,
      vetoStatus: input.format === 'BO3' ? 'BAN_PHASE' : 'MAPS_ASSIGNED',
    },
  });

  const matchIds: string[] = [];
  for (let g = 1; g <= gameCount; g++) {
    const match = await prisma.match.create({
      data: {
        leagueId: input.leagueId,
        team1Id: input.team1Id,
        team2Id: input.team2Id,
        seriesId: series.id,
        seriesGameNumber: g,
        phase: input.phase ?? 'PLAYOFF',
        round: input.round ?? 1,
        bracketPosition: input.bracketPosition ?? null,
        scheduledAt: input.scheduledAt ?? null,
        status: 'SCHEDULED',
      },
    });
    matchIds.push(match.id);
  }

  if (input.format === 'BO1' && input.mapVetoEnabled) {
    await initializeMatchMapVeto(matchIds[0], input.team1Id, input.team2Id, input.mapPool, true);
    await prisma.matchSeries.update({
      where: { id: series.id },
      data: { vetoStatus: 'COMPLETED' },
    });
  }

  return { seriesId: series.id, matchIds };
}

async function assignBo3MapsToMatches(series: MatchSeries): Promise<void> {
  const banned = parseStringArray(series.bannedMaps);
  const picked = parseStringArray(series.pickedMaps);
  const maps = resolveBo3MapAssignment(parseStringArray(series.mapPool), banned, picked);
  if (!maps) return;

  const matches = await prisma.match.findMany({
    where: { seriesId: series.id },
    orderBy: { seriesGameNumber: 'asc' },
  });

  const mapByGame = [maps.map1, maps.map2, maps.map3];
  for (const match of matches) {
    const map = mapByGame[(match.seriesGameNumber ?? 1) - 1];
    if (!map) continue;
    await prisma.match.update({ where: { id: match.id }, data: { map } });
    if (match.seriesGameNumber === 1) {
      await startSideVetoForMatch(match.id, series);
    }
  }

  await prisma.matchSeries.update({
    where: { id: series.id },
    data: { vetoStatus: 'MAPS_ASSIGNED', vetoTurnTeamId: null },
  });
}

async function startSideVetoForMatch(matchId: string, series: MatchSeries): Promise<void> {
  const sidePickTeamId = getBo3SidePickTeam(
    series.firstActionTeamId,
    series.team1Id,
    series.team2Id,
    series.activeGameNumber
  );
  await prisma.matchMapVeto.upsert({
    where: { matchId },
    create: {
      matchId,
      mapPool: parseStringArray(series.mapPool),
      bannedMaps: [],
      firstBanTeamId: series.firstActionTeamId,
      status: 'SIDE_PHASE',
      sidePickTeamId,
      vetoTurnTeamId: null,
    },
    update: {
      status: 'SIDE_PHASE',
      sidePickTeamId,
      vetoTurnTeamId: null,
      lastActionAt: new Date(),
    },
  });
}

export async function seriesBanMap(
  seriesId: string,
  actingTeamId: string,
  mapId: string,
  scheduledAt: Date | null = null
): Promise<{ series: SeriesVetoView; error?: string }> {
  const series = await prisma.matchSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.format !== 'BO3') {
    return { series: formatSeriesVetoView(series!, scheduledAt), error: 'Série inválida.' };
  }
  if (series.vetoStatus !== 'BAN_PHASE') {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Fase de banimento encerrada.' };
  }
  if (!isVetoActionAllowed(scheduledAt, series.vetoReopenedByAdmin, series.vetoStatus)) {
    return {
      series: formatSeriesVetoView(series, scheduledAt),
      error: 'O prazo de veto expirou (2 dias antes da partida). Aguarde um administrador reabrir o map pool.',
    };
  }
  if (series.vetoTurnTeamId !== actingTeamId) {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Não é a vez deste time.' };
  }

  const pool = parseStringArray(series.mapPool);
  const banned = parseStringArray(series.bannedMaps);
  const map = mapId.trim().toLowerCase();
  if (!pool.includes(map) || banned.includes(map)) {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Mapa inválido.' };
  }

  const nextBanned = [...banned, map];
  const otherTeamId = getOtherTeamId(series.team1Id, series.team2Id, series.firstActionTeamId);
  const stepIndex = nextBanned.length - 1;

  let vetoStatus: SeriesVetoStatus = 'BAN_PHASE';
  let vetoTurnTeamId: string | null = getBo3ActionTeam(series.firstActionTeamId, otherTeamId, stepIndex + 1);

  if (bo3BansCompleted(nextBanned.length)) {
    vetoStatus = 'PICK_PHASE';
    vetoTurnTeamId = series.firstActionTeamId;
  }

  const updated = await prisma.matchSeries.update({
    where: { id: seriesId },
    data: {
      bannedMaps: nextBanned,
      vetoStatus,
      vetoTurnTeamId,
      lastActionAt: new Date(),
    },
  });

  return { series: formatSeriesVetoView(updated, scheduledAt) };
}

export async function seriesPickMap(
  seriesId: string,
  actingTeamId: string,
  mapId: string,
  scheduledAt: Date | null = null
): Promise<{ series: SeriesVetoView; error?: string }> {
  const series = await prisma.matchSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.format !== 'BO3') {
    return { series: formatSeriesVetoView(series!, scheduledAt), error: 'Série inválida.' };
  }
  if (series.vetoStatus !== 'PICK_PHASE') {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Fase de pick encerrada.' };
  }
  if (!isVetoActionAllowed(scheduledAt, series.vetoReopenedByAdmin, series.vetoStatus)) {
    return {
      series: formatSeriesVetoView(series, scheduledAt),
      error: 'O prazo de veto expirou (2 dias antes da partida). Aguarde um administrador reabrir o map pool.',
    };
  }
  if (series.vetoTurnTeamId !== actingTeamId) {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Não é a vez deste time.' };
  }

  const pool = parseStringArray(series.mapPool);
  const banned = parseStringArray(series.bannedMaps);
  const picked = parseStringArray(series.pickedMaps);
  const map = mapId.trim().toLowerCase();
  const available = remainingMaps(pool, banned).filter((m) => !picked.includes(m));
  if (!available.includes(map)) {
    return { series: formatSeriesVetoView(series, scheduledAt), error: 'Mapa indisponível para pick.' };
  }

  const nextPicked = [...picked, map];
  const otherTeamId = getOtherTeamId(series.team1Id, series.team2Id, series.firstActionTeamId);
  const pickIndex = nextPicked.length - 1;
  const banOffset = BO3_BANS_REQUIRED;
  const stepIndex = banOffset + pickIndex;

  let vetoStatus: SeriesVetoStatus = 'PICK_PHASE';
  let vetoTurnTeamId: string | null = getBo3ActionTeam(
    series.firstActionTeamId,
    otherTeamId,
    stepIndex + 1
  );

  if (bo3PicksCompleted(nextPicked.length)) {
    vetoStatus = 'MAPS_ASSIGNED';
    vetoTurnTeamId = null;
  }

  const updated = await prisma.matchSeries.update({
    where: { id: seriesId },
    data: {
      pickedMaps: nextPicked,
      vetoStatus,
      vetoTurnTeamId,
      lastActionAt: new Date(),
    },
  });

  if (vetoStatus === 'MAPS_ASSIGNED') {
    await assignBo3MapsToMatches(updated);
  }

  const fresh = await prisma.matchSeries.findUnique({ where: { id: seriesId } });
  return { series: formatSeriesVetoView(fresh!, scheduledAt) };
}

export async function advanceSeriesAfterMapWin(
  seriesId: string,
  winningTeamId: string
): Promise<{ completed: boolean; winnerId: string | null }> {
  const series = await prisma.matchSeries.findUnique({
    where: { id: seriesId },
    include: { matches: { orderBy: { seriesGameNumber: 'asc' } } },
  });
  if (!series || series.format !== 'BO3') {
    return { completed: false, winnerId: null };
  }

  const result = computeBo3SeriesAfterMapWin({
    team1Id: series.team1Id,
    team2Id: series.team2Id,
    winningTeamId,
    team1MapWins: series.team1MapWins,
    team2MapWins: series.team2MapWins,
    activeGameNumber: series.activeGameNumber,
  });

  if (result.completed && result.winnerId) {
    await prisma.matchSeries.update({
      where: { id: seriesId },
      data: {
        team1MapWins: result.team1MapWins,
        team2MapWins: result.team2MapWins,
        winnerId: result.winnerId,
        status: 'COMPLETED',
        vetoStatus: 'COMPLETED',
      },
    });
    return { completed: true, winnerId: result.winnerId };
  }

  await prisma.matchSeries.update({
    where: { id: seriesId },
    data: {
      team1MapWins: result.team1MapWins,
      team2MapWins: result.team2MapWins,
      activeGameNumber: result.activeGameNumber,
    },
  });

  const nextMatch = series.matches.find((m) => m.seriesGameNumber === result.activeGameNumber);
  if (nextMatch) {
    await startSideVetoForMatch(nextMatch.id, { ...series, activeGameNumber: result.activeGameNumber });
  }

  return { completed: false, winnerId: null };
}

export async function autoResolveStaleSeries(series: MatchSeries): Promise<MatchSeries> {
  if (series.vetoStatus === 'MAPS_ASSIGNED' || series.vetoStatus === 'COMPLETED') {
    return series;
  }

  let current = series;
  const otherTeamId = getOtherTeamId(series.team1Id, series.team2Id, series.firstActionTeamId);
  let banned = parseStringArray(series.bannedMaps);
  let picked = parseStringArray(series.pickedMaps);
  const pool = parseStringArray(series.mapPool);

  while (current.vetoStatus === 'BAN_PHASE' && banned.length < BO3_BANS_REQUIRED) {
    const map = randomBo3Ban(pool, banned, picked);
    banned = [...banned, map];
    const stepIndex = banned.length - 1;
    let vetoStatus: SeriesVetoStatus = 'BAN_PHASE';
    let vetoTurnTeamId = getBo3ActionTeam(series.firstActionTeamId, otherTeamId, stepIndex + 1);
    if (bo3BansCompleted(banned.length)) {
      vetoStatus = 'PICK_PHASE';
      vetoTurnTeamId = series.firstActionTeamId;
    }
    current = await prisma.matchSeries.update({
      where: { id: series.id },
      data: { bannedMaps: banned, vetoStatus, vetoTurnTeamId, autoResolved: true, lastActionAt: new Date() },
    });
  }

  while (current.vetoStatus === 'PICK_PHASE' && picked.length < BO3_PICKS_REQUIRED) {
    const map = randomBo3Pick(pool, banned, picked);
    picked = [...picked, map];
    const pickIndex = picked.length - 1;
    const stepIndex = BO3_BANS_REQUIRED + pickIndex;
    let vetoStatus: SeriesVetoStatus = 'PICK_PHASE';
    let vetoTurnTeamId: string | null = getBo3ActionTeam(series.firstActionTeamId, otherTeamId, stepIndex + 1);
    if (bo3PicksCompleted(picked.length)) {
      vetoStatus = 'MAPS_ASSIGNED';
      vetoTurnTeamId = null;
    }
    current = await prisma.matchSeries.update({
      where: { id: series.id },
      data: { pickedMaps: picked, vetoStatus, vetoTurnTeamId, autoResolved: true, lastActionAt: new Date() },
    });
    if (vetoStatus === 'MAPS_ASSIGNED') {
      await assignBo3MapsToMatches(current);
      current = (await prisma.matchSeries.findUnique({ where: { id: series.id } }))!;
    }
  }

  return current;
}

export async function getSeriesScheduledAt(seriesId: string): Promise<Date | null> {
  const match = await prisma.match.findFirst({
    where: { seriesId },
    orderBy: { seriesGameNumber: 'asc' },
    select: { scheduledAt: true },
  });
  return match?.scheduledAt ?? null;
}

export async function reopenSeriesMapVeto(seriesId: string): Promise<SeriesVetoView> {
  const series = await prisma.matchSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.format !== 'BO3') {
    throw new Error('Série inválida para reabrir veto.');
  }

  const firstActionTeamId = coinFlipFirstBanTeam(series.team1Id, series.team2Id);
  const mapPool = parseStringArray(series.mapPool);

  await prisma.$transaction(async (tx) => {
    await tx.matchSeries.update({
      where: { id: seriesId },
      data: {
        bannedMaps: [],
        pickedMaps: [],
        firstActionTeamId,
        vetoTurnTeamId: firstActionTeamId,
        vetoStatus: 'BAN_PHASE',
        activeGameNumber: 1,
        autoResolved: false,
        vetoReopenedByAdmin: true,
        lastActionAt: new Date(),
      },
    });

    const matches = await tx.match.findMany({
      where: { seriesId },
      select: { id: true },
    });
    const matchIds = matches.map((m) => m.id);

    if (matchIds.length > 0) {
      await tx.matchMapVeto.deleteMany({ where: { matchId: { in: matchIds } } });
      await tx.match.updateMany({
        where: { id: { in: matchIds } },
        data: {
          map: null,
          team1StartingSide: null,
          team2StartingSide: null,
        },
      });
    }
  });

  const fresh = await prisma.matchSeries.findUnique({ where: { id: seriesId } });
  const scheduledAt = await getSeriesScheduledAt(seriesId);
  return formatSeriesVetoView(fresh!, scheduledAt);
}

export async function getSeriesForMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { seriesId: true, scheduledAt: true },
  });
  if (!match?.seriesId) return null;

  let series = await prisma.matchSeries.findUnique({ where: { id: match.seriesId } });
  if (!series) return null;

  const scheduledAt = (await getSeriesScheduledAt(series.id)) ?? match.scheduledAt;
  const view = formatSeriesVetoView(series, scheduledAt);
  const deadline = buildVetoDeadlineInfo(scheduledAt, series.vetoReopenedByAdmin);

  if (
    (deadline.deadlineExpired || view.isStale) &&
    series.vetoStatus !== 'MAPS_ASSIGNED' &&
    series.vetoStatus !== 'COMPLETED'
  ) {
    series = await autoResolveStaleSeries(series);
  }

  const matches = await prisma.match.findMany({
    where: { seriesId: series.id },
    orderBy: { seriesGameNumber: 'asc' },
    select: { id: true, seriesGameNumber: true, map: true, status: true, scheduledAt: true },
  });

  const seriesScheduledAt = matches[0]?.scheduledAt ?? scheduledAt;

  return {
    series: formatSeriesVetoView(series, seriesScheduledAt),
    matches: matches.map((m) => ({
      id: m.id,
      seriesGameNumber: m.seriesGameNumber,
      map: m.map,
      status: m.status.toLowerCase(),
    })),
  };
}

export async function resolveLeagueMapPool(league: { mapPool: Prisma.JsonValue | null }): Promise<string[]> {
  return parseMapPool(league.mapPool);
}
