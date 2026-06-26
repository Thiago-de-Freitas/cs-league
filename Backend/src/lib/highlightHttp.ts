import { Response } from 'express';
import fs from 'fs';
import { buildVdmClipSpec } from './clipExport';
import { getHighlightClipPublicUrl, resolveHighlightClipPath } from './highlightStorage';
import { serializeHighlight } from './highlightSerialization';

type HighlightRecord = {
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

export function buildHighlightsListResponse(
  highlights: HighlightRecord[],
  parentKey: Record<string, string>
) {
  const serialized = highlights.map((highlight) => serializeHighlight(highlight, parentKey));
  return {
    highlights: serialized,
    videoExportAvailable: serialized.some(
      (highlight) => highlight.clipRenderStatus === 'COMPLETED' && !!highlight.clipVideoUrl
    ),
    note: 'Baixe o MP4 quando a renderização concluir. Use "Baixar spec" para ticks HLAE/GOTV.',
  };
}

export function sendHighlightClipSpec(res: Response, highlight: HighlightRecord): void {
  if (highlight.clipStartTick == null || highlight.clipEndTick == null) {
    res.status(400).json({
      error: 'Este destaque não possui ticks de clipe. Reprocesse a demo após atualizar o worker.',
    });
    return;
  }

  const vdm = buildVdmClipSpec({
    clipStartTick: highlight.clipStartTick,
    clipEndTick: highlight.clipEndTick,
    playerName: highlight.playerName,
    round: highlight.round,
    description: highlight.description,
  });

  const accept = String(res.req?.headers.accept ?? '');
  if (accept.includes('text/plain') || res.req?.query.format === 'vdm') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="highlight-r${highlight.round}-${highlight.id.slice(0, 8)}.vdm.txt"`
    );
    res.send(vdm);
    return;
  }

  res.json({
    format: 'vdm',
    clipStartTick: highlight.clipStartTick,
    clipEndTick: highlight.clipEndTick,
    tick: highlight.tick,
    round: highlight.round,
    playerName: highlight.playerName,
    description: highlight.description,
    content: vdm,
    clipRenderStatus: highlight.clipRenderStatus,
    clipVideoUrl: getHighlightClipPublicUrl(highlight.clipVideoPath),
  });
}

export function sendHighlightVideo(res: Response, highlight: HighlightRecord): void {
  if (highlight.clipRenderStatus === 'PROCESSING' || highlight.clipRenderStatus === 'PENDING') {
    res.status(202).json({
      error: 'Vídeo em renderização. Tente novamente em instantes.',
      clipRenderStatus: highlight.clipRenderStatus,
    });
    return;
  }

  if (highlight.clipRenderStatus !== 'COMPLETED' || !highlight.clipVideoPath) {
    res.status(400).json({
      error: highlight.clipRenderError || 'Vídeo MP4 indisponível para este destaque.',
      clipRenderStatus: highlight.clipRenderStatus,
    });
    return;
  }

  let filePath: string;
  try {
    filePath = resolveHighlightClipPath(highlight.clipVideoPath);
  } catch {
    res.status(404).json({ error: 'Arquivo de vídeo não encontrado' });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Arquivo de vídeo não encontrado' });
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="highlight-r${highlight.round}-${highlight.id.slice(0, 8)}.mp4"`
  );
  res.sendFile(filePath);
}
