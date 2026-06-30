import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import {
  getFairBracketSize,
  getFirstRoundPairings,
  hasRegistrationSlots,
  isValidRegistrationCap,
  parseRegistrationCap,
  rankTeamsForSeeding,
  resolveBracketSize,
} from '../lib/bracket';
import { tryGenerateGroupStagePlayoffs } from '../lib/generateGroupStagePlayoffs';
import { advanceBracketFromRound } from '../lib/bracketAdvance';
import { canUserAccessLeague } from '../lib/leaguePermissions';
import { canUserRegisterTeam } from '../lib/leagueRegistration';
import { isAdmin } from '../lib/permissions';
import {
  areAllGroupMatchesComplete,
  computeGroupStandings,
  countRoundRobinMatches,
  distributeTeamsIntoGroups,
  generateRoundRobinPairings,
  isValidAdvancePerGroup,
  isValidGroupCount,
  isValidMatchesPerMatchDay,
  parseHomeAndAway,
  parseMatchesPerMatchDay,
  validateGroupStageConfig,
} from '../lib/groupStage';
import {
  isScheduleConfigured,
  isValidScheduleTimezone,
  parseDefaultMatchDays,
  parseWeekOverrideDays,
  parseMatchTime,
  parseScheduleStartDate,
  parseWeekStartParam,
  weekStartKey,
  DEFAULT_SCHEDULE_TIMEZONE,
} from '../lib/matchSchedule';
import { applyGroupMatchSchedule, leagueToScheduleConfig, loadWeekOverrides, syncLeagueEndDate } from '../lib/applyLeagueSchedule';
import { deleteLeagueCompletely } from '../lib/leagueDeletion';
import { releasePickupPlayers, PICKUP_LEAGUE_FIXED_TEAM_COUNT, ensureEphemeralSquads } from '../lib/pickupLeague';
import { roundDifference } from '../lib/matchResult';
import { getAverageAdrBySteamIds, type PlayerAdrSummary } from '../lib/teamMemberStats';
import { publicUploadUrlForResponse } from '../lib/uploadAssets';
import { auditResponseMiddleware } from '../middleware/auditResponse';
import { audit, setAuditContext } from '../lib/audit';
import { buildAvailableTeamsWhere } from '../lib/leagueAvailableTeams';
import { syncGroupStageMatches } from '../lib/syncGroupStageMatches';
import { afterMatchCreated, initializeMatchMapVeto, upsertMatchLineup } from '../lib/mapVetoService';
import { getMapLabel, parseMapPool, validateMapPoolForSeriesFormat } from '../lib/cs2Maps';
import { createPlayoffSlot } from '../lib/playoffMatchFactory';
import { createMatchSeries } from '../lib/matchSeriesService';
import {
  isValidPickupPlayersPerTeam,
  isValidPickupTeamCount,
  parsePickupBalanceModesFromApi,
} from '../lib/pickupBalance';
import leaguePickupRoutes from './leaguePickup';

const router = Router();
router.use(leaguePickupRoutes);
router.use(auditResponseMiddleware);

const teamWithRosterSelect = {
  id: true,
  name: true,
  tag: true,
  logoUrl: true,
  ownerId: true,
  members: {
    select: {
      role: true,
      memberTag: true,
      user: { select: { id: true, displayName: true, steamId: true, position: true } },
    },
  },
} as const;

const matchWithTeamsSelect = {
  team1: { select: { id: true, name: true, tag: true } },
  team2: { select: { id: true, name: true, tag: true } },
  winner: { select: { id: true, name: true, tag: true } },
  series: {
    select: {
      id: true,
      format: true,
      team1MapWins: true,
      team2MapWins: true,
      winnerId: true,
      status: true,
    },
  },
} as const;

async function getMatchIdsWithGeneralDemo(leagueId: string): Promise<Set<string>> {
  const demos = await prisma.demo.findMany({
    where: {
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      match: { leagueId },
    },
    select: { matchId: true },
  });
  return new Set(demos.map((d) => d.matchId).filter((id): id is string => !!id));
}

