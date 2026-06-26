import type { HighlightType } from '@prisma/client';

const HIGHLIGHT_TYPES = new Set<HighlightType>(['MULTI_KILL', 'ACE', 'CLUTCH', 'OPENING_KILL']);

export function normalizeHighlightType(value: unknown): HighlightType {
  const normalized = String(value ?? 'MULTI_KILL').toUpperCase();
  return HIGHLIGHT_TYPES.has(normalized as HighlightType)
    ? (normalized as HighlightType)
    : 'MULTI_KILL';
}

export function normalizeSteamId(value: unknown): string {
  if (value == null) return '';
  const raw = String(value).trim();
  return raw.endsWith('.0') ? raw.slice(0, -2) : raw;
}

export function filterHighlightsForPersonalDemo<T extends { steamId?: string | null }>(
  highlights: T[],
  uploaderSteamId: string | null | undefined
): T[] {
  const normalizedUploader = normalizeSteamId(uploaderSteamId);
  if (!normalizedUploader) return [];
  return highlights.filter(
    (highlight) => normalizeSteamId(highlight.steamId) === normalizedUploader
  );
}

export function mapHighlightPayload(h: Record<string, unknown>) {
  return {
    round: Number(h.round) || 0,
    tick: h.tick != null ? Number(h.tick) : null,
    clipStartTick: h.clipStartTick != null ? Number(h.clipStartTick) : null,
    clipEndTick: h.clipEndTick != null ? Number(h.clipEndTick) : null,
    steamId: h.steamId ? normalizeSteamId(h.steamId) : null,
    playerName: String(h.playerName ?? 'Jogador'),
    type: normalizeHighlightType(h.type),
    description: String(h.description ?? 'Destaque'),
    score: Number(h.score) || 0,
    metadata: h.metadata ?? undefined,
  };
}
