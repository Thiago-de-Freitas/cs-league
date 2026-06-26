import { prisma } from './prisma';
import {
  balancePlayersIntoTeams,
  buildDefaultPlayerStats,
  parsePickupBalanceMode,
  parsePickupBalanceModes,
  serializePickupBalanceModesForApi,
  type PickupBalanceMode,
} from './pickupBalance';
import { calcRating } from './rankings';
import { getAverageAdrBySteamIds } from './teamMemberStats';
import { getPlayerPositionLabel, type PlayerPosition } from './playerPosition';
import { publicUploadUrlForResponse } from './uploadAssets';
import { createMatchSeries } from './matchSeriesService';
import { afterMatchCreated } from './mapVetoService';
import { parseMapPool } from './cs2Maps';

export const PICKUP_LEAGUE_FIXED_TEAM_COUNT = 2;

export type PickupPlayerView = {
  id: string;
  userId: string;
  displayName: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: PlayerPosition | null;
  positionLabel: string | null;
  teamId: string | null;
  adr: number | null;
  hsPercent: number | null;
  rating: number | null;
  matches: number;
};

export type PickupSquadView = {
  id: string;
  name: string;
  tag: string;
  seed: number | null;
  players: PickupPlayerView[];
  teamRating: number | null;
};

export type PickupLeagueState = {
  teamCount: number;
  playersPerTeam: number;
  balanceMode: string;
  balanceModes: string[];
  balancedAt: string | null;
  pool: PickupPlayerView[];
  squads: PickupSquadView[];
};

async function loadHsAndRatingBySteam(steamIds: string[]): Promise<Map<string, { hsPercent: number; rating: number; matches: number }>> {
  const normalized = [...new Set(steamIds.map((id) => id.trim()).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      steamId: { in: normalized },
      demo: {
        isPersonal: false,
        status: 'COMPLETED',
        matchId: { not: null },
      },
    },
    select: {
      steamId: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
      demo: { select: { matchId: true } },
    },
  });

  const perMatch = new Map<string, { kills: number; deaths: number; adr: number; hs: number; kast: number }>();
  for (const row of stats) {
    const sid = row.steamId?.trim().toLowerCase();
    const matchId = row.demo.matchId;
    if (!sid || !matchId) continue;
    const key = `${sid}|${matchId}`;
    const existing = perMatch.get(key);
    if (!existing || row.adr > existing.adr) {
      perMatch.set(key, {
        kills: row.kills,
        deaths: row.deaths,
        adr: row.adr,
        hs: row.hsPercent,
        kast: row.kast,
      });
    }
  }

  const perPlayer = new Map<string, Array<{ kd: number; adr: number; hs: number; kast: number }>>();
  for (const [key, row] of perMatch) {
    const steamKey = key.split('|')[0]!;
    const kd = row.deaths > 0 ? row.kills / row.deaths : row.kills;
    const list = perPlayer.get(steamKey) ?? [];
    list.push({ kd, adr: row.adr, hs: row.hs, kast: row.kast });
    perPlayer.set(steamKey, list);
  }

  const result = new Map<string, { hsPercent: number; rating: number; matches: number }>();
  for (const [steamKey, rows] of perPlayer) {
    const avgHs = rows.reduce((s, r) => s + r.hs, 0) / rows.length;
    const avgAdr = rows.reduce((s, r) => s + r.adr, 0) / rows.length;
    const avgKast = rows.reduce((s, r) => s + r.kast, 0) / rows.length;
    const avgKd = rows.reduce((s, r) => s + r.kd, 0) / rows.length;
    result.set(steamKey, {
      hsPercent: Math.round(avgHs * 10) / 10,
      rating: calcRating(avgKd, avgAdr, avgKast, avgHs),
      matches: rows.length,
    });
  }
  return result;
}

function squadRating(players: PickupPlayerView[]): number | null {
  const ratings = players.map((p) => p.rating).filter((v): v is number => v != null);
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 100) / 100;
}