async function getLeagueWithDetails(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      owner: { select: { id: true, displayName: true } },
      groups: {
        orderBy: { order: 'asc' },
        include: {
          teams: {
            include: {
              team: { select: teamWithRosterSelect },
            },
          },
        },
      },
      teams: {
        include: {
          team: { select: teamWithRosterSelect },
        },
        orderBy: [{ seed: 'asc' }, { points: 'desc' }, { wins: 'desc' }],
      },
      matches: {
        include: matchWithTeamsSelect,
        orderBy: [
          { phase: 'asc' },
          { round: 'asc' },
          { groupRound: 'asc' },
          { bracketPosition: 'asc' },
          { seriesGameNumber: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });
}

function computeTeamAdr(players: { adr: number | null }[]): number | null {
  const values = players.map((p) => p.adr).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

function collectSteamIdsFromRosters(
  leagueTeams: Array<{
    team: { members: { user: { steamId: string | null } }[] };
  }>
): string[] {
  return leagueTeams.flatMap((lt) =>
    lt.team.members.map((m) => m.user.steamId).filter((id): id is string => !!id?.trim())
  );
}

async function buildAdrMapForLeagueTeams(
  leagueTeams: Array<{
    team: { members: { user: { steamId: string | null } }[] };
  }>
): Promise<Map<string, PlayerAdrSummary>> {
  return getAverageAdrBySteamIds(collectSteamIdsFromRosters(leagueTeams));
}

function formatTeamFromLeagueTeam(
  lt: {
  team: {
    id: string;
    name: string;
    tag: string;
    logoUrl: string | null;
    ownerId: string;
    members: {
      user: { id: string; displayName: string; steamId: string | null; position: string | null };
      role: string;
      memberTag: string | null;
    }[];
  };
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  seed: number | null;
  groupId?: string | null;
},
  adrBySteam: Map<string, PlayerAdrSummary> = new Map()
) {
  const players = lt.team.members.map((m) => {
    const steamKey = m.user.steamId?.trim().toLowerCase() ?? '';
    const adrSummary = steamKey ? adrBySteam.get(steamKey) : undefined;
    return {
      id: m.user.id,
      name: m.user.displayName,
      IGN: m.user.displayName,
      role: m.role,
      memberTag: m.memberTag,
      position: m.user.position,
      adr: adrSummary?.adr ?? null,
      matches: adrSummary?.matches ?? 0,
    };
  });

  return {
    id: lt.team.id,
    name: lt.team.name,
    tag: lt.team.tag,
    logoUrl: publicUploadUrlForResponse(lt.team.logoUrl),
    ownerId: lt.team.ownerId,
    wins: lt.wins,
    losses: lt.losses,
    draws: lt.draws,
    points: lt.points,
    roundsWon: lt.roundsWon,
    roundsLost: lt.roundsLost,
    roundDifference: roundDifference(lt.roundsWon, lt.roundsLost),
    seed: lt.seed,
    groupId: lt.groupId ?? null,
    teamAdr: computeTeamAdr(players),
    players,
  };
}

function formatLeague(
  league: NonNullable<Awaited<ReturnType<typeof getLeagueWithDetails>>>,
  matchIdsWithDemo: Set<string> = new Set(),
  weekOverrides: { weekStart: string; daysOfWeek: number[] }[] = [],
  adrBySteam: Map<string, PlayerAdrSummary> = new Map()
) {
  const groupMatches = league.matches.filter((m) => m.phase === 'GROUP');
  const playoffMatches = league.matches.filter((m) => m.phase === 'PLAYOFF');
  const groupPhaseComplete = groupMatches.length > 0 && areAllGroupMatchesComplete(groupMatches);
  const playoffGenerated = playoffMatches.some((m) => m.round > 0);

  const matchesByGroupId = new Map<string, typeof league.matches>();
  for (const m of groupMatches) {
    if (!m.groupId) continue;
    const list = matchesByGroupId.get(m.groupId) ?? [];
    list.push(m);
    matchesByGroupId.set(m.groupId, list);
  }

  const formatMatch = (m: (typeof league.matches)[number]) => ({
    id: m.id,
    leagueId: m.leagueId,
    team1: m.team1,
    team2: m.team2,
    winner: m.winner,
    winnerId: m.winnerId,
    status: m.status.toLowerCase(),
    phase: m.phase.toLowerCase(),
    groupId: m.groupId,
    groupRound: m.groupRound,
    round: m.round,
    bracketPosition: m.bracketPosition,
    map: m.map,
    mapLabel: m.map ? getMapLabel(m.map) : null,
    seriesId: m.seriesId,
    seriesGameNumber: m.seriesGameNumber,
    seriesStatus: m.series?.status?.toLowerCase() ?? null,
    seriesWinnerId: m.series?.winnerId ?? null,
    team1MapWins: m.series?.team1MapWins ?? null,
    team2MapWins: m.series?.team2MapWins ?? null,
    team1Rounds: m.team1Rounds,
    team2Rounds: m.team2Rounds,
    scheduledAt: m.scheduledAt,
    playedAt: m.playedAt,
    hasGeneralDemo: matchIdsWithDemo.has(m.id),
  });

  const groups = league.groups.map((g) => {
    const gMatches = matchesByGroupId.get(g.id) ?? [];
    const teamIds = g.teams.map((lt) => lt.teamId);
    const standings = computeGroupStandings(
      teamIds,
      gMatches.map((m) => ({
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        winnerId: m.winnerId,
        status: m.status,
        team1Rounds: m.team1Rounds,
        team2Rounds: m.team2Rounds,
      }))
    );
    return {
      id: g.id,
      name: g.name,
      order: g.order,
      teams: g.teams.map((lt) => formatTeamFromLeagueTeam(lt, adrBySteam)),
      standings: standings.map((s) => {
        const lt = g.teams.find((t) => t.teamId === s.teamId);
        return {
          ...s,
          team: lt
            ? { id: lt.team.id, name: lt.team.name, tag: lt.team.tag }
            : { id: s.teamId, name: '', tag: '' },
        };
      }),
      matches: gMatches.map(formatMatch),
      expectedMatches: countRoundRobinMatches(teamIds.length, league.homeAndAway),
      matchesComplete: gMatches.length > 0 && areAllGroupMatchesComplete(gMatches),
    };
  });

  return {
    id: league.id,
    name: league.name,
    description: league.description,
    status: league.status.toLowerCase(),
    format: league.format.toLowerCase(),
    maxTeams: league.maxTeams,
    bracketSize: league.bracketSize,
    groupCount: league.groupCount,
    advancePerGroup: league.advancePerGroup,
    homeAndAway: league.homeAndAway,
    matchesPerMatchDay: league.matchesPerMatchDay,
    effectiveBracketSize: resolveBracketSize(league.teams.length, league.bracketSize),
    registrationOpen: league.registrationOpen,
    groupPhaseGenerated: groupMatches.length > 0,
    groupPhaseComplete,
    playoffGenerated,
    ownerId: league.ownerId,
    owner: league.owner,
    startDate: league.startDate,
    endDate: league.endDate,
    defaultMatchDays: parseDefaultMatchDays(league.defaultMatchDays) ?? [],
    defaultMatchTime: league.defaultMatchTime,
    scheduleTimezone: league.scheduleTimezone,
    scheduleConfigured: isScheduleConfigured(leagueToScheduleConfig(league)),
    scheduleWeekOverrides: weekOverrides,
    mapPool: parseMapPool(league.mapPool),
    mapVetoEnabled: league.mapVetoEnabled,
    seriesFormat: league.seriesFormat.toLowerCase(),
    pickupTeamCount: league.pickupTeamCount,
    pickupPlayersPerTeam: league.pickupPlayersPerTeam,
    pickupBalanceMode: league.pickupBalanceMode?.toLowerCase() ?? 'rating',
    pickupBalanceModes: (league.pickupBalanceModes?.length
      ? league.pickupBalanceModes
      : [league.pickupBalanceMode ?? 'RATING']
    ).map((mode) => mode.toLowerCase()),
    pickupBalancedAt: league.pickupBalancedAt,
    groups,
    teams: league.teams.map((lt) => formatTeamFromLeagueTeam(lt, adrBySteam)),
    matches: league.matches.map(formatMatch),
    createdAt: league.createdAt,
  };
}

async function assertLeagueOwner(leagueId: string, userId: string, role: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return { error: 'Liga não encontrada', status: 404 as const, league: null };
  if (league.ownerId !== userId && role !== 'ADMIN') {
    return { error: 'Sem permissão', status: 403 as const, league: null };
  }
  return { error: null, status: 200 as const, league };
}

async function syncGroupStageMatchesIfNeeded(leagueId: string) {
  const groupMatchCount = await prisma.match.count({
    where: { leagueId, phase: 'GROUP' },
  });
  if (groupMatchCount === 0) return null;

  const result = await prisma.$transaction((tx) => syncGroupStageMatches(tx, leagueId));
  for (const match of result.createdMatchRecords) {
    await afterMatchCreated(match.id, match.team1Id, match.team2Id, leagueId);
  }
  return result;
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userIsAdmin = isAdmin(req.user!);
    const includeArchived = req.query.includeArchived === 'true';
    const leagues = await prisma.league.findMany({
      where: userIsAdmin
        ? (includeArchived ? {} : { status: { not: 'ARCHIVED' as const } })
        : {
            AND: [
              {
                OR: [
                  { ownerId: userId },
                  { teams: { some: { team: { members: { some: { userId } } } } } },
                ],
              },
              ...(includeArchived ? [] : [{ status: { not: 'ARCHIVED' as const } }]),
            ],
          },
      include: {
        teams: {
          include: {
            team: { select: teamWithRosterSelect },
          },
          orderBy: [{ points: 'desc' }, { wins: 'desc' }, { seed: 'asc' }],
        },
        _count: { select: { teams: true, matches: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const adrBySteam = await buildAdrMapForLeagueTeams(leagues.flatMap((l) => l.teams));

    res.json(
      leagues.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        status: l.status.toLowerCase(),
        maxTeams: l.maxTeams,
        registrationOpen: l.registrationOpen,
        ownerId: l.ownerId,
        startDate: l.startDate,
        endDate: l.endDate,
        teamCount: l._count.teams,
        matchCount: l._count.matches,
        teams: l.teams.map((lt) => formatTeamFromLeagueTeam(lt, adrBySteam)),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar ligas' });
  }
});

router.get('/open', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [ownedTeams, leagues] = await Promise.all([
      prisma.team.findMany({
        where: { ownerId: userId },
        select: { id: true },
      }),
      prisma.league.findMany({
        where: {
          registrationOpen: true,
          status: 'UPCOMING',
        },
        include: {
          owner: { select: { id: true, displayName: true } },
          teams: { select: { teamId: true } },
          _count: { select: { matches: true, teams: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const ownedTeamIds = new Set(ownedTeams.map((t) => t.id));
    res.json(
      leagues
        .filter((l) => l._count.matches === 0 && hasRegistrationSlots(l._count.teams, l.maxTeams))
        .map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description,
          status: l.status.toLowerCase(),
          maxTeams: l.maxTeams,
          registrationOpen: true,
          ownerId: l.ownerId,
          owner: l.owner,
          teamCount: l._count.teams,
          remainingSlots: l.maxTeams == null ? null : l.maxTeams - l._count.teams,
          userHasTeamInLeague: l.teams.some((lt) => ownedTeamIds.has(lt.teamId)),
        }))
    );
  } catch (err) {
    console.error('GET /api/leagues/open', err);
    res.status(500).json({ error: 'Erro ao listar ligas abertas' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const access = await canUserAccessLeague(req.user!.userId, req.user!.role, req.params.id);
    if (!access.allowed) {
      res.status(access.error === 'Liga não encontrada.' ? 404 : 403).json({ error: access.error });
      return;
    }

    const leagueId = req.params.id;
    const leagueMeta = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        format: true,
        ownerId: true,
        _count: { select: { matches: true } },
      },
    });
    if (leagueMeta?.format === 'ONE_VS_ONE' && leagueMeta._count.matches === 0) {
      await ensureEphemeralSquads(leagueId, leagueMeta.ownerId, PICKUP_LEAGUE_FIXED_TEAM_COUNT);
    }

    const [league, matchIdsWithDemo, weekOverrideRows] = await Promise.all([
      getLeagueWithDetails(leagueId),
      getMatchIdsWithGeneralDemo(leagueId),
      prisma.leagueScheduleWeek.findMany({
        where: { leagueId },
        orderBy: { weekStart: 'asc' },
        select: { weekStart: true, daysOfWeek: true },
      }),
    ]);

    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    const weekOverrides = weekOverrideRows.map((r) => ({
      weekStart: weekStartKey(r.weekStart, league.scheduleTimezone),
      daysOfWeek: parseWeekOverrideDays(r.daysOfWeek) ?? [],
    }));

    const allLeagueTeams = [
      ...league.teams,
      ...league.groups.flatMap((g) => g.teams),
    ];
    const adrBySteam = await buildAdrMapForLeagueTeams(allLeagueTeams);

    res.json(formatLeague(league, matchIdsWithDemo, weekOverrides, adrBySteam));
  } catch (err) {
    console.error('GET /api/leagues/:id', err);
    res.status(500).json({ error: 'Erro ao buscar liga' });
  }
});

router.post('/', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, startDate, endDate, status, maxTeams, registrationOpen, format, groupCount, advancePerGroup, homeAndAway, matchesPerMatchDay } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Nome é obrigatório' });
      return;
    }

    if (!isValidRegistrationCap(maxTeams)) {
      res.status(400).json({
        error: 'Limite de vagas inválido. Use entre 2 e 64 ou deixe em branco (ilimitado).',
      });
      return;
    }

    const leagueFormat =
      format?.toUpperCase() === 'ONE_VS_ONE'
        ? 'ONE_VS_ONE'
        : format?.toUpperCase() === 'GROUP_STAGE'
          ? 'GROUP_STAGE'
          : 'SINGLE_ELIMINATION';

    if (leagueFormat === 'ONE_VS_ONE') {
      const mapPool = parseMapPool(req.body?.mapPool);
      const seriesFormat =
        String(req.body?.seriesFormat ?? 'BO1').toUpperCase() === 'BO3' ? 'BO3' : 'BO1';
      const poolError = validateMapPoolForSeriesFormat(mapPool, seriesFormat);
      if (poolError) {
        res.status(400).json({ error: poolError });
        return;
      }
      const mapVetoEnabled = seriesFormat === 'BO3' ? true : req.body?.mapVetoEnabled !== false;

      const pickupTeamCount = PICKUP_LEAGUE_FIXED_TEAM_COUNT;
      const pickupPlayersPerTeam = isValidPickupPlayersPerTeam(Number(req.body?.pickupPlayersPerTeam))
        ? Number(req.body.pickupPlayersPerTeam)
        : 5;
      const pickupBalanceModes = parsePickupBalanceModesFromApi(req.body?.pickupBalanceModes ?? req.body?.pickupBalanceMode);

      const league = await prisma.league.create({
        data: {
          name,
          description: description || '',
          maxTeams: null,
          registrationOpen: false,
          format: 'ONE_VS_ONE',
          groupCount: 1,
          advancePerGroup: 1,
          homeAndAway: false,
          matchesPerMatchDay: 0,
          mapVetoEnabled,
          mapPool,
          seriesFormat,
          pickupTeamCount,
          pickupPlayersPerTeam,
          pickupBalanceMode: pickupBalanceModes[0] ?? 'RATING',
          pickupBalanceModes,
          ownerId: req.user!.userId,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          status:
            req.user!.role === 'ADMIN' && status?.toUpperCase()
              ? status.toUpperCase()
              : 'UPCOMING',
        },
      });
      const full = await getLeagueWithDetails(league.id);
      setAuditContext(req, audit.of('league.create', 'League', league.id, {
        after: { name: league.name, format: league.format },
      }));
      res.status(201).json(formatLeague(full!));
      return;
    }

    const groups = leagueFormat === 'GROUP_STAGE' && isValidGroupCount(groupCount) ? Number(groupCount) : 2;
    const advance =
      leagueFormat === 'GROUP_STAGE' && isValidAdvancePerGroup(advancePerGroup, groups)
        ? Number(advancePerGroup)
        : 2;

    const registrationCap = parseRegistrationCap(maxTeams);
    const resolvedMapPool = parseMapPool(req.body?.mapPool);
    const resolvedSeriesFormat =
      String(req.body?.seriesFormat ?? 'BO1').toUpperCase() === 'BO3' ? 'BO3' : 'BO1';
    const poolError = validateMapPoolForSeriesFormat(resolvedMapPool, resolvedSeriesFormat);
    if (poolError) {
      res.status(400).json({ error: poolError });
      return;
    }
    const resolvedMapVeto =
      resolvedSeriesFormat === 'BO3' ? true : req.body?.mapVetoEnabled !== false;

    const groupStageOptions =
      leagueFormat === 'GROUP_STAGE'
        ? {
            homeAndAway: parseHomeAndAway(homeAndAway),
            matchesPerMatchDay: isValidMatchesPerMatchDay(matchesPerMatchDay)
              ? Number(matchesPerMatchDay)
              : 2,
          }
        : {
            homeAndAway: false,
            matchesPerMatchDay: 0,
          };

    const league = await prisma.league.create({
      data: {
        name,
        description: description || '',
        maxTeams: registrationCap,
        registrationOpen: registrationOpen === true,
        format: leagueFormat,
        groupCount: groups,
        advancePerGroup: advance,
        homeAndAway: groupStageOptions.homeAndAway,
        matchesPerMatchDay: groupStageOptions.matchesPerMatchDay,
        mapPool: resolvedMapPool,
        seriesFormat: resolvedSeriesFormat,
        mapVetoEnabled: resolvedMapVeto,
        ownerId: req.user!.userId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: req.user!.role === 'ADMIN' && status?.toUpperCase()
          ? status.toUpperCase()
          : 'UPCOMING',
      },
    });

    const full = await getLeagueWithDetails(league.id);
    setAuditContext(req, audit.of('league.create', 'League', league.id, {
      after: { name: league.name, format: league.format },
    }));
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar liga' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { name, description, startDate, endDate, status, maxTeams, registrationOpen, groupCount, advancePerGroup, homeAndAway, matchesPerMatchDay, mapPool, seriesFormat, mapVetoEnabled } = req.body;

    const existingMatches = await prisma.match.count({ where: { leagueId: req.params.id } });

    if (registrationOpen === true) {
      if (existingMatches > 0) {
        res.status(400).json({
          error: 'Não é possível abrir inscrições após o torneio ter sido iniciado.',
        });
        return;
      }
      if (check.league.status !== 'UPCOMING') {
        res.status(400).json({
          error: 'Inscrições só podem ficar abertas em ligas com status "Em breve".',
        });
        return;
      }
    }

    if (maxTeams !== undefined) {
      if (!isValidRegistrationCap(maxTeams)) {
        res.status(400).json({
          error: 'Limite de vagas inválido. Use entre 2 e 64 ou null para ilimitado.',
        });
        return;
      }
      const registrationCap = parseRegistrationCap(maxTeams);
      const teamCount = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });
      if (registrationCap != null && teamCount > registrationCap) {
        res.status(400).json({
          error: `Não é possível reduzir para ${registrationCap} vagas. A liga já tem ${teamCount} times.`,
        });
        return;
      }
    }

    if (existingMatches === 0) {
      if (groupCount !== undefined && !isValidGroupCount(groupCount)) {
        res.status(400).json({ error: 'Número de grupos inválido.' });
        return;
      }
      const gc = groupCount !== undefined ? Number(groupCount) : check.league.groupCount;
      if (advancePerGroup !== undefined && !isValidAdvancePerGroup(advancePerGroup, gc)) {
        res.status(400).json({ error: 'Número de classificados inválido.' });
        return;
      }
      if (matchesPerMatchDay !== undefined && !isValidMatchesPerMatchDay(matchesPerMatchDay)) {
        res.status(400).json({ error: 'Jogos por dia inválido. Use entre 0 e 16.' });
        return;
      }
      if (mapPool !== undefined || seriesFormat !== undefined) {
        const nextFormat =
          seriesFormat !== undefined
            ? String(seriesFormat).toUpperCase() === 'BO3'
              ? 'BO3'
              : 'BO1'
            : check.league.seriesFormat;
        const nextPool =
          mapPool !== undefined ? parseMapPool(mapPool) : parseMapPool(check.league.mapPool);
        const poolError = validateMapPoolForSeriesFormat(nextPool, nextFormat);
        if (poolError) {
          res.status(400).json({ error: poolError });
          return;
        }
      }
    }

    const effectiveSeriesFormat =
      seriesFormat !== undefined
        ? String(seriesFormat).toUpperCase() === 'BO3'
          ? 'BO3'
          : 'BO1'
        : undefined;
    const effectiveMapVeto =
      effectiveSeriesFormat === 'BO3'
        ? true
        : mapVetoEnabled !== undefined
          ? mapVetoEnabled !== false
          : undefined;

    await prisma.league.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status && { status: status.toUpperCase() }),
        ...(maxTeams !== undefined && { maxTeams: parseRegistrationCap(maxTeams) }),
        ...(registrationOpen !== undefined && { registrationOpen: registrationOpen === true }),
        ...(existingMatches === 0 && groupCount !== undefined && { groupCount: Number(groupCount) }),
        ...(existingMatches === 0 && advancePerGroup !== undefined && { advancePerGroup: Number(advancePerGroup) }),
        ...(existingMatches === 0 && homeAndAway !== undefined && { homeAndAway: parseHomeAndAway(homeAndAway) }),
        ...(existingMatches === 0 && matchesPerMatchDay !== undefined && isValidMatchesPerMatchDay(matchesPerMatchDay) && {
          matchesPerMatchDay: Number(matchesPerMatchDay),
        }),
        ...(existingMatches === 0 && mapPool !== undefined && { mapPool: parseMapPool(mapPool) }),
        ...(existingMatches === 0 && effectiveSeriesFormat !== undefined && {
          seriesFormat: effectiveSeriesFormat,
        }),
        ...(effectiveMapVeto !== undefined && { mapVetoEnabled: effectiveMapVeto }),
      },
    });

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.update', 'League', req.params.id));
    res.json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar liga' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    await deleteLeagueCompletely(req.params.id);
    setAuditContext(req, audit.of('league.delete', 'League', req.params.id, {
      before: { name: check.league.name },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir liga' });
  }
});

