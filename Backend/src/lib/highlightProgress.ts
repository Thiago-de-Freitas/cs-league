import { connectRedis, redis } from './redis';

export type HighlightProgressScope = 'demo' | 'match';

export interface HighlightProgress {
  scope: HighlightProgressScope;
  parentId: string;
  percent: number;
  phase: 'queued' | 'extracting' | 'saving' | 'rendering' | 'completed' | 'failed';
  message: string;
  renderTotal: number;
  renderCompleted: number;
  error?: string;
  updatedAt: string;
}

const PROGRESS_TTL_SEC = 30 * 60;

function progressKey(scope: HighlightProgressScope, parentId: string): string {
  return `highlight:progress:${scope}:${parentId}`;
}

export async function setHighlightProgress(
  scope: HighlightProgressScope,
  parentId: string,
  patch: Partial<HighlightProgress> & Pick<HighlightProgress, 'percent' | 'phase' | 'message'>
): Promise<void> {
  await connectRedis();
  const key = progressKey(scope, parentId);
  const existingRaw = await redis.get(key);
  const existing = existingRaw ? (JSON.parse(existingRaw) as HighlightProgress) : null;

  const next: HighlightProgress = {
    scope,
    parentId,
    percent: patch.percent,
    phase: patch.phase,
    message: patch.message,
    renderTotal: patch.renderTotal ?? existing?.renderTotal ?? 0,
    renderCompleted: patch.renderCompleted ?? existing?.renderCompleted ?? 0,
    error: patch.error,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(key, JSON.stringify(next), 'EX', PROGRESS_TTL_SEC);
}

export async function initHighlightProgress(
  scope: HighlightProgressScope,
  parentId: string
): Promise<void> {
  await setHighlightProgress(scope, parentId, {
    percent: 0,
    phase: 'queued',
    message: 'Na fila de extração de destaques...',
    renderTotal: 0,
    renderCompleted: 0,
  });
}

export async function getHighlightProgress(
  scope: HighlightProgressScope,
  parentId: string
): Promise<HighlightProgress | null> {
  try {
    await connectRedis();
    const raw = await redis.get(progressKey(scope, parentId));
    if (!raw) return null;
    return JSON.parse(raw) as HighlightProgress;
  } catch {
    return null;
  }
}

export async function clearHighlightProgress(
  scope: HighlightProgressScope,
  parentId: string
): Promise<void> {
  await connectRedis();
  await redis.del(progressKey(scope, parentId));
}

export async function markHighlightRenderQueued(
  scope: HighlightProgressScope,
  parentId: string,
  renderTotal: number
): Promise<void> {
  await setHighlightProgress(scope, parentId, {
    percent: renderTotal > 0 ? 55 : 100,
    phase: renderTotal > 0 ? 'rendering' : 'completed',
    message:
      renderTotal > 0
        ? `Destaques detectados. Gerando ${renderTotal} vídeo(s)...`
        : 'Destaques gerados (nenhum clipe para renderizar).',
    renderTotal,
    renderCompleted: 0,
  });
}

export function computeHighlightRenderPercent(renderCompleted: number, renderTotal: number): number {
  const total = Math.max(renderTotal, renderCompleted);
  const ratio = total > 0 ? renderCompleted / total : 1;
  return Math.min(100, Math.round(55 + ratio * 45));
}

export async function bumpHighlightRenderProgress(
  scope: HighlightProgressScope,
  parentId: string,
  status: string
): Promise<void> {
  if (!['COMPLETED', 'FAILED', 'UNAVAILABLE'].includes(status)) {
    return;
  }

  const current = await getHighlightProgress(scope, parentId);
  if (!current || current.phase !== 'rendering') {
    return;
  }

  const renderCompleted = current.renderCompleted + 1;
  const renderTotal = Math.max(current.renderTotal, renderCompleted);
  const percent = computeHighlightRenderPercent(renderCompleted, renderTotal);

  await setHighlightProgress(scope, parentId, {
    percent,
    phase: renderCompleted >= renderTotal ? 'completed' : 'rendering',
    message:
      renderCompleted >= renderTotal
        ? 'Destaques prontos.'
        : `Gerando vídeos (${renderCompleted}/${renderTotal})...`,
    renderTotal,
    renderCompleted,
  });
}
