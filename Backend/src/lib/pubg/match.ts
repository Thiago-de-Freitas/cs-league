const PUBG_API_BASE = 'https://api.pubg.com/shards';

export function getPubgApiKey(): string | null {
  const key = process.env.PUBG_API_KEY?.trim();
  return key || null;
}

export function isPubgApiConfigured(): boolean {
  return !!getPubgApiKey();
}

async function pubgFetch(url: string): Promise<Response> {
  const apiKey = getPubgApiKey();
  if (!apiKey) {
    throw new Error('PUBG_API_KEY não configurada.');
  }
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
    },
  });
}

export interface PubgParticipant {
  name: string;
  playerId: string;
  kills: number;
  damageDealt: number;
  placement: number;
}

export interface PubgMatchSummary {
  matchId: string;
  mapName: string;
  participants: PubgParticipant[];
}

export async function fetchPubgMatch(
  matchId: string,
  shard = 'steam'
): Promise<PubgMatchSummary | null> {
  const url = `${PUBG_API_BASE}/${shard}/matches/${encodeURIComponent(matchId)}`;
  const res = await pubgFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUBG API erro ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    data: {
      id: string;
      attributes: { mapName: string };
      relationships: { rosters: { data: { id: string }[] } };
    };
    included?: {
      type: string;
      id: string;
      attributes: {
        stats?: {
          name: string;
          playerId: string;
          kills: number;
          damageDealt: number;
          winPlace?: number;
        };
        won?: string;
        rank?: number;
      };
    }[];
  };

  const rosterRank = new Map<string, number>();
  for (const item of data.included ?? []) {
    if (item.type === 'roster' && item.attributes.rank != null) {
      rosterRank.set(item.id, item.attributes.rank);
    }
  }

  const participants: PubgParticipant[] = [];
  for (const item of data.included ?? []) {
    if (item.type !== 'participant' || !item.attributes.stats) continue;
    const stats = item.attributes.stats;
    participants.push({
      name: stats.name,
      playerId: stats.playerId,
      kills: stats.kills,
      damageDealt: stats.damageDealt,
      placement: stats.winPlace ?? 0,
    });
  }

  return {
    matchId: data.data.id,
    mapName: data.data.attributes.mapName,
    participants,
  };
}

export interface ImportedPubgStat {
  playerName: string;
  externalId: string;
  kills: number;
  damage: number;
  placement: number;
  analytics: Record<string, unknown>;
}

export async function importPubgMatchStats(
  platformMatchId: string,
  shard = 'steam'
): Promise<{ stats: ImportedPubgStat[]; mapName: string } | { error: string }> {
  if (!isPubgApiConfigured()) {
    return { error: 'Integração PUBG não configurada (PUBG_API_KEY).' };
  }

  const summary = await fetchPubgMatch(platformMatchId, shard);
  if (!summary) return { error: 'Partida PUBG não encontrada na API.' };

  const stats: ImportedPubgStat[] = summary.participants.map((p) => ({
    playerName: p.name,
    externalId: p.playerId,
    kills: p.kills,
    damage: p.damageDealt,
    placement: p.placement,
    analytics: { game: 'PUBG', mapName: summary.mapName },
  }));

  return { stats, mapName: summary.mapName };
}