router.post('/:id/archive', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.status === 'ARCHIVED') {
      res.status(400).json({ error: 'Liga já está arquivada' });
      return;
    }

    const matches = await prisma.match.findMany({ where: { leagueId: req.params.id } });
    if (matches.length === 0) {
      res.status(400).json({ error: 'A liga não possui partidas para arquivar' });
      return;
    }
    if (!matches.every((m) => m.status === 'COMPLETED')) {
      res.status(400).json({ error: 'Todas as partidas devem estar finalizadas para arquivar a liga' });
      return;
    }

    await prisma.$executeRaw`
      UPDATE "League"
      SET status = 'ARCHIVED'::"LeagueStatus", "updatedAt" = NOW()
      WHERE id = ${req.params.id}
    `;

    if (check.league.format === 'ONE_VS_ONE') {
      await releasePickupPlayers(req.params.id);
    }

    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    setAuditContext(req, audit.of('league.archive', 'League', league.id, {
      after: { status: league.status },
    }));
    res.json({
      id: league.id,
      status: league.status.toLowerCase(),
      message: 'Liga arquivada com sucesso',
    });
  } catch (err) {
    console.error('POST /api/leagues/:id/archive', err);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ARCHIVED') || msg.includes('LeagueStatus')) {
      res.status(500).json({
        error: 'Status ARCHIVED indisponível. Execute as migrations e reinicie o servidor da API.',
      });
      return;
    }
    res.status(500).json({ error: 'Erro ao arquivar liga' });
  }
});

