const RIOT_API_BASE = 'https://americas.api.riotgames.com';
const VALORANT_API_BASE = 'https://na.api.riotgames.com';

export function getRiotApiKey(): string | null {
  const key = process.env.RIOT_API_KEY?.trim();
  return key || null;
}

export function isRiotApiConfigured(): boolean {
  return !!getRiotApiKey();
}

async function riotFetch(url: string): Promise<Response> {
  const apiKey = getRiotApiKey();
  if (!apiKey) {
    throw new Error('RIOT_API_KEY não configurada.');
  }
  return fetch(url, {
    headers: { 'X-Riot-Token': apiKey },
  });
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export async function fetchRiotAccountByRiotId(
  gameName: string,
  tagLine: string
): Promise<RiotAccount | null> {
  const url = `${RIOT_API_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await riotFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot API erro ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as RiotAccount;
}

export function splitRiotId(riotId: string): { gameName: string; tagLine: string } | null {
  const idx = riotId.lastIndexOf('#');
  if (idx <= 0 || idx === riotId.length - 1) return null;
  return {
    gameName: riotId.slice(0, idx).trim(),
    tagLine: riotId.slice(idx + 1).trim(),
  };
}

export interface ValorantMatchPlayer {
  puuid: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  characterId: string;
  teamId: string;
}

export interface ValorantMatchSummary {
  matchId: string;
  mapId: string;
  roundsWon: Record<string, number>;
  players: ValorantMatchPlayer[];
}

export async function fetchValorantMatch(
  matchId: string,
  region = 'na'
): Promise<ValorantMatchSummary | null> {
  const base = region === 'br' ? 'https://br.api.riotgames.com' : VALORANT_API_BASE;
  const url = `${base}/val/match/v1/matches/${encodeURIComponent(matchId)}`;
  const res = await riotFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Valorant API erro ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    matchInfo: { matchId: string; mapId: string };
    teams: { teamId: string; roundsWon: number }[];
    players: {
      puuid: string;
      teamId: string;
      stats: { kills: number; deaths: number; assists: number; score: number };
      characterId: string;
    }[];
  };

  const roundsWon: Record<string, number> = {};
  for (const team of data.teams ?? []) {
    roundsWon[team.teamId] = team.roundsWon;
  }

  return {
    matchId: data.matchInfo.matchId,
    mapId: data.matchInfo.mapId,
    roundsWon,
    players: (data.players ?? []).map((p) => ({
      puuid: p.puuid,
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      assists: p.stats.assists,
      score: p.stats.score,
      characterId: p.characterId,
      teamId: p.teamId,
    })),
  };
}

export interface LolMatchParticipant {
  puuid: string;
  summonerName: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  teamId: number;
  win: boolean;
}

export interface LolMatchSummary {
  matchId: string;
  gameDuration: number;
  participants: LolMatchParticipant[];
}

export async function fetchLolMatch(matchId: string): Promise<LolMatchSummary | null> {
  const url = `${RIOT_API_BASE}/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  const res = await riotFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LoL Match-V5 erro ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    metadata: { matchId: string };
    info: {
      gameDuration: number;
      participants: {
        puuid: string;
        summonerName: string;
        kills: number;
        deaths: number;
        assists: number;
        totalMinionsKilled: number;
        visionScore: number;
        totalDamageDealtToChampions: number;
        teamId: number;
        win: boolean;
      }[];
    };
  };

  return {
    matchId: data.metadata.matchId,
    gameDuration: data.info.gameDuration,
    participants: data.info.participants.map((p) => ({
      puuid: p.puuid,
      summonerName: p.summonerName,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      totalMinionsKilled: p.totalMinionsKilled,
      visionScore: p.visionScore,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions,
      teamId: p.teamId,
      win: p.win,
    })),
  };
}
