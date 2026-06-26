import type { GameSide, MapVetoStatus, Prisma, MatchMapVeto } from '@prisma/client';
import { prisma } from './prisma';
import { parseMapPool } from './cs2Maps';
import {
  applyStartingSides,
  bansRequiredForPool,
  buildMapVetoView,
  coinFlipFirstBanTeam,
  getBanTeamForStep,
  getOtherTeamId,
  getSidePickTeamId,
  pickRandomFrom,
  remainingMaps,
  type MapVetoState,
} from './mapVeto';

type MatchContext = {
  id: string;
  team1Id: string;
  team2Id: string;
  map: string | null;
  team1StartingSide: GameSide | null;
  team2StartingSide: GameSide | null;
  league: {
    mapPool: Prisma.JsonValue;
    mapVetoEnabled: boolean;
  };
};

function parseBannedMaps(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => String(m));
}

function parseMapPoolJson(value: Prisma.JsonValue): string[] {
  return parseMapPool(value);
}

export async function ensureMatchMapVeto(match: MatchContext): Promise<MapVetoState | null> {
  if (!match.league.mapVetoEnabled) return null;

  let veto = await prisma.matchMapVeto.findUnique({ where: { matchId: match.id } });
  if (!veto) {
    const mapPool = parseMapPoolJson(match.league.mapPool);
    const firstBanTeamId = coinFlipFirstBanTeam(match.team1Id, match.team2Id);
    veto = await prisma.matchMapVeto.create({
      data: {
        matchId: match.id,
        mapPool,
        bannedMaps: [],
        firstBanTeamId,
        vetoTurnTeamId: firstBanTeamId,
        status: 'BAN_PHASE',
        lastActionAt: new Date(),
      },
    });
  }

  const resolved = await resolveStaleVetoIfNeeded(match, veto);
  return formatVetoState(match, resolved);
}

async function resolveStaleVetoIfNeeded(match: MatchContext, veto: MatchMapVeto) {
  const view = buildMapVetoView({
    mapPool: parseMapPoolJson(veto.mapPool),
    bannedMaps: parseBannedMaps(veto.bannedMaps),
    firstBanTeamId: veto.firstBanTeamId,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    vetoTurnTeamId: veto.vetoTurnTeamId,
    sidePickTeamId: veto.sidePickTeamId,
    status: veto.status,
    selectedMap: match.map,
    team1StartingSide: match.team1StartingSide,
    team2StartingSide: match.team2StartingSide,
    lastActionAt: veto.lastActionAt,
  });

  if (!view.isStale || veto.status === 'COMPLETED') {
    return veto;
  }

  return autoCompleteVeto(match, veto, true);
}

export async function banMapForMatch(
  match: MatchContext,
  actingTeamId: string,
  mapId: string
): Promise<{ veto: MapVetoState; error?: string }> {
  const veto = await prisma.matchMapVeto.findUnique({ where: { matchId: match.id } });
  if (!veto) {
    return { veto: (await ensureMatchMapVeto(match))!, error: 'Veto não iniciado.' };
  }
  if (veto.status !== 'BAN_PHASE') {
    return { veto: formatVetoState(match, veto), error: 'Fase de banimento já encerrada.' };
  }
  if (veto.vetoTurnTeamId !== actingTeamId) {
    return { veto: formatVetoState(match, veto), error: 'Não é a vez deste time banir.' };
  }

  const pool = parseMapPoolJson(veto.mapPool);
  const banned = parseBannedMaps(veto.bannedMaps);
  const map = mapId.trim().toLowerCase();
  if (!pool.includes(map) || banned.includes(map)) {
    return { veto: formatVetoState(match, veto), error: 'Mapa inválido ou já banido.' };
  }

  const nextBanned = [...banned, map];
  const otherTeamId = getOtherTeamId(match.team1Id, match.team2Id, veto.firstBanTeamId);
  const bansRequired = bansRequiredForPool(pool.length);

  if (nextBanned.length >= bansRequired) {
    const selectedMap = remainingMaps(pool, nextBanned)[0];
    const sidePickTeamId = getSidePickTeamId(veto.firstBanTeamId, otherTeamId, nextBanned.length);
    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.matchMapVeto.update({
        where: { id: veto.id },
        data: {
          bannedMaps: nextBanned,
          status: 'SIDE_PHASE',
          vetoTurnTeamId: null,
          sidePickTeamId,
          lastActionAt: new Date(),
        },
      });
      await tx.match.update({
        where: { id: match.id },
        data: { map: selectedMap },
      });
      return v;
    });
    const freshMatch = { ...match, map: selectedMap };
    return { veto: formatVetoState(freshMatch, updated) };
  }

  const nextTurn = getBanTeamForStep(veto.firstBanTeamId, otherTeamId, nextBanned.length);
  const updated = await prisma.matchMapVeto.update({
    where: { id: veto.id },
    data: {
      bannedMaps: nextBanned,
      vetoTurnTeamId: nextTurn,
      lastActionAt: new Date(),
    },
  });
  return { veto: formatVetoState(match, updated) };
}