router.post('/:id/unarchive', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.status !== 'ARCHIVED') {
      res.status(400).json({ error: 'Esta liga não está arquivada' });
      return;
    }

    await prisma.$executeRaw`
      UPDATE "League"
      SET status = 'COMPLETED'::"LeagueStatus", "updatedAt" = NOW()
      WHERE id = ${req.params.id}
    `;

    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    setAuditContext(req, audit.of('league.unarchive', 'League', league.id, {
      after: { status: league.status },
    }));
    res.json({
      id: league.id,
      status: league.status.toLowerCase(),
      message: 'Liga desarquivada com sucesso',
    });
  } catch (err) {
    console.error('POST /api/leagues/:id/unarchive', err);
    res.status(500).json({ error: 'Erro ao desarquivar liga' });
  }
});

router.post('/:id/register', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body as { teamId?: string };
    if (!teamId) {
      res.status(400).json({ error: 'teamId é obrigatório' });
      return;
    }

    const league = await prisma.league.findUnique({
      where: { id: req.params.id },
      include: {
        teams: { select: { teamId: true } },
        _count: { select: { matches: true, teams: true } },
      },
    });

    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    if (league.format === 'ONE_VS_ONE') {
      res.status(400).json({
        error: 'Ligas individuais não aceitam inscrição de times. O organizador convoca jogadores diretamente.',
      });
      return;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, ownerId: true },
    });

    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }

    const leagueForCheck = {
      registrationOpen: league.registrationOpen,
      status: league.status,
      maxTeams: league.maxTeams,
      teamCount: league._count.teams,
      matchCount: league._count.matches,
    };

    const teamAlreadyInLeague = league.teams.some((lt) => lt.teamId === teamId);
    const access = canUserRegisterTeam(
      req.user!.userId,
      req.user!.role,
      leagueForCheck,
      team,
      teamAlreadyInLeague
    );

    if (!access.allowed) {
      res.status(400).json({ error: access.error });
      return;
    }

    const count = league._count.teams;
    await prisma.leagueTeam.create({
      data: {
        leagueId: req.params.id,
        teamId,
        seed: count + 1,
      },
    });

    if (!hasRegistrationSlots(count + 1, league.maxTeams)) {
      await prisma.league.update({
        where: { id: req.params.id },
        data: { registrationOpen: false },
      });
    }

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('league.team.register', 'LeagueTeam', teamId, 'League', req.params.id, {
      after: { teamId, seed: count + 1 },
    }));
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error('POST /api/leagues/:id/register', err);
    res.status(500).json({ error: 'Erro ao inscrever time na liga' });
  }
});