export async function formatPickupPlayer(
  entry: {
    id: string;
    userId: string;
    teamId: string | null;
    user: { id: string; displayName: string; steamId: string | null; avatarUrl: string | null; position: PlayerPosition | null };
  },
  adrBySteam: Map<string, { adr: number; matches: number }>,
  extraBySteam: Map<string, { hsPercent: number; rating: number; matches: number }>
): Promise<PickupPlayerView> {
  const steamKey = entry.user.steamId?.trim().toLowerCase() ?? '';
  const adrSummary = steamKey ? adrBySteam.get(steamKey) : undefined;
  const extra = steamKey ? extraBySteam.get(steamKey) : undefined;
  const adr = adrSummary?.adr ?? null;
  const hsPercent = extra?.hsPercent ?? null;
  const rating = extra?.rating ?? (adr != null ? calcRating(1, adr, 70, hsPercent ?? 35) : null);

  return {
    id: entry.id,
    userId: entry.userId,
    displayName: entry.user.displayName,
    steamId: entry.user.steamId,
    avatarUrl: publicUploadUrlForResponse(entry.user.avatarUrl),
    position: entry.user.position,
    positionLabel: entry.user.position ? getPlayerPositionLabel(entry.user.position) : null,
    teamId: entry.teamId,
    adr,
    hsPercent,
    rating,
    matches: adrSummary?.matches ?? extra?.matches ?? 0,
  };
}

export async function getPickupLeagueState(leagueId: string): Promise<PickupLeagueState> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      ownerId: true,
      pickupTeamCount: true,
      pickupPlayersPerTeam: true,
      pickupBalanceMode: true,
      pickupBalanceModes: true,
      pickupBalancedAt: true,
    },
  });
  if (!league) throw new Error('Liga não encontrada');

  await ensureEphemeralSquads(leagueId, league.ownerId, PICKUP_LEAGUE_FIXED_TEAM_COUNT);

  const [entries, squads] = await Promise.all([
    prisma.leaguePlayerEntry.findMany({
      where: { leagueId },
      include: {
        user: { select: { id: true, displayName: true, steamId: true, avatarUrl: true, position: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId, team: { leagueId } },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            tag: true,
            members: {
              select: { user: { select: { steamId: true } } },
            },
          },
        },
      },
      orderBy: [{ seed: 'asc' }, { team: { name: 'asc' } }],
    }),
  ]);

  const steamIds = entries.map((e) => e.user.steamId).filter((id): id is string => !!id?.trim());
  const [adrBySteam, extraBySteam] = await Promise.all([
    getAverageAdrBySteamIds(steamIds),
    loadHsAndRatingBySteam(steamIds),
  ]);

  const players = await Promise.all(entries.map((e) => formatPickupPlayer(e, adrBySteam, extraBySteam)));
  const pool = players.filter((p) => !p.teamId);
  const squadViews: PickupSquadView[] = squads.map((lt) => {
    const squadPlayers = players.filter((p) => p.teamId === lt.teamId);
    return {
      id: lt.team.id,
      name: lt.team.name,
      tag: lt.team.tag,
      seed: lt.seed,
      players: squadPlayers,
      teamRating: squadRating(squadPlayers),
    };
  });

  const balanceModesInternal = resolveStoredPickupBalanceModes(league.pickupBalanceModes, league.pickupBalanceMode);
  const balanceModesApi = serializePickupBalanceModesForApi(balanceModesInternal);

  return {
    teamCount: PICKUP_LEAGUE_FIXED_TEAM_COUNT,
    playersPerTeam: league.pickupPlayersPerTeam,
    balanceMode: balanceModesApi[0] ?? 'rating',
    balanceModes: balanceModesApi,
    balancedAt: league.pickupBalancedAt?.toISOString() ?? null,
    pool,
    squads: squadViews,
  };
}

function resolveStoredPickupBalanceModes(
  modes: PickupBalanceMode[] | null | undefined,
  fallback: PickupBalanceMode | null | undefined
): PickupBalanceMode[] {
  if (modes && modes.length > 0) return parsePickupBalanceModes(modes);
  return parsePickupBalanceModes(fallback ?? 'RATING');
}

export async function ensureEphemeralSquads(
  leagueId: string,
  ownerId: string,
  teamCount: number
): Promise<Array<{ id: string; name: string; tag: string }>> {
  const existing = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { createdAt: 'asc' },
  });

  const squads = [...existing];
  for (let i = squads.length; i < teamCount; i++) {
    const num = i + 1;
    const created = await prisma.team.create({
      data: {
        name: `Time ${num}`,
        tag: `T${num}`,
        ownerId,
        leagueId,
      },
    });
    await prisma.leagueTeam.create({
      data: { leagueId, teamId: created.id, seed: num },
    });
    squads.push(created);
  }

  return squads.slice(0, teamCount).map((s) => ({ id: s.id, name: s.name, tag: s.tag }));
}

