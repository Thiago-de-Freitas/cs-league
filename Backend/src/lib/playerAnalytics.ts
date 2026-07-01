import type { MatchPlayerStat } from '@prisma/client';
import { calcRating } from './rankings';

export type AnalyticsSideStats = {
  kills: number;
  deaths: number;
  damage: number;
  rounds: number;
};

export type PlayerAnalyticsRaw = {
  map?: string | null;
  sides?: {
    t?: AnalyticsSideStats;
    ct?: AnalyticsSideStats;
  };
  utility?: {
    heDamage?: number;
    molotovDamage?: number;
    flashAssists?: number;
  };
  combat?: {
    tradeKills?: number;
    tradedDeaths?: number;
    openingKills?: number;
    openingDeaths?: number;
  };
};

export type SkillRatings = {
  aim: number;
  positioning: number;
  utility: number;
};

export type InsightTier = 'subpar' | 'average' | 'good' | 'excellent';

export type PerformanceInsight = {
  id: string;
  title: string;
  rating: number;
  goal: number;
  tier: InsightTier;
  tip: string;
};

export type RecentFormPoint = {
  demoId: string;
  fileName: string;
  createdAt: string;
  performanceRating: number;
  winRateProxy: number;
  skills: SkillRatings;
};

export type PersonalPerformanceAnalytics = {
  skills: SkillRatings;
  skillsGoal: SkillRatings;
  performanceRating: number;
  performanceLabel: string;
  sideRatings: { t: number; ct: number };
  insights: PerformanceInsight[];
  recentForm: RecentFormPoint[];
  topMap: { name: string; side: 'ct' | 't'; rating: number; goal: number } | null;
};

