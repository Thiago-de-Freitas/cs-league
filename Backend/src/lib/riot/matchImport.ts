import type { GameTitle } from '@prisma/client';
import { prisma } from '../prisma';
import {
  fetchLolMatch,
  fetchRiotAccountByRiotId,
  fetchValorantMatch,
  isRiotApiConfigured,
  splitRiotId,
} from '../riot/client';
import { getUserGameExternalId } from '../userGameAccount';

export interface ImportedPlayerStat {
  playerName: string;
  externalId: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  adr: number;
  hsPercent: number;
  kast: number;
  analytics: Record<string, unknown>;
}

export async function importValorantMatchStats(
  matchId: string,
  platformMatchId: string,
  region = 'na'
): Promise<{ stats: ImportedPlayerStat[]; mapId: string; team1Rounds: number; team2Rounds: number } | { error: string }> {
  if (!isRiotApiConfigured()) {
    return { error: 'Integração Riot não configurada (RIOT_API_KEY).' };
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { game: true } },
      team1: { include: { members: { include: { user: { select: { id: true, riotId: true } } } } } },
      team2: { include: { members: { include: { user: { select: { id: true, riotId: true } } } } } },
    },
  });

  if (!match) return { error: 'Partida não encontrada.' };
  if (match.league.game !== 'VALORANT') {
    return { error: 'Importação Riot só está disponível para ligas Valorant.' };
  }

  const summary = await fetchValorantMatch(platformMatchId, region);
  if (!summary) return { error: 'Partida Valorant não encontrada na Riot API.' };

  const teamIds = Object.keys(summary.roundsWon);
  const team1Rounds = summary.roundsWon[teamIds[0]] ?? 0;
  const team2Rounds = summary.roundsWon[teamIds[1]] ?? 0;

  const riotIdByPuuid = new Map<string, string>();
  for (const member of [...match.team1.members, ...match.team2.members]) {
    const riotId = member.user.riotId ?? (await getUserGameExternalId(member.user.id, 'VALORANT'));
    if (!riotId) continue;
    const parts = splitRiotId(riotId);
    if (!parts) continue;
    const account = await fetchRiotAccountByRiotId(parts.gameName, parts.tagLine);
    if (account) riotIdByPuuid.set(account.puuid, riotId);
  }

  const stats: ImportedPlayerStat[] = summary.players.map((p) => ({
    playerName: riotIdByPuuid.get(p.puuid) ?? p.puuid.slice(0, 8),
    externalId: riotIdByPuuid.get(p.puuid) ?? p.puuid,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    damage: p.score,
    adr: 0,
    hsPercent: 0,
    kast: 0,
    analytics: {
      acs: p.score,
      agent: p.characterId,
      game: 'VALORANT' as GameTitle,
    },
  }));

  return { stats, mapId: summary.mapId, team1Rounds, team2Rounds };
}

export async function importLolMatchStats(
  matchId: string,
  platformMatchId: string
): Promise<{ stats: ImportedPlayerStat[]; team1Wins: number; team2Wins: number } | { error: string }> {
  if (!isRiotApiConfigured()) {
    return { error: 'Integração Riot não configurada (RIOT_API_KEY).' };
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { league: { select: { game: true } } },
  });

  if (!match) return { error: 'Partida não encontrada.' };
  if (match.league.game !== 'LOL') {
    return { error: 'Importação Riot só está disponível para ligas LoL.' };
  }

  const summary = await fetchLolMatch(platformMatchId);
  if (!summary) return { error: 'Partida LoL não encontrada na Riot API.' };

  const team100 = summary.participants.filter((p) => p.teamId === 100);
  const team200 = summary.participants.filter((p) => p.teamId === 200);
  const team1Wins = team100.some((p) => p.win) ? 1 : 0;
  const team2Wins = team200.some((p) => p.win) ? 1 : 0;

  const stats: ImportedPlayerStat[] = summary.participants.map((p) => ({
    playerName: p.summonerName,
    externalId: p.puuid,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    damage: p.totalDamageDealtToChampions,
    adr: 0,
    hsPercent: 0,
    kast: 0,
    analytics: {
      cs: p.totalMinionsKilled,
      visionScore: p.visionScore,
      game: 'LOL' as GameTitle,
    },
  }));

  return { stats, team1Wins, team2Wins };
}