async function syncEphemeralRoster(teamId: string, userIds: string[]): Promise<void> {
  await prisma.teamMember.deleteMany({ where: { teamId } });
  if (userIds.length === 0) return;
  await prisma.teamMember.createMany({
    data: userIds.map((userId) => ({ teamId, userId, role: 'MEMBER' })),
    skipDuplicates: true,
  });
}

export async function assignPlayerToSquad(
  leagueId: string,
  userId: string,
  teamId: string | null
): Promise<void> {
  const entry = await prisma.leaguePlayerEntry.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!entry) throw new Error('Jogador não está na liga.');

  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, leagueId } });
    if (!team) throw new Error('Time não pertence a esta liga.');
  }

  const previousTeamId = entry.teamId;
  await prisma.leaguePlayerEntry.update({
    where: { id: entry.id },
    data: { teamId },
  });

  const refreshRoster = async (tid: string | null) => {
    if (!tid) return;
    const assigned = await prisma.leaguePlayerEntry.findMany({
      where: { leagueId, teamId: tid },
      select: { userId: true },
    });
    await syncEphemeralRoster(tid, assigned.map((a) => a.userId));
  };

  await refreshRoster(previousTeamId);
  await refreshRoster(teamId);
}

export async function balancePickupLeague(
  leagueId: string,
  ownerId: string,
  options: {
    teamCount: number;
    playersPerTeam: number;
    balanceMode?: PickupBalanceMode;
    balanceModes?: PickupBalanceMode[];
  }
): Promise<void> {
  const entries = await prisma.leaguePlayerEntry.findMany({
    where: { leagueId },
    include: {
      user: { select: { id: true, steamId: true, position: true } },
    },
  });

  const steamIds = entries.map((e) => e.user.steamId).filter((id): id is string => !!id?.trim());
  const [adrBySteam, extraBySteam] = await Promise.all([
    getAverageAdrBySteamIds(steamIds),
    loadHsAndRatingBySteam(steamIds),
  ]);

  const players = entries.map((e) => {
    const steamKey = e.user.steamId?.trim().toLowerCase() ?? '';
    const adr = steamKey ? adrBySteam.get(steamKey)?.adr ?? null : null;
    const extra = steamKey ? extraBySteam.get(steamKey) : undefined;
    return buildDefaultPlayerStats(
      e.userId,
      e.user.position,
      adr,
      extra?.hsPercent ?? null,
      extra?.rating ?? null
    );
  });

  const balanceModes = resolveStoredPickupBalanceModes(options.balanceModes, options.balanceMode ?? 'RATING');
  const assignments = balancePlayersIntoTeams(
    players,
    PICKUP_LEAGUE_FIXED_TEAM_COUNT,
    options.playersPerTeam,
    balanceModes
  );

  const squads = await ensureEphemeralSquads(leagueId, ownerId, PICKUP_LEAGUE_FIXED_TEAM_COUNT);

  await prisma.leaguePlayerEntry.updateMany({
    where: { leagueId },
    data: { teamId: null },
  });

  for (const squad of squads) {
    await syncEphemeralRoster(squad.id, []);
  }

  const byTeamIndex = new Map<number, string[]>();
  for (const assignment of assignments) {
    const list = byTeamIndex.get(assignment.teamIndex) ?? [];
    list.push(assignment.userId);
    byTeamIndex.set(assignment.teamIndex, list);
  }

  for (const [teamIndex, userIds] of byTeamIndex) {
    const squad = squads[teamIndex];
    if (!squad) continue;
    for (const userId of userIds) {
      await prisma.leaguePlayerEntry.update({
        where: { leagueId_userId: { leagueId, userId } },
        data: { teamId: squad.id },
      });
    }
    await syncEphemeralRoster(squad.id, userIds);
  }

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      pickupTeamCount: PICKUP_LEAGUE_FIXED_TEAM_COUNT,
      pickupPlayersPerTeam: options.playersPerTeam,
      pickupBalanceMode: balanceModes[0] ?? 'RATING',
      pickupBalanceModes: balanceModes,
      pickupBalancedAt: new Date(),
    },
  });
}

