import { prisma } from './prisma';

export type PlayerRankingEntry = {
  rank: number;
  playerName: string;
  displayName: string | null;
  steamId: string | null;
  demos: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export type TeamRankingEntry = {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  leagues: number;
};

function calcRating(kd: number, adr: number, kast: number, hsPercent: number): number {
  return Math.round(((kd / 1.2) * 0.35 + (adr / 85) * 0.35 + (kast / 75) * 0.2 + (hsPercent / 50) * 0.1) * 100) / 100;
}

export async function getPlayerRankings(limit = 10): Promise<PlayerRankingEntry[]> {
  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      demo: { status: 'COMPLETED' },
    },
    select: {
      steamId: true,
      playerName: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
    },
  });

  const byKey = new Map<
    string,
    {
      playerName: string;
      steamId: string | null;
      demos: number;
      kills: number;
      deaths: number;
      adrSum: number;
      hsSum: number;
      kastSum: number;
    }
  >();

  for (const stat of stats) {
    const key = (stat.steamId?.trim() || stat.playerName).toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.demos += 1;
      existing.kills += stat.kills;
      existing.deaths += stat.deaths;
      existing.adrSum += stat.adr;
      existing.hsSum += stat.hsPercent;
      existing.kastSum += stat.kast;
      if (!existing.steamId && stat.steamId) existing.steamId = stat.steamId;
    } else {
      byKey.set(key, {
        playerName: stat.playerName,
        steamId: stat.steamId,
        demos: 1,
        kills: stat.kills,
        deaths: stat.deaths,
        adrSum: stat.adr,
        hsSum: stat.hsPercent,
        kastSum: stat.kast,
      });
    }
  }

  const steamIds = [...byKey.values()]
    .map((p) => p.steamId)
    .filter((id): id is string => !!id?.trim());

  const users = steamIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: steamIds } },
        select: { steamId: true, displayName: true },
      })
    : [];

  const displayBySteam = new Map(users.map((u) => [u.steamId!, u.displayName]));

  const ranked = [...byKey.values()]
    .map((p) => {
      const kd = p.deaths > 0 ? p.kills / p.deaths : p.kills;
      const adr = p.adrSum / p.demos;
      const hsPercent = p.hsSum / p.demos;
      const kast = p.kastSum / p.demos;
      const rating = calcRating(kd, adr, kast, hsPercent);
      return {
        playerName: p.playerName,
        displayName: p.steamId ? displayBySteam.get(p.steamId) || null : null,
        steamId: p.steamId,
        demos: p.demos,
        kills: p.kills,
        deaths: p.deaths,
        kd: Math.round(kd * 100) / 100,
        adr: Math.round(adr * 10) / 10,
        hsPercent: Math.round(hsPercent * 10) / 10,
        kast: Math.round(kast * 10) / 10,
        rating,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.kd - a.kd || b.adr - a.adr)
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  return ranked;
}

export async function getTeamRankings(limit = 10): Promise<TeamRankingEntry[]> {
  const leagueTeams = await prisma.leagueTeam.findMany({
    select: {
      wins: true,
      losses: true,
      team: {
        select: {
          id: true,
          name: true,
          tag: true,
          logoUrl: true,
        },
      },
    },
  });

  const byTeam = new Map<
    string,
    {
      team: { id: string; name: string; tag: string; logoUrl: string | null };
      wins: number;
      losses: number;
      leagues: number;
    }
  >();

  for (const lt of leagueTeams) {
    const existing = byTeam.get(lt.team.id);
    if (existing) {
      existing.wins += lt.wins;
      existing.losses += lt.losses;
      existing.leagues += 1;
    } else {
      byTeam.set(lt.team.id, {
        team: lt.team,
        wins: lt.wins,
        losses: lt.losses,
        leagues: 1,
      });
    }
  }

  return [...byTeam.values()]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team.name.localeCompare(b.team.name))
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      teamId: entry.team.id,
      name: entry.team.name,
      tag: entry.team.tag,
      logoUrl: entry.team.logoUrl,
      wins: entry.wins,
      losses: entry.losses,
      leagues: entry.leagues,
    }));
}
