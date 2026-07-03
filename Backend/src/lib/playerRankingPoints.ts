import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type MatchOutcome = 'win' | 'draw' | 'loss' | 'none';

export type StatPointsInput = {
  kills: number;
  deaths: number;
  hsPercent: number;
  analytics?: unknown;
};

export type StatPointsBreakdown = {
  outcome: MatchOutcome;
  base: number;
  kills: number;
  headshots: number;
  openingKills: number;
  tradeKills: number;
  deaths: number;
  total: number;
};

/** Pontos base por resultado da partida (aditivo, não zero-soma). */
export const BASE_POINTS: Record<MatchOutcome, number> = {
  win: 25,
  draw: 10,
  loss: 5,
  none: 0,
};

/**
 * Faixas cumulativas de nível 1-10 (mínimo de pontos para cada nível).
 * Centralizadas aqui para recalibração fácil.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, 250, 600, 1050, 1600, 2250, 3000, 3900, 5000, 6500,
];

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export function levelFromPoints(points: number): number {
  const safe = Number.isFinite(points) ? points : 0;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (safe >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

type CombatAnalytics = {
  combat?: {
    tradeKills?: number;
    openingKills?: number;
  };
};

function parseCombat(value: unknown): CombatAnalytics['combat'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const combat = (value as CombatAnalytics).combat;
  if (!combat || typeof combat !== 'object') return undefined;
  return combat;
}

/** Pontos de uma linha de MatchPlayerStat: base por resultado + desempenho (piso 0). */
export function computeStatPoints(
  stat: StatPointsInput,
  outcome: MatchOutcome
): { points: number; breakdown: StatPointsBreakdown } {
  const combat = parseCombat(stat.analytics);

  const base = BASE_POINTS[outcome];
  const killsPts = Math.max(0, stat.kills) * 1;
  const headshotPts = (Math.max(0, Math.min(100, stat.hsPercent)) / 100) * 10;
  const openingPts = Math.max(0, combat?.openingKills ?? 0) * 2;
  const tradePts = Math.max(0, combat?.tradeKills ?? 0) * 1;
  const deathsPts = Math.max(0, stat.deaths) * -0.5;

  const raw = base + killsPts + headshotPts + openingPts + tradePts + deathsPts;
  const total = Math.max(0, Math.round(raw));

  return {
    points: total,
    breakdown: {
      outcome,
      base,
      kills: Math.round(killsPts),
      headshots: Math.round(headshotPts),
      openingKills: Math.round(openingPts),
      tradeKills: Math.round(tradePts),
      deaths: Math.round(deathsPts),
      total,
    },
  };
}

type DemoOutcomeContext = {
  matchId: string | null;
  match: { winnerId: string | null; team1Id: string; team2Id: string } | null;
};

/** Resolve o resultado da partida para um jogador via seu teamId. */
export function resolveMatchOutcome(demo: DemoOutcomeContext, statTeamId: string | null): MatchOutcome {
  if (!demo.matchId || !demo.match) return 'none';
  const { winnerId, team1Id, team2Id } = demo.match;
  if (!winnerId) return 'draw';

  const teamId = statTeamId?.trim();
  if (!teamId || (teamId !== team1Id && teamId !== team2Id)) {
    // Sem time resolvível, mantém neutro para não punir nem inflar.
    return 'draw';
  }
  return teamId === winnerId ? 'win' : 'loss';
}

/**
 * Calcula e persiste os pontos de uma demo (idempotente).
 * Regrava o ledger PlayerRatingEvent (unique userId+demoId) e recalcula User.rankPoints.
 */
export async function computeDemoPoints(demoId: string): Promise<{ scored: number }> {
  const demo = await prisma.demo.findUnique({
    where: { id: demoId },
    select: {
      id: true,
      matchId: true,
      match: { select: { winnerId: true, team1Id: true, team2Id: true } },
      stats: {
        select: {
          steamId: true,
          teamId: true,
          kills: true,
          deaths: true,
          hsPercent: true,
          analytics: true,
        },
      },
    },
  });

  if (!demo) return { scored: 0 };

  const steamIds = [
    ...new Set(demo.stats.map((s) => s.steamId?.trim()).filter((s): s is string => !!s)),
  ];
  const users = steamIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: steamIds } },
        select: { id: true, steamId: true },
      })
    : [];
  const userIdBySteam = new Map(users.map((u) => [u.steamId!, u.id] as const));

  const perUser = new Map<
    string,
    { steamId: string; points: number; breakdown: StatPointsBreakdown }
  >();

  for (const stat of demo.stats) {
    const steamId = stat.steamId?.trim();
    if (!steamId) continue;
    const userId = userIdBySteam.get(steamId);
    if (!userId) continue;

    const outcome = resolveMatchOutcome(demo, stat.teamId);
    const { points, breakdown } = computeStatPoints(stat, outcome);

    const existing = perUser.get(userId);
    if (existing) {
      existing.points += points;
      existing.breakdown = breakdown;
    } else {
      perUser.set(userId, { steamId, points, breakdown });
    }
  }

  const previous = await prisma.playerRatingEvent.findMany({
    where: { demoId },
    select: { userId: true },
  });
  const affected = new Set<string>([...previous.map((p) => p.userId), ...perUser.keys()]);

  await prisma.$transaction(async (tx) => {
    await tx.playerRatingEvent.deleteMany({ where: { demoId } });

    if (perUser.size > 0) {
      await tx.playerRatingEvent.createMany({
        data: [...perUser.entries()].map(([userId, value]) => ({
          userId,
          demoId,
          steamId: value.steamId,
          points: value.points,
          breakdown: value.breakdown as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    for (const userId of affected) {
      const agg = await tx.playerRatingEvent.aggregate({
        where: { userId },
        _sum: { points: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { rankPoints: agg._sum.points ?? 0 },
      });
    }
  });

  return { scored: perUser.size };
}

/**
 * Remove os pontos de uma demo do ledger e recalcula os totais dos jogadores afetados.
 * Usado ao excluir/reprocessar uma demo.
 */
export async function clearDemoPoints(demoId: string): Promise<{ affected: number }> {
  const previous = await prisma.playerRatingEvent.findMany({
    where: { demoId },
    select: { userId: true },
  });
  const affected = [...new Set(previous.map((p) => p.userId))];

  await prisma.$transaction(async (tx) => {
    await tx.playerRatingEvent.deleteMany({ where: { demoId } });
    for (const userId of affected) {
      const agg = await tx.playerRatingEvent.aggregate({
        where: { userId },
        _sum: { points: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { rankPoints: agg._sum.points ?? 0 },
      });
    }
  });

  return { affected: affected.length };
}

/** Backfill: recalcula os pontos de todas as demos concluídas. */
export async function recomputeAllPoints(): Promise<{ demos: number; users: number }> {
  const demos = await prisma.demo.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.playerRatingEvent.deleteMany({}),
    prisma.user.updateMany({ data: { rankPoints: 0 } }),
  ]);

  for (const demo of demos) {
    await computeDemoPoints(demo.id);
  }

  const users = await prisma.user.count({ where: { rankPoints: { gt: 0 } } });
  return { demos: demos.length, users };
}
