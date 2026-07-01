import type { MatchPlayerStat } from '@prisma/client';
import { prisma } from './prisma';
import { calcRating } from './rankings';
import {
  buildPersonalPerformanceAnalytics,
  type PersonalPerformanceAnalytics,
} from './playerAnalytics';

type DemoWithStats = {
  id: string;
  fileName: string | null;
  status: string;
  createdAt: Date;
  stats: MatchPlayerStat[];
};

export type PersonalDemoStat = {
  demoId: string;
  fileName: string;
  status: string;
  createdAt: Date;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  kd: number;
  kda: number;
  adr: number;
  hsPercent: number;
  kast: number;
  headshotKills: number;
};

export type PersonalStatsSummary = {
  demosTotal: number;
  demosCompleted: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshotKills: number;
  kdDiff: number;
  avgKills: number;
  kd: number;
  kda: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export type { PersonalPerformanceAnalytics };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function headshotsFromStat(stat: Pick<MatchPlayerStat, 'kills' | 'hsPercent'>): number {
  return Math.round((stat.kills * stat.hsPercent) / 100);
}

export function buildPersonalStatsOverview(demos: DemoWithStats[]) {
  const perDemo: PersonalDemoStat[] = [];
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let damage = 0;
  let headshotKills = 0;
  let adrSum = 0;
  let hsSum = 0;
  let kastSum = 0;
  let analyzed = 0;

  for (const demo of demos) {
    const status = demo.status.toUpperCase();
    const stat = status === 'COMPLETED' && demo.stats.length > 0 ? demo.stats[0] : null;

    if (stat) {
      const statAssists = stat.assists ?? 0;
      const statDamage = stat.damage ?? 0;
      const demoHeadshots = headshotsFromStat(stat);
      const kd = stat.deaths > 0 ? stat.kills / stat.deaths : stat.kills;
      const kda = stat.deaths > 0 ? (stat.kills + statAssists) / stat.deaths : stat.kills + statAssists;

      perDemo.push({
        demoId: demo.id,
        fileName: demo.fileName ?? 'demo.dem',
        status: status.toLowerCase(),
        createdAt: demo.createdAt,
        kills: stat.kills,
        deaths: stat.deaths,
        assists: statAssists,
        damage: statDamage,
        kd: round2(kd),
        kda: round2(kda),
        adr: stat.adr,
        hsPercent: stat.hsPercent,
        kast: stat.kast,
        headshotKills: demoHeadshots,
      });

      kills += stat.kills;
      deaths += stat.deaths;
      assists += statAssists;
      damage += statDamage;
      headshotKills += demoHeadshots;
      adrSum += stat.adr;
      hsSum += stat.hsPercent;
      kastSum += stat.kast;
      analyzed += 1;
    } else {
      perDemo.push({
        demoId: demo.id,
        fileName: demo.fileName ?? 'demo.dem',
        status: status.toLowerCase(),
        createdAt: demo.createdAt,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        kd: 0,
        kda: 0,
        adr: 0,
        hsPercent: 0,
        kast: 0,
        headshotKills: 0,
      });
    }
  }

  const kd = deaths > 0 ? kills / deaths : kills;
  const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;
  const adr = analyzed > 0 ? adrSum / analyzed : 0;
  const hsPercent = analyzed > 0 ? hsSum / analyzed : 0;
  const kast = analyzed > 0 ? kastSum / analyzed : 0;

  const analyticsDemos: Array<{
    demoId: string;
    fileName: string;
    createdAt: Date;
    stat: MatchPlayerStat;
  }> = [];

  for (const demo of demos) {
    if (demo.status.toUpperCase() !== 'COMPLETED' || demo.stats.length === 0) continue;
    analyticsDemos.push({
      demoId: demo.id,
      fileName: demo.fileName ?? 'demo.dem',
      createdAt: demo.createdAt,
      stat: demo.stats[0],
    });
  }

  const analytics = buildPersonalPerformanceAnalytics(analyticsDemos);

  const summary: PersonalStatsSummary = {
    demosTotal: demos.length,
    demosCompleted: demos.filter((d) => d.status.toUpperCase() === 'COMPLETED').length,
    kills,
    deaths,
    assists,
    damage,
    headshotKills,
    kdDiff: kills - deaths,
    avgKills: analyzed > 0 ? round1(kills / analyzed) : 0,
    kd: round2(kd),
    kda: round2(kda),
    adr: round1(adr),
    hsPercent: round1(hsPercent),
    kast: round1(kast),
    rating: analyzed > 0 ? calcRating(kd, adr, kast, hsPercent) : 0,
  };

  return { summary, demos: perDemo, analytics };
}

export type SerializedPersonalStatsOverview = {
  summary: PersonalStatsSummary;
  demos: Array<Omit<PersonalDemoStat, 'createdAt'> & { createdAt: string }>;
  analytics: PersonalPerformanceAnalytics | null;
};

export function serializePublicPersonalStatsOverview(
  overview: ReturnType<typeof buildPersonalStatsOverview>
): SerializedPersonalStatsOverview | null {
  if (overview.summary.demosCompleted === 0) {
    return null;
  }

  return {
    summary: overview.summary,
    demos: overview.demos
      .filter((demo) => demo.status === 'completed')
      .map((demo) => ({
        ...demo,
        createdAt: demo.createdAt.toISOString(),
      })),
    analytics: overview.analytics,
  };
}

export async function getPersonalStatsForUser(
  userId: string
): Promise<SerializedPersonalStatsOverview | null> {
  const demos = await prisma.demo.findMany({
    where: { uploadedById: userId, isPersonal: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      stats: true,
    },
  });

  return serializePublicPersonalStatsOverview(buildPersonalStatsOverview(demos));
}