router.post('/:id/teams/bulk', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.format === 'ONE_VS_ONE') {
      res.status(400).json({
        error: 'Use o painel de jogadores para montar times temporários nesta liga.',
      });
      return;
    }

    const { teamIds } = req.body as { teamIds: string[] };
    if (!teamIds?.length) {
      res.status(400).json({ error: 'Lista de teamIds é obrigatória' });
      return;
    }

    const uniqueIds = [...new Set(teamIds)];
    let count = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });

    for (const teamId of uniqueIds) {
      if (!hasRegistrationSlots(count, check.league.maxTeams)) break;
      const exists = await prisma.leagueTeam.findUnique({
        where: { leagueId_teamId: { leagueId: req.params.id, teamId } },
      });
      if (exists) continue;
      await prisma.leagueTeam.create({
        data: { leagueId: req.params.id, teamId, seed: count + 1 },
      });
      count++;
    }

    const syncResult = await syncGroupStageMatchesIfNeeded(req.params.id);

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.team.bulk_add', 'League', req.params.id, {
      metadata: { teamIds: uniqueIds, added: count, syncedMatches: syncResult?.createdMatches ?? 0 },
    }));
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar times à liga' });
  }
});

router.post('/:id/teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.format === 'ONE_VS_ONE') {
      res.status(400).json({
        error: 'Use o painel de jogadores para montar times temporários nesta liga.',
      });
      return;
    }

    const { teamId, seed } = req.body;
    if (!teamId) {
      res.status(400).json({ error: 'teamId é obrigatório' });
      return;
    }

    const count = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });
    if (!hasRegistrationSlots(count, check.league.maxTeams)) {
      res.status(400).json({
        error: check.league.maxTeams != null
          ? `Limite de ${check.league.maxTeams} times atingido. Ajuste o limite ou remova um time.`
          : 'Limite máximo de times da liga atingido.',
      });
      return;
    }

    await prisma.leagueTeam.create({
      data: {
        leagueId: req.params.id,
        teamId,
        seed: seed ?? count + 1,
      },
    });

    const syncResult = await syncGroupStageMatchesIfNeeded(req.params.id);

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('league.team.add', 'LeagueTeam', teamId, 'League', req.params.id, {
      after: { teamId, seed: seed ?? count + 1, syncedMatches: syncResult?.createdMatches ?? 0 },
    }));
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar time à liga' });
  }
});

router.delete('/:id/teams/:teamId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const teamInMatch = await prisma.match.count({
      where: {
        leagueId: req.params.id,
        OR: [{ team1Id: req.params.teamId }, { team2Id: req.params.teamId }],
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
    });

    if (teamInMatch > 0) {
      res.status(400).json({
        error: 'Não é possível remover um time com partidas em andamento ou finalizadas.',
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({
        where: {
          leagueId: req.params.id,
          OR: [{ team1Id: req.params.teamId }, { team2Id: req.params.teamId }],
          status: { in: ['SCHEDULED', 'CANCELLED'] },
        },
      });

      const deleted = await tx.leagueTeam.deleteMany({
        where: { leagueId: req.params.id, teamId: req.params.teamId },
      });

      if (deleted.count === 0) {
        throw new Error('TEAM_NOT_IN_LEAGUE');
      }
    });

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('league.team.remove', 'LeagueTeam', req.params.teamId, 'League', req.params.id));
    res.json(formatLeague(full!));
  } catch (err) {
    if (err instanceof Error && err.message === 'TEAM_NOT_IN_LEAGUE') {
      res.status(404).json({ error: 'Time não encontrado na liga' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover time da liga' });
  }
});

router.get('/:id/available-teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const inLeague = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const excludeIds = inLeague.map((lt) => lt.teamId);

    const teams = await prisma.team.findMany({
      where: buildAvailableTeamsWhere(req.params.id, excludeIds),
      select: { id: true, name: true, tag: true },
      orderBy: { name: 'asc' },
    });

    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar times disponíveis' });
  }
});

router.get('/:id/standings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const access = await canUserAccessLeague(req.user!.userId, req.user!.role, req.params.id);
    if (!access.allowed) {
      res.status(access.error === 'Liga não encontrada.' ? 404 : 403).json({ error: access.error });
      return;
    }

    const standings = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, tag: true } } },
      orderBy: [{ points: 'desc' }, { wins: 'desc' }],
    });
    res.json(standings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar classificação' });
  }
});

