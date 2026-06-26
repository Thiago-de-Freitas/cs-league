import type { HighlightType } from '@prisma/client';

const HIGHLIGHT_TYPES = new Set<HighlightType>(['MULTI_KILL', 'ACE', 'CLUTCH', 'OPENING_KILL']);

export function normalizeHighlightType(value: unknown): HighlightType {
  const normalized = String(value ?? 'MULTI_KILL').toUpperCase();
  return HIGHLIGHT_TYPES.has(normalized as HighlightType)
    ? (normalized as HighlightType)
    : 'MULTI_KILL';
}

export function mapHighlightPayload(h: Record<string, unknown>) {
  return {
    round: Number(h.round) || 0,
    tick: h.tick != null ? Number(h.tick) : null,
    clipStartTick: h.clipStartTick != null ? Number(h.clipStartTick) : null,
    clipEndTick: h.clipEndTick != null ? Number(h.clipEndTick) : null,
    steamId: h.steamId ? String(h.steamId) : null,
    playerName: String(h.playerName ?? 'Jogador'),
    type: normalizeHighlightType(h.type),
    description: String(h.description ?? 'Destaque'),
    score: Number(h.score) || 0,
    metadata: h.metadata ?? undefined,
  };
}
