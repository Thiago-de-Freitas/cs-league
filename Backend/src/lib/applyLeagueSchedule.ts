import { Prisma, type PrismaClient } from '@prisma/client';
import {
  buildScheduledDates,
  isScheduleConfigured,
  LeagueScheduleConfig,
  parseDefaultMatchDays,
  recalculateLeagueEndDate,
  WeekOverride,
} from './matchSchedule';

type Tx = Prisma.TransactionClient;

export function leagueToScheduleConfig(league: {
  startDate: Date | null;
  defaultMatchDays: unknown;
  defaultMatchTime: string;
  scheduleTimezone: string;
  matchesPerMatchDay?: number;
}): LeagueScheduleConfig {
  return {
    startDate: league.startDate,
    defaultMatchDays: parseDefaultMatchDays(league.defaultMatchDays) ?? [],
    defaultMatchTime: league.defaultMatchTime,
    scheduleTimezone: league.scheduleTimezone,
    matchesPerMatchDay: league.matchesPerMatchDay ?? 0,
  };
}

export async function loadWeekOverrides(
  client: Tx | PrismaClient,
  leagueId: string
): Promise<WeekOverride[]> {
  const rows = await client.leagueScheduleWeek.findMany({
    where: { leagueId },
    orderBy: { weekStart: 'asc' },
  });
  return rows.map((r) => ({
    weekStart: r.weekStart,
    daysOfWeek: parseDefaultMatchDays(r.daysOfWeek) ?? [],
  }));
}

export async function applyGroupMatchSchedule(
  tx: Tx,
  leagueId: string
): Promise<number> {
  const league = await tx.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('LEAGUE_NOT_FOUND');

  const config = leagueToScheduleConfig(league);
  if (!isScheduleConfigured(config)) {
    throw new Error('SCHEDULE_NOT_CONFIGURED');
  }

  const matches = await tx.match.findMany({
    where: { leagueId, phase: 'GROUP' },
    select: { id: true, groupRound: true, status: true, winnerId: true },
  });

  const overrides = await loadWeekOverrides(tx, leagueId);
  const updates = buildScheduledDates(matches, config, overrides);

  for (const update of updates) {
    await tx.match.update({
      where: { id: update.id },
      data: { scheduledAt: update.scheduledAt },
    });
  }

  await syncLeagueEndDate(tx, leagueId);
  return updates.length;
}

export async function syncLeagueEndDate(tx: Tx, leagueId: string): Promise<void> {
  const matches = await tx.match.findMany({
    where: { leagueId },
    select: { scheduledAt: true, status: true },
  });
  const endDate = recalculateLeagueEndDate(matches);
  await tx.league.update({
    where: { id: leagueId },
    data: { endDate },
  });
}