export async function pickSideForMatch(
  match: MatchContext,
  actingTeamId: string,
  side: GameSide
): Promise<{ veto: MapVetoState; error?: string }> {
  const veto = await prisma.matchMapVeto.findUnique({ where: { matchId: match.id } });
  if (!veto) {
    return { veto: (await ensureMatchMapVeto(match))!, error: 'Veto não iniciado.' };
  }
  if (veto.status !== 'SIDE_PHASE') {
    return { veto: formatVetoState(match, veto), error: 'Escolha de lado não está disponível.' };
  }
  if (veto.sidePickTeamId !== actingTeamId) {
    return { veto: formatVetoState(match, veto), error: 'Não é a vez deste time escolher o lado.' };
  }
  if (side !== 'CT' && side !== 'T') {
    return { veto: formatVetoState(match, veto), error: 'Lado inválido.' };
  }

  const sides = applyStartingSides(actingTeamId, match.team1Id, match.team2Id, side);
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.matchMapVeto.update({
      where: { id: veto.id },
      data: {
        status: 'COMPLETED',
        vetoTurnTeamId: null,
        lastActionAt: new Date(),
      },
    });
    await tx.match.update({
      where: { id: match.id },
      data: {
        team1StartingSide: sides.team1StartingSide,
        team2StartingSide: sides.team2StartingSide,
      },
    });
    return v;
  });

  const freshMatch = {
    ...match,
    team1StartingSide: sides.team1StartingSide,
    team2StartingSide: sides.team2StartingSide,
  };
  return { veto: formatVetoState(freshMatch, updated) };
}

async function autoCompleteVeto(match: MatchContext, veto: MatchMapVeto, autoResolved: boolean) {
  const pool = parseMapPoolJson(veto.mapPool);
  let banned = [...parseBannedMaps(veto.bannedMaps)];
  const otherTeamId = getOtherTeamId(match.team1Id, match.team2Id, veto.firstBanTeamId);
  const bansRequired = bansRequiredForPool(pool.length);

  while (veto.status === 'BAN_PHASE' && banned.length < bansRequired) {
    const rem = remainingMaps(pool, banned);
    if (rem.length <= 1) break;
    const turnTeam = veto.vetoTurnTeamId
      ?? getBanTeamForStep(veto.firstBanTeamId, otherTeamId, banned.length);
    const randomMap = pickRandomFrom(rem);
    banned = [...banned, randomMap];
    veto = await prisma.matchMapVeto.update({
      where: { id: veto.id },
      data: {
        bannedMaps: banned,
        autoResolved,
        lastActionAt: new Date(),
      },
    });
    if (banned.length >= bansRequired) {
      const selectedMap = remainingMaps(pool, banned)[0];
      const sidePickTeamId = getSidePickTeamId(veto.firstBanTeamId, otherTeamId, banned.length);
      veto = await prisma.matchMapVeto.update({
        where: { id: veto.id },
        data: {
          status: 'SIDE_PHASE',
          vetoTurnTeamId: null,
          sidePickTeamId,
        },
      });
      await prisma.match.update({
        where: { id: match.id },
        data: { map: selectedMap },
      });
      match = { ...match, map: selectedMap };
      break;
    }
    const nextTurn = getBanTeamForStep(veto.firstBanTeamId, otherTeamId, banned.length);
    veto = await prisma.matchMapVeto.update({
      where: { id: veto.id },
      data: { vetoTurnTeamId: nextTurn },
    });
  }

  if (veto.status === 'SIDE_PHASE' && veto.sidePickTeamId) {
    const randomSide: GameSide = Math.random() < 0.5 ? 'CT' : 'T';
    const sides = applyStartingSides(
      veto.sidePickTeamId,
      match.team1Id,
      match.team2Id,
      randomSide
    );
    veto = await prisma.matchMapVeto.update({
      where: { id: veto.id },
      data: {
        status: 'COMPLETED',
        autoResolved: true,
        vetoTurnTeamId: null,
        lastActionAt: new Date(),
      },
    });
    await prisma.match.update({
      where: { id: match.id },
      data: {
        team1StartingSide: sides.team1StartingSide,
        team2StartingSide: sides.team2StartingSide,
      },
    });
    match = {
      ...match,
      team1StartingSide: sides.team1StartingSide,
      team2StartingSide: sides.team2StartingSide,
    };
  }

  return veto;
}