router.get('/:id/schedule', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const access = await canUserAccessLeague(req.user!.userId, req.user!.role, req.params.id);
    if (!access.allowed) {
      res.status(access.error === 'Liga não encontrada.' ? 404 : 403).json({ error: access.error });
      return;
    }

    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    const overrides = await loadWeekOverrides(prisma, req.params.id);

    res.json({
      startDate: league.startDate,
      endDate: league.endDate,
      defaultMatchDays: parseDefaultMatchDays(league.defaultMatchDays) ?? [],
      defaultMatchTime: league.defaultMatchTime,
      scheduleTimezone: league.scheduleTimezone,
      scheduleConfigured: isScheduleConfigured(leagueToScheduleConfig(league)),
      weekOverrides: overrides.map((o) => ({
        weekStart: weekStartKey(o.weekStart, league.scheduleTimezone),
        daysOfWeek: o.daysOfWeek,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar calendário' });
  }
});

router.put('/:id/schedule', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.groupCount !== 1 || check.league.format !== 'GROUP_STAGE') {
      res.status(400).json({ error: 'Calendário configurável apenas para ligas de grupo único.' });
      return;
    }

    const { startDate, defaultMatchDays, defaultMatchTime, scheduleTimezone } = req.body;
    const days = defaultMatchDays !== undefined ? parseDefaultMatchDays(defaultMatchDays) : null;

    if (defaultMatchDays !== undefined && !days) {
      res.status(400).json({ error: 'Informe pelo menos um dia da semana válido (0–6).' });
      return;
    }

    if (defaultMatchTime !== undefined && !parseMatchTime(String(defaultMatchTime))) {
      res.status(400).json({ error: 'Horário padrão inválido. Use formato HH:mm.' });
      return;
    }

    if (scheduleTimezone !== undefined && !isValidScheduleTimezone(String(scheduleTimezone))) {
      res.status(400).json({ error: 'Fuso horário inválido. Use um identificador IANA (ex.: America/Sao_Paulo).' });
      return;
    }

    const parsedStartDate =
      startDate !== undefined
        ? startDate
          ? parseScheduleStartDate(startDate, String(scheduleTimezone ?? check.league.scheduleTimezone))
          : null
        : undefined;

    if (startDate !== undefined && startDate && parsedStartDate === null) {
      res.status(400).json({ error: 'Data de início inválida.' });
      return;
    }

    const updated = await prisma.league.update({
      where: { id: req.params.id },
      data: {
        ...(parsedStartDate !== undefined && { startDate: parsedStartDate }),
        ...(days && { defaultMatchDays: days }),
        ...(defaultMatchTime !== undefined && { defaultMatchTime: String(defaultMatchTime) }),
        ...(scheduleTimezone !== undefined && {
          scheduleTimezone: isValidScheduleTimezone(String(scheduleTimezone))
            ? String(scheduleTimezone)
            : DEFAULT_SCHEDULE_TIMEZONE,
        }),
      },
    });

    const overrides = await loadWeekOverrides(prisma, req.params.id);

    setAuditContext(req, audit.of('league.schedule.save', 'League', req.params.id));
    res.json({
      startDate: updated.startDate,
      endDate: updated.endDate,
      defaultMatchDays: parseDefaultMatchDays(updated.defaultMatchDays) ?? [],
      defaultMatchTime: updated.defaultMatchTime,
      scheduleTimezone: updated.scheduleTimezone,
      scheduleConfigured: isScheduleConfigured(leagueToScheduleConfig(updated)),
      weekOverrides: overrides.map((o) => ({
        weekStart: weekStartKey(o.weekStart, updated.scheduleTimezone),
        daysOfWeek: o.daysOfWeek,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar calendário' });
  }
});

router.put('/:id/schedule/weeks/:weekStart', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.groupCount !== 1 || check.league.format !== 'GROUP_STAGE') {
      res.status(400).json({ error: 'Overrides de semana apenas para ligas de grupo único.' });
      return;
    }

    const days = parseWeekOverrideDays(req.body.daysOfWeek);
    if (days === null) {
      res.status(400).json({
        error: 'daysOfWeek deve ser um array de dias (0–6) ou [] para pausar a semana.',
      });
      return;
    }

    const weekStart = parseWeekStartParam(req.params.weekStart, check.league.scheduleTimezone);
    if (!weekStart) {
      res.status(400).json({ error: 'weekStart deve ser uma segunda-feira no formato YYYY-MM-DD.' });
      return;
    }

    const row = await prisma.leagueScheduleWeek.upsert({
      where: {
        leagueId_weekStart: { leagueId: req.params.id, weekStart },
      },
      create: {
        leagueId: req.params.id,
        weekStart,
        daysOfWeek: days,
      },
      update: { daysOfWeek: days },
    });

    setAuditContext(req, audit.of('league.schedule.week.override', 'LeagueScheduleWeek', row.id, {
      parentType: 'League',
      parentId: req.params.id,
      after: { weekStart: weekStartKey(row.weekStart, check.league.scheduleTimezone), daysOfWeek: days },
    }));
    res.json({
      weekStart: weekStartKey(row.weekStart, check.league.scheduleTimezone),
      daysOfWeek: parseWeekOverrideDays(row.daysOfWeek) ?? [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar semana do calendário' });
  }
});

router.delete('/:id/schedule/weeks/:weekStart', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const weekStart = parseWeekStartParam(req.params.weekStart, check.league.scheduleTimezone);
    if (!weekStart) {
      res.status(400).json({ error: 'weekStart inválido.' });
      return;
    }

    await prisma.leagueScheduleWeek.deleteMany({
      where: { leagueId: req.params.id, weekStart },
    });

    setAuditContext(req, audit.of('league.schedule.week.remove', 'League', req.params.id, {
      metadata: { weekStart: req.params.weekStart },
    }));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover override de semana' });
  }
});

router.post('/:id/schedule/regenerate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.groupCount !== 1 || check.league.format !== 'GROUP_STAGE') {
      res.status(400).json({ error: 'Regeneração de calendário apenas para ligas de grupo único.' });
      return;
    }

    const groupMatchCount = await prisma.match.count({
      where: { leagueId: req.params.id, phase: 'GROUP' },
    });
    if (groupMatchCount === 0) {
      res.status(400).json({ error: 'Gere a fase de grupos antes de regenerar o calendário.' });
      return;
    }

    let updatedCount = 0;
    await prisma.$transaction(async (tx) => {
      updatedCount = await applyGroupMatchSchedule(tx, req.params.id);
    });

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.schedule.regenerate', 'League', req.params.id, {
      metadata: { updatedCount },
    }));
    res.json({
      updatedCount,
      league: formatLeague(full!),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SCHEDULE_NOT_CONFIGURED') {
      res.status(400).json({ error: 'Configure data de início e dias da semana antes de regenerar o calendário.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao regenerar calendário' });
  }
});