const SKILL_GOAL: SkillRatings = { aim: 50, positioning: 50, utility: 50 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round0(value: number): number {
  return Math.round(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAnalytics(value: unknown): PlayerAnalyticsRaw | null {
  if (!value || typeof value !== 'object') return null;
  return value as PlayerAnalyticsRaw;
}

function ratingFromStat(value: number, benchmark: number, spread: number): number {
  const z = (value - benchmark) / spread;
  return round0(clamp(50 + z * 18, 0, 100));
}

function tierFromRating(rating: number, goal: number): InsightTier {
  if (rating >= goal + 15) return 'excellent';
  if (rating >= goal) return 'good';
  if (rating >= goal - 12) return 'average';
  return 'subpar';
}

function tierLabel(tier: InsightTier): string {
  switch (tier) {
    case 'excellent':
      return 'Excelente';
    case 'good':
      return 'Acima da média';
    case 'average':
      return 'Na média';
    default:
      return 'Abaixo da média';
  }
}

function performanceLabel(rating: number): string {
  if (rating >= 1.2) return 'Excelente';
  if (rating >= 0.4) return 'Acima da média';
  if (rating >= -0.4) return 'Na média';
  if (rating >= -1.2) return 'Abaixo da média';
  return 'Fraco';
}

function formatMapName(map: string): string {
  const normalized = map.replace(/^de_/, '').replace(/_/g, ' ');
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type StatInput = Pick<
  MatchPlayerStat,
  'kills' | 'deaths' | 'assists' | 'damage' | 'adr' | 'hsPercent' | 'kast'
> & {
  analytics?: unknown;
};

function estimateRounds(stat: StatInput): number {
  const analytics = parseAnalytics(stat.analytics);
  const sideRounds =
    (analytics?.sides?.t?.rounds ?? 0) + (analytics?.sides?.ct?.rounds ?? 0);
  if (sideRounds > 0) return sideRounds;
  if (stat.adr > 0) return Math.max(Math.round(stat.damage / stat.adr), 1);
  return Math.max(stat.kills + stat.deaths, 1);
}

export function computeSkillRatings(stat: StatInput): SkillRatings {
  const rounds = estimateRounds(stat);
  const kd = stat.deaths > 0 ? stat.kills / stat.deaths : stat.kills;
  const analytics = parseAnalytics(stat.analytics);
  const combat = analytics?.combat;
  const utility = analytics?.utility;

  const openingKillRate = (combat?.openingKills ?? 0) / rounds;
  const openingDeathRate = (combat?.openingDeaths ?? 0) / rounds;
  const tradeKillRate = (combat?.tradeKills ?? 0) / Math.max(stat.kills, 1);
  const tradedDeathRate = (combat?.tradedDeaths ?? 0) / Math.max(stat.deaths, 1);
  const hePerRound = (utility?.heDamage ?? 0) / rounds;
  const utilAssistRate = ((utility?.flashAssists ?? 0) + stat.assists * 0.35) / rounds;

  const aim = ratingFromStat(stat.hsPercent, 42, 12) * 0.45
    + ratingFromStat(kd, 1.0, 0.35) * 0.35
    + ratingFromStat(openingKillRate, 0.12, 0.06) * 0.2;

  const positioning = ratingFromStat(stat.kast, 72, 10) * 0.4
    + ratingFromStat(1 - openingDeathRate, 0.88, 0.08) * 0.3
    + ratingFromStat(tradeKillRate, 0.18, 0.08) * 0.15
    + ratingFromStat(1 - tradedDeathRate, 0.82, 0.1) * 0.15;

  const utilityScore = ratingFromStat(hePerRound, 6.5, 3.5) * 0.45
    + ratingFromStat(utilAssistRate, 0.22, 0.1) * 0.35
    + ratingFromStat((utility?.molotovDamage ?? 0) / rounds, 4.0, 2.5) * 0.2;

  return {
    aim: round0(aim),
    positioning: round0(positioning),
    utility: round0(utilityScore),
  };
}

export function computePerformanceRating(stat: StatInput): number {
  const kd = stat.deaths > 0 ? stat.kills / stat.deaths : stat.kills;
  const impact = (kd - 1) * 0.45
    + ((stat.adr - 78) / 78) * 0.3
    + ((stat.kast - 70) / 30) * 0.25;
  return round2(clamp(impact, -4, 3));
}

function sidePerformanceRating(side: AnalyticsSideStats | undefined): number {
  if (!side || side.rounds <= 0) return 0;
  const kd = side.deaths > 0 ? side.kills / side.deaths : side.kills;
  const adr = side.damage / side.rounds;
  return computePerformanceRating({
    kills: side.kills,
    deaths: side.deaths,
    assists: 0,
    damage: side.damage,
    adr,
    hsPercent: 0,
    kast: 70,
    analytics: null,
  });
}

function buildInsight(
  id: string,
  title: string,
  rating: number,
  goal: number,
  tip: string
): PerformanceInsight {
  return {
    id,
    title,
    rating: round0(rating),
    goal: round0(goal),
    tier: tierFromRating(rating, goal),
    tip,
  };
}

function pickWeakestTip(candidates: { rating: number; tip: string }[]): string {
  return [...candidates].sort((a, b) => a.rating - b.rating)[0]?.tip ?? '';
}

function buildAimTip(stat: StatInput, skills: SkillRatings): string {
  const rounds = estimateRounds(stat);
  const analytics = parseAnalytics(stat.analytics);
  const combat = analytics?.combat;
  const kd = stat.deaths > 0 ? stat.kills / stat.deaths : stat.kills;
  const openingKillRate = (combat?.openingKills ?? 0) / rounds;
  const gap = SKILL_GOAL.aim - skills.aim;

  const hsRating = ratingFromStat(stat.hsPercent, 42, 12);
  const kdRating = ratingFromStat(kd, 1.0, 0.35);
  const openRating = ratingFromStat(openingKillRate, 0.12, 0.06);

  if (skills.aim >= SKILL_GOAL.aim + 15) {
    return `Mira forte (${skills.aim}/100) com HS% em ${round0(stat.hsPercent)}% e K/D ${round2(kd).toFixed(2)}. Mantenha o pré-aim e converta openings (${combat?.openingKills ?? 0} em ${rounds} rounds).`;
  }

  if (skills.aim >= SKILL_GOAL.aim) {
    return `Você está na meta (${skills.aim}). Para subir mais, busque HS% acima de ${round0(stat.hsPercent)}% e ${round2(openingKillRate * 100).toFixed(0)}% de openings por round.`;
  }

  const statLine = `HS% ${round0(stat.hsPercent)}, K/D ${round2(kd).toFixed(2)}, ${combat?.openingKills ?? 0} openings em ${rounds} rounds.`;
  const focus = pickWeakestTip([
    {
      rating: hsRating,
      tip: `HS% em ${round0(stat.hsPercent)}% (meta ~42%) puxa sua mira para ${skills.aim}. Treine altura de mira e bursts curtos antes de commitar o duelo.`,
    },
    {
      rating: kdRating,
      tip: `K/D de ${round2(kd).toFixed(2)} limita seu rating de mira (${skills.aim}). Evite duelos isolados e prefira picks com utilitário ou vantagem numérica.`,
    },
    {
      rating: openRating,
      tip: `Poucos openings (${combat?.openingKills ?? 0} em ${rounds} rounds). Entre em dupla com o entry ou jogue segunda entrada para ganhar o primeiro abate com flash.`,
    },
  ]);

  return gap >= 20
    ? `${focus} Referência: ${statLine} Você está ${gap} pontos abaixo da meta 50.`
    : `${focus} Referência: ${statLine}`;
}

function buildHeUsageTip(stat: StatInput, analytics: PlayerAnalyticsRaw | null, heRating: number): string {
  const rounds = estimateRounds(stat);
  const utility = analytics?.utility;
  const hePerRound = (utility?.heDamage ?? 0) / rounds;
  const molotovPerRound = (utility?.molotovDamage ?? 0) / rounds;
  const gap = 50 - heRating;

  if (heRating >= 65) {
    return `Bom uso de HE: ${round2(hePerRound).toFixed(1)} de dano/round. Continue quebrando stacks e punindo reposicionamentos com ${round0(utility?.heDamage ?? 0)} de dano total.`;
  }

  if (hePerRound < 1) {
    return `Quase nenhum dano de HE (${round0(utility?.heDamage ?? 0)} em ${rounds} rounds). Compre HE todo round útil e use antes do contato em executes e retakes.`;
  }

  if (molotovPerRound < 1.5 && hePerRound < 4) {
    return `HE com ${round2(hePerRound).toFixed(1)} dmg/round e molotov baixo (${round2(molotovPerRound).toFixed(1)}). Combine molotov para forçar saída e HE para finalizar o dano.`;
  }

  const base = `HE em ${round2(hePerRound).toFixed(1)} dmg/round (meta ~6,5). Aprenda 1–2 lineups por mapa e use em timings fixos de execute ou quando o time inimigo stackar o bombsite.`;
  return gap >= 25 ? `${base} Faltam ~${gap} pontos para a meta — utilitário é seu maior ganho rápido.` : base;
}

function buildTradeFraggingTip(stat: StatInput, analytics: PlayerAnalyticsRaw | null, tradeRating: number): string {
  const combat = analytics?.combat;
  const tradeKillRate = (combat?.tradeKills ?? 0) / Math.max(stat.kills, 1);
  const tradedDeathRate = (combat?.tradedDeaths ?? 0) / Math.max(stat.deaths, 1);
  const gap = 50 - tradeRating;

  if (tradeRating >= 65) {
    return `Trade fragger consistente: ${round0(tradeKillRate * 100)}% dos abates são trades (${combat?.tradeKills ?? 0}/${stat.kills}). Continue jogando colado ao entry.`;
  }

  if (tradeKillRate < 0.08 && stat.kills >= 10) {
    return `Só ${round0(tradeKillRate * 100)}% dos seus ${stat.kills} abates são trades (meta ~18%). Fique a 1–2 passos do entry e atire assim que o duelo começar.`;
  }

  if (tradedDeathRate > 0.45) {
    return `${round0(tradedDeathRate * 100)}% das suas mortes não viram trade (${combat?.tradedDeaths ?? 0}/${stat.deaths}). Peça flash ou entre no bombsite só com cobertura do time.`;
  }

  const base = `${combat?.tradeKills ?? 0} trade kills em ${stat.kills} abates (${round0(tradeKillRate * 100)}%). Jogue o mesmo ângulo do companheiro morto em até 1,5s para converter o frag.`;
  return gap >= 30 ? `${base} Com rating ${tradeRating}, trades são a skill que mais sobe seu impacto no round.` : base;
}

function buildCtMapTip(
  map: string,
  ctSide: AnalyticsSideStats,
  ctSkill: number
): string {
  const mapName = formatMapName(map);
  const kd = ctSide.deaths > 0 ? ctSide.kills / ctSide.deaths : ctSide.kills;
  const adr = ctSide.damage / ctSide.rounds;

  if (ctSkill >= 65) {
    return `CT forte em ${mapName}: K/D ${round2(kd).toFixed(2)} e ${round0(adr)} ADR em ${ctSide.rounds} rounds. Replique essa leitura de ângulos nos outros mapas.`;
  }

  if (adr < 65) {
    return `No CT em ${mapName}, ADR de ${round0(adr)} está baixo. Segure posições com utilitário e evite peek duplo sem flash nos retakes.`;
  }

  if (kd < 0.9) {
    return `CT em ${mapName} com K/D ${round2(kd).toFixed(2)} em ${ctSide.rounds} rounds. Jogue mais retake em grupo e use HE/molotov antes de commitar o bombsite.`;
  }

  return `CT em ${mapName} (${ctSkill}/100): foque utilitários de retake, ângulos off-angle e não troque isolado no meio do mapa.`;
}

function buildPositioningTip(stat: StatInput, skills: SkillRatings): string {
  const rounds = estimateRounds(stat);
  const analytics = parseAnalytics(stat.analytics);
  const combat = analytics?.combat;
  const openingDeathRate = (combat?.openingDeaths ?? 0) / rounds;
  const tradedDeathRate = (combat?.tradedDeaths ?? 0) / Math.max(stat.deaths, 1);

  if (skills.positioning >= SKILL_GOAL.positioning + 10) {
    return `Posicionamento sólido (${skills.positioning}) com KAST ${round0(stat.kast)}%. Continue jogando para o trade e evitando mortes de opening.`;
  }

  return pickWeakestTip([
    {
      rating: ratingFromStat(stat.kast, 72, 10),
      tip: `KAST em ${round0(stat.kast)}% (meta ~72%) mostra que você morre sem impacto no round. Jogue posições com saída e peça utilitário antes de avançar.`,
    },
    {
      rating: ratingFromStat(1 - openingDeathRate, 0.88, 0.08),
      tip: `${combat?.openingDeaths ?? 0} opening deaths em ${rounds} rounds. Evite ser o primeiro contato sem flash e deixe o entry abrir espaço.`,
    },
    {
      rating: ratingFromStat(1 - tradedDeathRate, 0.82, 0.1),
      tip: `${round0(tradedDeathRate * 100)}% das mortes sem trade. Reposicione após o primeiro abate inimigo em vez de segurar o mesmo ângulo.`,
    },
  ]);
}

export function buildPerformanceInsights(
  stat: StatInput,
  skills: SkillRatings,
  analytics: PlayerAnalyticsRaw | null
): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];
  const rounds = estimateRounds(stat);
  const combat = analytics?.combat;
  const utility = analytics?.utility;

  insights.push(
    buildInsight(
      'aim',
      'Mira (Aim)',
      skills.aim,
      SKILL_GOAL.aim,
      buildAimTip(stat, skills)
    )
  );

  const heRating = ratingFromStat((utility?.heDamage ?? 0) / rounds, 6.5, 3.5);
  insights.push(
    buildInsight(
      'he-usage',
      'Uso de HE',
      heRating,
      50,
      buildHeUsageTip(stat, analytics, heRating)
    )
  );

  const tradeRating = ratingFromStat(
    (combat?.tradeKills ?? 0) / Math.max(stat.kills, 1),
    0.18,
    0.08
  );
  insights.push(
    buildInsight(
      'trade-fragging',
      'Trade Fragging',
      tradeRating,
      50,
      buildTradeFraggingTip(stat, analytics, tradeRating)
    )
  );

  insights.push(
    buildInsight(
      'positioning',
      'Posicionamento',
      skills.positioning,
      SKILL_GOAL.positioning,
      buildPositioningTip(stat, skills)
    )
  );

  const map = analytics?.map;
  const ctSide = analytics?.sides?.ct;
  if (map && ctSide && ctSide.rounds > 0) {
    const ctRating = sidePerformanceRating(ctSide);
    const ctSkill = round0(clamp(50 + ctRating * 12, 0, 100));
    insights.push(
      buildInsight(
        'ct-map',
        `CT em ${formatMapName(map)}`,
        ctSkill,
        55,
        buildCtMapTip(map, ctSide, ctSkill)
      )
    );
  }

  return insights
    .sort((a, b) => (a.goal - a.rating) - (b.goal - b.rating))
    .slice(0, 4);
}

export function findTopMapInsight(
  analyticsList: PlayerAnalyticsRaw[]
): PersonalPerformanceAnalytics['topMap'] {
  const mapScores = new Map<string, { ct: number[]; t: number[]; name: string }>();

  for (const analytics of analyticsList) {
    if (!analytics.map) continue;
    const key = analytics.map.toLowerCase();
    const entry = mapScores.get(key) ?? { ct: [], t: [], name: analytics.map };
    if (analytics.sides?.ct) entry.ct.push(sidePerformanceRating(analytics.sides.ct));
    if (analytics.sides?.t) entry.t.push(sidePerformanceRating(analytics.sides.t));
    mapScores.set(key, entry);
  }

  let best: PersonalPerformanceAnalytics['topMap'] = null;
  for (const entry of mapScores.values()) {
    const ctAvg = entry.ct.length
      ? entry.ct.reduce((sum, value) => sum + value, 0) / entry.ct.length
      : null;
    const tAvg = entry.t.length
      ? entry.t.reduce((sum, value) => sum + value, 0) / entry.t.length
      : null;

    for (const [side, avg] of [['ct', ctAvg], ['t', tAvg]] as const) {
      if (avg === null) continue;
      const rating = round0(clamp(50 + avg * 12, 0, 100));
      if (!best || rating > best.rating) {
        best = {
          name: formatMapName(entry.name),
          side,
          rating,
          goal: 55,
        };
      }
    }
  }

  return best;
}

type DemoAnalyticsInput = {
  demoId: string;
  fileName: string;
  createdAt: Date;
  stat: StatInput;
};

export function buildPersonalPerformanceAnalytics(
  demos: DemoAnalyticsInput[]
): PersonalPerformanceAnalytics | null {
  if (demos.length === 0) return null;

  const skillTotals: SkillRatings = { aim: 0, positioning: 0, utility: 0 };
  const sideTotals = { t: 0, ct: 0 };
  let sideCounts = { t: 0, ct: 0 };
  let performanceTotal = 0;
  const analyticsList: PlayerAnalyticsRaw[] = [];
  const insightsSeed = demos[demos.length - 1]?.stat;

  for (const demo of demos) {
    const skills = computeSkillRatings(demo.stat);
    skillTotals.aim += skills.aim;
    skillTotals.positioning += skills.positioning;
    skillTotals.utility += skills.utility;
    performanceTotal += computePerformanceRating(demo.stat);

    const analytics = parseAnalytics(demo.stat.analytics);
    if (analytics) analyticsList.push(analytics);

    if (analytics?.sides?.t && analytics.sides.t.rounds > 0) {
      sideTotals.t += sidePerformanceRating(analytics.sides.t);
      sideCounts.t += 1;
    }
    if (analytics?.sides?.ct && analytics.sides.ct.rounds > 0) {
      sideTotals.ct += sidePerformanceRating(analytics.sides.ct);
      sideCounts.ct += 1;
    }
  }

  const count = demos.length;
  const skills: SkillRatings = {
    aim: round0(skillTotals.aim / count),
    positioning: round0(skillTotals.positioning / count),
    utility: round0(skillTotals.utility / count),
  };

  const performanceRating = round2(performanceTotal / count);
  const insights = insightsSeed
    ? buildPerformanceInsights(insightsSeed, skills, parseAnalytics(insightsSeed.analytics))
    : [];

  const recentForm: RecentFormPoint[] = [...demos]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-12)
    .map((demo) => {
      const kd = demo.stat.deaths > 0 ? demo.stat.kills / demo.stat.deaths : demo.stat.kills;
      const winRateProxy = round0(clamp(((kd - 0.85) / 0.7) * 50 + 50, 5, 95));
      return {
        demoId: demo.demoId,
        fileName: demo.fileName,
        createdAt: demo.createdAt.toISOString(),
        performanceRating: computePerformanceRating(demo.stat),
        winRateProxy,
        skills: computeSkillRatings(demo.stat),
      };
    });

  return {
    skills,
    skillsGoal: SKILL_GOAL,
    performanceRating,
    performanceLabel: performanceLabel(performanceRating),
    sideRatings: {
      t: sideCounts.t > 0 ? round2(sideTotals.t / sideCounts.t) : round2(performanceRating),
      ct: sideCounts.ct > 0 ? round2(sideTotals.ct / sideCounts.ct) : round2(performanceRating),
    },
    insights,
    recentForm,
    topMap: findTopMapInsight(analyticsList),
  };
}

export function aggregateSkillsFromSummary(
  summary: { kd: number; adr: number; kast: number; hsPercent: number; kills: number; deaths: number; assists: number },
  analytics: PlayerAnalyticsRaw | null
): SkillRatings {
  return computeSkillRatings({
    kills: summary.kills,
    deaths: summary.deaths,
    assists: summary.assists,
    damage: summary.adr * Math.max(summary.kills + summary.deaths, 1),
    adr: summary.adr,
    hsPercent: summary.hsPercent,
    kast: summary.kast,
    analytics: analytics ?? undefined,
  });
}

export function legacyRatingToPerformance(rating: number): number {
  return round2((rating - 1) * 2.5);
}

export { tierLabel, formatMapName, calcRating };
