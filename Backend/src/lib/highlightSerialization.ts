import { getHighlightClipPublicUrl } from './highlightStorage';

type HighlightRow = {
  id: string;
  round: number;
  tick: number | null;
  clipStartTick: number | null;
  clipEndTick: number | null;
  clipRenderStatus: string;
  clipVideoPath: string | null;
  clipRenderError: string | null;
  steamId: string | null;
  playerName: string;
  type: string;
  description: string;
  score: number;
  metadata: unknown;
};

export function serializeHighlight<T extends HighlightRow>(highlight: T, parentKey: Record<string, string>) {
  return {
    ...parentKey,
    id: highlight.id,
    round: highlight.round,
    tick: highlight.tick,
    clipStartTick: highlight.clipStartTick,
    clipEndTick: highlight.clipEndTick,
    clipRenderStatus: highlight.clipRenderStatus,
    clipVideoUrl: getHighlightClipPublicUrl(highlight.clipVideoPath),
    clipRenderError: highlight.clipRenderError,
    steamId: highlight.steamId,
    playerName: highlight.playerName,
    type: highlight.type,
    description: highlight.description,
    score: highlight.score,
    metadata: highlight.metadata,
  };
}