router.post('/:id/groups/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.format !== 'GROUP_STAGE') {
      res.status(400).json({ error: 'Esta liga não usa formato de fase de grupos.' });
      return;
    }

    const existingMatches = await prisma.match.count({ where: { leagueId: req.params.id } });
    if (existingMatches > 0) {
      res.status(400).json({ error: 'A fase de grupos já foi gerada.' });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, tag: true } } },
    });

    const validation = validateGroupStageConfig(
      leagueTeams.length,
      check.league.groupCount,
      check.league.advancePerGroup
    );
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    if (check.league.groupCount === 1 && !isScheduleConfigured(leagueToScheduleConfig(check.league))) {
      res.status(400).json({
        error: 'Configure a data de início e os dias da semana antes de gerar a fase de grupos.',
      });
      return;
    }

    const teamsForDistribution = leagueTeams.map((lt) => ({
      teamId: lt.teamId,
      wins: lt.wins,
      losses: lt.losses,
      draws: lt.draws,
      points: lt.points,
      roundsWon: lt.roundsWon,
      roundsLost: lt.roundsLost,
      seed: lt.seed,
    }));

    const distributions = distributeTeamsIntoGroups(teamsForDistribution, check.league.groupCount);

    if (check.league.groupCount === 1 && distributions[0] && distributions[0].teamIds.length !== leagueTeams.length) {
      res.status(500).json({ error: 'Erro ao distribuir times no grupo único.' });
      return;
    }

    let totalMatches = 0;
    const groupMatchPlans = distributions.map((dist) => {
      const pairings = generateRoundRobinPairings(dist.teamIds, check.league.homeAndAway);
      const expectedMatches = countRoundRobinMatches(dist.teamIds.length, check.league.homeAndAway);
      if (pairings.length !== expectedMatches) {
        throw new Error(`ROUND_ROBIN_COUNT_MISMATCH:${dist.name}:${pairings.length}:${expectedMatches}`);
      }
      return {
        ...dist,
        pairings,
        expectedMatches,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.leagueTeam.updateMany({
        where: { leagueId: req.params.id },
        data: { wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0, groupId: null },
      });

      for (const dist of groupMatchPlans) {
        const group = await tx.leagueGroup.create({
          data: {
            leagueId: req.params.id,
            name: dist.name,
            order: dist.order,
          },
        });

        await tx.leagueTeam.updateMany({
          where: {
            leagueId: req.params.id,
            teamId: { in: dist.teamIds },
          },
          data: { groupId: group.id },
        });

        for (const pairing of dist.pairings) {
          await tx.match.create({
            data: {
              leagueId: req.params.id,
              groupId: group.id,
              team1Id: pairing.team1Id,
              team2Id: pairing.team2Id,
              phase: 'GROUP',
              groupRound: pairing.groupRound,
              round: 0,
              status: 'SCHEDULED',
            },
          });
          totalMatches++;
        }
      }

      await tx.league.update({
        where: { id: req.params.id },
        data: { status: 'ONGOING', registrationOpen: false },
      });

      if (check.league.groupCount === 1) {
        await applyGroupMatchSchedule(tx, req.params.id);
      }
    });

    const groupMatches = await prisma.match.findMany({
      where: { leagueId: req.params.id },
      select: { id: true, team1Id: true, team2Id: true },
    });
    for (const m of groupMatches) {
      await afterMatchCreated(m.id, m.team1Id, m.team2Id, req.params.id);
    }

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.groups.generate', 'League', req.params.id, {
      metadata: { totalMatches, groupCount: check.league.groupCount },
    }));
    res.json({
      ...formatLeague(full!),
      groupInfo: {
        groupCount: check.league.groupCount,
        totalMatches,
        roundRobin: true,
        groups: groupMatchPlans.map((d) => ({
          name: d.name,
          teamCount: d.teamIds.length,
          matchCount: d.pairings.length,
          expectedMatches: d.expectedMatches,
        })),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SCHEDULE_NOT_CONFIGURED') {
      res.status(400).json({
        error: 'Configure a data de início e os dias da semana antes de gerar a fase de grupos.',
      });
      return;
    }
    if (err instanceof Error && err.message === 'ROUND_ROBIN_INCOMPLETE') {
      res.status(500).json({
        error: 'Não foi possível gerar todos os confrontos. Cada time deve enfrentar todos os outros uma vez.',
      });
      return;
    }
    if (err instanceof Error && err.message.startsWith('ROUND_ROBIN_COUNT_MISMATCH')) {
      res.status(500).json({
        error: 'Não foi possível gerar a quantidade correta de confrontos para o grupo.',
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar fase de grupos' });
  }
});

router.post('/:id/groups/sync', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.format !== 'GROUP_STAGE') {
      res.status(400).json({ error: 'Esta liga não usa formato de fase de grupos.' });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
    });
    const validation = validateGroupStageConfig(
      leagueTeams.length,
      check.league.groupCount,
      check.league.advancePerGroup
    );
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await prisma.$transaction((tx) => syncGroupStageMatches(tx, req.params.id));
    for (const match of result.createdMatchRecords) {
      await afterMatchCreated(match.id, match.team1Id, match.team2Id, req.params.id);
    }

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.groups.sync', 'League', req.params.id, {
      metadata: {
        createdMatches: result.createdMatches,
        assignedTeams: result.assignedTeams,
      },
    }));
    res.json({
      ...formatLeague(full!),
      syncInfo: {
        createdMatches: result.createdMatches,
        assignedTeams: result.assignedTeams,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'GROUP_PHASE_NOT_GENERATED') {
      res.status(400).json({ error: 'Gere os confrontos antes de sincronizar a fase de grupos.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar confrontos da fase de grupos' });
  }
});

router.post('/:id/bracket/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.format === 'ONE_VS_ONE') {
      res.status(400).json({
        error: 'Ligas individuais não usam chaveamento. Inicie o confronto na seção de jogadores.',
      });
      return;
    }

    if (check.league.format === 'GROUP_STAGE') {
      const groupMatches = await prisma.match.findMany({
        where: { leagueId: req.params.id, phase: 'GROUP' },
      });
      if (groupMatches.length === 0) {
        res.status(400).json({ error: 'Gere a fase de grupos antes do chaveamento.' });
        return;
      }
      if (!areAllGroupMatchesComplete(groupMatches)) {
        res.status(400).json({ error: 'Finalize todas as partidas da fase de grupos antes de gerar a fase de liga.' });
        return;
      }

      const existingPlayoffs = await prisma.match.count({
        where: { leagueId: req.params.id, phase: 'PLAYOFF', round: { gt: 0 } },
      });
      if (existingPlayoffs > 0) {
        res.status(400).json({ error: 'A fase de liga já foi gerada.' });
        return;
      }

      const result = await prisma.$transaction((tx) =>
        tryGenerateGroupStagePlayoffs(tx, req.params.id)
      );

      if (!result.generated) {
        res.status(400).json({ error: 'Não foi possível gerar a fase de liga.' });
        return;
      }

      const primaryMatches = await prisma.match.findMany({
        where: {
          leagueId: req.params.id,
          phase: 'PLAYOFF',
          OR: [{ seriesId: null }, { seriesGameNumber: 1 }],
        },
        select: { id: true, team1Id: true, team2Id: true },
      });
      for (const m of primaryMatches) {
        await afterMatchCreated(m.id, m.team1Id, m.team2Id, req.params.id);
      }

      const full = await getLeagueWithDetails(req.params.id);
      setAuditContext(req, audit.of('league.bracket.generate', 'League', req.params.id, {
        metadata: { bracketSize: result.bracketSize, round1Matches: result.round1Matches },
      }));
      res.json({
        ...formatLeague(full!),
        bracketInfo: {
          bracketSize: result.bracketSize,
          round1Matches: result.round1Matches,
          walkovers: result.walkovers,
          advancedMatches: result.advancedMatches,
          qualifiers: result.qualifiers,
          seedingBy: 'group_standings',
        },
      });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, tag: true } } },
    });

    if (leagueTeams.length < 2) {
      res.status(400).json({ error: 'Adicione pelo menos 2 times para gerar o chaveamento' });
      return;
    }

    const ranked = rankTeamsForSeeding(leagueTeams);

    await prisma.$transaction([
      ...ranked.map((lt, index) =>
        prisma.leagueTeam.update({
          where: { id: lt.id },
          data: { seed: index + 1 },
        })
      ),
      prisma.match.deleteMany({ where: { leagueId: req.params.id } }),
    ]);

    const bracketSize = getFairBracketSize(ranked.length);
    const leagueConfig = check.league;

    const pairings = getFirstRoundPairings(bracketSize);
    const seedToTeam = new Map<number, (typeof ranked)[0]>();
    ranked.forEach((lt, i) => seedToTeam.set(i + 1, lt));

    const playoffSlots: { team1Id: string; team2Id: string; bracketPosition: number }[] = [];
    const walkoverWinners = new Map<number, string>();
    let walkovers = 0;

    pairings.forEach(([seedA, seedB], position) => {
      const pos = position + 1;
      const teamA = seedToTeam.get(seedA);
      const teamB = seedToTeam.get(seedB);

      if (!teamA && !teamB) return;

      if (teamA && !teamB) {
        walkoverWinners.set(pos, teamA.teamId);
        walkovers++;
        return;
      }
      if (!teamA && teamB) {
        walkoverWinners.set(pos, teamB.teamId);
        walkovers++;
        return;
      }

      if (teamA && teamB) {
        playoffSlots.push({
          team1Id: teamA.teamId,
          team2Id: teamB.teamId,
          bracketPosition: pos,
        });
      }
    });

    let advancedMatches = 0;
    await prisma.$transaction(async (tx) => {
      for (const slot of playoffSlots) {
        await createPlayoffSlot(tx, leagueConfig, {
          leagueId: req.params.id,
          team1Id: slot.team1Id,
          team2Id: slot.team2Id,
          round: 1,
          bracketPosition: slot.bracketPosition,
          phase: 'PLAYOFF',
        });
      }
      advancedMatches = await advanceBracketFromRound(
        tx,
        req.params.id,
        1,
        bracketSize,
        walkoverWinners
      );
      await tx.league.update({
        where: { id: req.params.id },
        data: { status: 'ONGOING', registrationOpen: false, bracketSize },
      });
    });

    const primaryMatches = await prisma.match.findMany({
      where: {
        leagueId: req.params.id,
        OR: [{ seriesId: null }, { seriesGameNumber: 1 }],
      },
      select: { id: true, team1Id: true, team2Id: true },
    });
    for (const m of primaryMatches) {
      await afterMatchCreated(m.id, m.team1Id, m.team2Id, req.params.id);
    }

    const full = await getLeagueWithDetails(req.params.id);
    setAuditContext(req, audit.of('league.bracket.generate', 'League', req.params.id, {
      metadata: { bracketSize, round1Matches: playoffSlots.length, walkovers },
    }));
    res.json({
      ...formatLeague(full!),
      bracketInfo: {
        bracketSize,
        round1Matches: playoffSlots.length,
        walkovers,
        advancedMatches,
        seedingBy: ranked.some((t) => t.wins + t.losses + t.draws > 0) ? 'record' : 'manual',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar chaveamento' });
  }
});

