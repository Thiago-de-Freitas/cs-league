import type { MatchPlayerStat } from '@prisma/client';

type DemoWithStats = {
  id: string;
  fileName: string;
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
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
};

export type PersonalStatsSummary = {
  demosTotal: number;
  demosCompleted: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export function buildPersonalStatsOverview(demos: DemoWithStats[]) {
  const perDemo: PersonalDemoStat[] = [];
  let kills = 0;
  let deaths = 0;
  let adrSum = 0;
  let hsSum = 0;
  let kastSum = 0;
  let analyzed = 0;

  for (const demo of demos) {
    const status = demo.status.toUpperCase();
    const stat = status === 'COMPLETED' && demo.stats.length > 0 ? demo.stats[0] : null;

    if (stat) {
      const kd = stat.deaths > 0 ? stat.kills / stat.deaths : stat.kills;
      perDemo.push({
        demoId: demo.id,
        fileName: demo.fileName,
        status: status.toLowerCase(),
        createdAt: demo.createdAt,
        kills: stat.kills,
        deaths: stat.deaths,
        kd: Math.round(kd * 100) / 100,
        adr: stat.adr,
        hsPercent: stat.hsPercent,
        kast: stat.kast,
      });

      kills += stat.kills;
      deaths += stat.deaths;
      adrSum += stat.adr;
      hsSum += stat.hsPercent;
      kastSum += stat.kast;
      analyzed += 1;
    } else {
      perDemo.push({
        demoId: demo.id,
        fileName: demo.fileName,
        status: status.toLowerCase(),
        createdAt: demo.createdAt,
        kills: 0,
        deaths: 0,
        kd: 0,
        adr: 0,
        hsPercent: 0,
        kast: 0,
      });
    }
  }

  const kd = deaths > 0 ? kills / deaths : kills;
  const adr = analyzed > 0 ? adrSum / analyzed : 0;
  const hsPercent = analyzed > 0 ? hsSum / analyzed : 0;
  const kast = analyzed > 0 ? kastSum / analyzed : 0;
  const rating =
    analyzed > 0
      ? (kd / 1.2) * 0.35 + (adr / 85) * 0.35 + (kast / 75) * 0.2 + (hsPercent / 50) * 0.1
      : 0;

  const summary: PersonalStatsSummary = {
    demosTotal: demos.length,
    demosCompleted: demos.filter((d) => d.status.toUpperCase() === 'COMPLETED').length,
    kills,
    deaths,
    kd: Math.round(kd * 100) / 100,
    adr: Math.round(adr * 10) / 10,
    hsPercent: Math.round(hsPercent * 10) / 10,
    kast: Math.round(kast * 10) / 10,
    rating: Math.round(rating * 100) / 100,
  };

  return { summary, demos: perDemo };
}