export function formatVetoState(match: MatchContext, veto: MatchMapVeto): MapVetoState & { autoResolved: boolean } {
  const view = buildMapVetoView({
    mapPool: parseMapPoolJson(veto.mapPool),
    bannedMaps: parseBannedMaps(veto.bannedMaps),
    firstBanTeamId: veto.firstBanTeamId,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    vetoTurnTeamId: veto.vetoTurnTeamId,
    sidePickTeamId: veto.sidePickTeamId,
    status: veto.status,
    selectedMap: match.map,
    team1StartingSide: match.team1StartingSide,
    team2StartingSide: match.team2StartingSide,
    lastActionAt: veto.lastActionAt,
  });
  return {
    ...view,
    status: view.status.toLowerCase() as MapVetoState['status'],
    autoResolved: veto.autoResolved,
  };
}

export async function initializeMatchMapVeto(
  matchId: string,
  team1Id: string,
  team2Id: string,
  mapPool: string[],
  mapVetoEnabled: boolean
): Promise<void> {
  if (!mapVetoEnabled) return;
  const firstBanTeamId = coinFlipFirstBanTeam(team1Id, team2Id);
  await prisma.matchMapVeto.create({
    data: {
      matchId,
      mapPool,
      bannedMaps: [],
      firstBanTeamId,
      vetoTurnTeamId: firstBanTeamId,
      status: 'BAN_PHASE',
    },
  });
}

export async function afterMatchCreated(
  matchId: string,
  team1Id: string,
  team2Id: string,
  leagueId: string
): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { seriesId: true },
  });
  if (match?.seriesId) {
    const series = await prisma.matchSeries.findUnique({
      where: { id: match.seriesId },
      select: { format: true },
    });
    if (series?.format === 'BO3') return;
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { mapPool: true, mapVetoEnabled: true },
  });
  if (!league?.mapVetoEnabled) return;
  const existing = await prisma.matchMapVeto.findUnique({ where: { matchId } });
  if (existing) return;
  const mapPool = parseMapPool(league.mapPool);
  await initializeMatchMapVeto(matchId, team1Id, team2Id, mapPool, true);
}

export async function upsertMatchLineup(
  matchId: string,
  team1Id: string,
  team2Id: string,
  team1PlayerUserId: string,
  team2PlayerUserId: string
): Promise<void> {
  await prisma.$transaction([
    prisma.matchLineup.upsert({
      where: { matchId_teamId: { matchId, teamId: team1Id } },
      create: { matchId, teamId: team1Id, userId: team1PlayerUserId },
      update: { userId: team1PlayerUserId },
    }),
    prisma.matchLineup.upsert({
      where: { matchId_teamId: { matchId, teamId: team2Id } },
      create: { matchId, teamId: team2Id, userId: team2PlayerUserId },
      update: { userId: team2PlayerUserId },
    }),
  ]);
}