router.post('/:id/one-vs-one/setup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    if (check.league.format !== 'ONE_VS_ONE') {
      res.status(400).json({ error: 'Esta liga não é do formato 1x1.' });
      return;
    }

    const existingMatches = await prisma.match.count({ where: { leagueId: req.params.id } });
    if (existingMatches > 0) {
      res.status(400).json({ error: 'A partida 1x1 desta liga já foi criada.' });
      return;
    }

    const { team1Id, team2Id, team1PlayerUserId, team2PlayerUserId, scheduledAt } = req.body ?? {};
    if (!team1Id || !team2Id || !team1PlayerUserId || !team2PlayerUserId) {
      res.status(400).json({
        error: 'Informe os dois times e um jogador de cada time para a partida.',
      });
      return;
    }
    if (team1Id === team2Id) {
      res.status(400).json({ error: 'Os times devem ser diferentes.' });
      return;
    }

    for (const teamId of [team1Id, team2Id]) {
      const inLeague = await prisma.leagueTeam.findUnique({
        where: { leagueId_teamId: { leagueId: req.params.id, teamId } },
      });
      if (!inLeague) {
        await prisma.leagueTeam.create({
          data: { leagueId: req.params.id, teamId, seed: teamId === team1Id ? 1 : 2 },
        });
      }
    }

    const members = await prisma.teamMember.findMany({
      where: {
        OR: [
          { teamId: team1Id, userId: team1PlayerUserId },
          { teamId: team2Id, userId: team2PlayerUserId },
        ],
      },
    });
    const okT1 = members.some((m) => m.teamId === team1Id && m.userId === team1PlayerUserId);
    const okT2 = members.some((m) => m.teamId === team2Id && m.userId === team2PlayerUserId);
    if (!okT1 || !okT2) {
      res.status(400).json({ error: 'Jogadores devem pertencer aos times selecionados.' });
      return;
    }

    const scheduled = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduled!.getTime())) {
      res.status(400).json({ error: 'Data de agendamento inválida.' });
      return;
    }

    const leagueFull = check.league;
    const mapPool = parseMapPool(leagueFull.mapPool);
    const seriesFormat = leagueFull.seriesFormat ?? 'BO1';

    const { seriesId, matchIds } = await createMatchSeries({
      leagueId: req.params.id,
      team1Id,
      team2Id,
      format: seriesFormat,
      mapPool,
      mapVetoEnabled: leagueFull.mapVetoEnabled,
      phase: 'PLAYOFF',
      round: 1,
      bracketPosition: 1,
      scheduledAt: scheduled,
    });

    for (const matchId of matchIds) {
      await upsertMatchLineup(matchId, team1Id, team2Id, team1PlayerUserId, team2PlayerUserId);
    }

    const primaryMatchId = matchIds[0];

    await prisma.league.update({
      where: { id: req.params.id },
      data: { status: 'ONGOING', registrationOpen: false, bracketSize: 2 },
    });

    setAuditContext(req, audit.withParent('league.one_vs_one.setup', 'League', req.params.id, 'Match', primaryMatchId, {
      after: { team1Id, team2Id, team1PlayerUserId, team2PlayerUserId, seriesId, seriesFormat },
    }));

    res.status(201).json({ matchId: primaryMatchId, seriesId, matchIds, seriesFormat: seriesFormat.toLowerCase() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao configurar partida 1x1' });
  }
});

router.post('/:id/matches', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { team1Id, team2Id, map, round, bracketPosition } = req.body;
    if (!team1Id || !team2Id) {
      res.status(400).json({ error: 'team1Id e team2Id são obrigatórios' });
      return;
    }
    if (team1Id === team2Id) {
      res.status(400).json({ error: 'Times devem ser diferentes' });
      return;
    }

    const bracketMatchCount = await prisma.match.count({
      where: { leagueId: req.params.id, phase: 'PLAYOFF', round: { gt: 0 } },
    });
    if (bracketMatchCount === 0) {
      res.status(400).json({
        error: 'Gere o chaveamento antes de criar partidas. Apenas times da liga podem ser usados.',
      });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const bracketTeamIds = new Set(leagueTeams.map((lt) => lt.teamId));
    if (!bracketTeamIds.has(team1Id) || !bracketTeamIds.has(team2Id)) {
      res.status(400).json({ error: 'Ambos os times devem estar chaveados na liga.' });
      return;
    }

    const match = await prisma.match.create({
      data: {
        leagueId: req.params.id,
        team1Id,
        team2Id,
        map: map || null,
        round: round ?? 1,
        bracketPosition: bracketPosition ?? null,
        status: 'SCHEDULED',
      },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
      },
    });

    await afterMatchCreated(match.id, team1Id, team2Id, req.params.id);

    setAuditContext(req, audit.withParent('league.match.create', 'Match', match.id, 'League', req.params.id, {
      after: { team1Id, team2Id, round: match.round },
    }));
    res.status(201).json({
      id: match.id,
      leagueId: match.leagueId,
      team1: match.team1,
      team2: match.team2,
      status: match.status.toLowerCase(),
      round: match.round,
      bracketPosition: match.bracketPosition,
      map: match.map,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar partida' });
  }
});

router.put('/:id/teams/order', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { teams } = req.body as { teams: { teamId: string; seed: number }[] };
    if (!teams?.length) {
      res.status(400).json({ error: 'Lista de times é obrigatória' });
      return;
    }

    const existingMatches = await prisma.match.count({ where: { leagueId: req.params.id } });
    if (existingMatches > 0) {
      res.status(400).json({
        error: 'Não é possível alterar os seeds após o chaveamento ser gerado.',
      });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const leagueTeamIds = new Set(leagueTeams.map((lt) => lt.teamId));
    for (const t of teams) {
      if (!leagueTeamIds.has(t.teamId)) {
        res.status(400).json({ error: 'Time não pertence a esta liga.' });
        return;
      }
    }

    await prisma.$transaction(
      teams.map((t) =>
        prisma.leagueTeam.updateMany({
          where: { leagueId: req.params.id, teamId: t.teamId },
          data: { seed: t.seed },
        })
      )
    );

    setAuditContext(req, audit.of('league.team.reorder', 'League', req.params.id, {
      metadata: { teams },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar ordem dos times' });
  }
});

export default router;