export async function updatePickupSquads(
  leagueId: string,
  squads: Array<{ id: string; name: string; tag: string }>
): Promise<void> {
  if (squads.length !== PICKUP_LEAGUE_FIXED_TEAM_COUNT) {
    throw new Error(`Informe exatamente ${PICKUP_LEAGUE_FIXED_TEAM_COUNT} times.`);
  }

  for (const squad of squads) {
    const name = String(squad.name ?? '').trim();
    const tag = String(squad.tag ?? '').trim().toUpperCase();
    if (!name || name.length > 80) throw new Error('Nome do time inválido.');
    if (!tag || tag.length > 8) throw new Error('Tag do time inválida.');

    const team = await prisma.team.findFirst({ where: { id: squad.id, leagueId } });
    if (!team) throw new Error('Time não pertence a esta liga.');

    await prisma.team.update({
      where: { id: squad.id },
      data: { name, tag },
    });
  }
}

export async function startPickupLeagueMatch(leagueId: string): Promise<{ matchId: string; seriesId: string; matchIds: string[] }> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      ownerId: true,
      format: true,
      mapPool: true,
      mapVetoEnabled: true,
      seriesFormat: true,
    },
  });
  if (!league) throw new Error('Liga não encontrada.');
  if (league.format !== 'ONE_VS_ONE') throw new Error('Esta liga não é individual.');

  const existingMatches = await prisma.match.count({ where: { leagueId } });
  if (existingMatches > 0) throw new Error('O confronto desta liga já foi iniciado.');

  const squads = await ensureEphemeralSquads(leagueId, league.ownerId, PICKUP_LEAGUE_FIXED_TEAM_COUNT);
  if (squads.length < PICKUP_LEAGUE_FIXED_TEAM_COUNT) {
    throw new Error('Configure os dois times antes de iniciar o confronto.');
  }

  const [team1, team2] = squads;
  const rosterCounts = await Promise.all(
    squads.map((squad) =>
      prisma.leaguePlayerEntry.count({ where: { leagueId, teamId: squad.id } })
    )
  );
  if (rosterCounts.some((count) => count < 1)) {
    throw new Error('Cada time precisa de pelo menos um jogador antes de iniciar o confronto.');
  }

  const mapPool = parseMapPool(league.mapPool);
  const { seriesId, matchIds } = await createMatchSeries({
    leagueId,
    team1Id: team1!.id,
    team2Id: team2!.id,
    format: league.seriesFormat ?? 'BO1',
    mapPool,
    mapVetoEnabled: league.mapVetoEnabled,
    phase: 'PLAYOFF',
    round: 1,
    bracketPosition: 1,
  });

  for (const matchId of matchIds) {
    await afterMatchCreated(matchId, team1!.id, team2!.id, leagueId);
  }

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      status: 'ONGOING',
      registrationOpen: false,
      bracketSize: PICKUP_LEAGUE_FIXED_TEAM_COUNT,
      pickupTeamCount: PICKUP_LEAGUE_FIXED_TEAM_COUNT,
    },
  });

  return { matchId: matchIds[0]!, seriesId, matchIds };
}

export async function releasePickupPlayers(leagueId: string): Promise<void> {
  const ephemeralTeams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });
  const teamIds = ephemeralTeams.map((t) => t.id);
  await prisma.leaguePlayerEntry.deleteMany({ where: { leagueId } });
  if (teamIds.length > 0) {
    await prisma.teamMember.deleteMany({ where: { teamId: { in: teamIds } } });
  }
}

export async function cleanupEphemeralLeagueData(leagueId: string): Promise<void> {
  const ephemeralTeams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });
  const teamIds = ephemeralTeams.map((t) => t.id);
  if (teamIds.length === 0) {
    await prisma.leaguePlayerEntry.deleteMany({ where: { leagueId } });
    return;
  }

  await prisma.$transaction([
    prisma.leaguePlayerEntry.deleteMany({ where: { leagueId } }),
    prisma.teamMember.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.leagueTeam.deleteMany({ where: { leagueId, teamId: { in: teamIds } } }),
    prisma.team.deleteMany({ where: { id: { in: teamIds } } }),
  ]);
}

export const EPHEMERAL_TEAM_FILTER = { leagueId: null } as const;
