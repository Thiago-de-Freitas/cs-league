import {
  clearHighlightGeneratePending,
  createHighlightSnapshot,
  findHighlightGeneratePendingForDemo,
  hasHighlightVideoRendering,
  isHighlightGenerationComplete,
  writeHighlightGeneratePending,
} from './highlight-generate-pending.util';
import { MatchHighlight } from '../Models/interfaces';

describe('highlight-generate-pending.util', () => {
  beforeEach(() => {
    clearHighlightGeneratePending();
  });

  it('persiste e recupera job pendente por demo', () => {
    writeHighlightGeneratePending({
      demoId: 'demo-1',
      startedAt: Date.now(),
      snapshotCount: 0,
      snapshotIds: [],
    });
    expect(findHighlightGeneratePendingForDemo('demo-1')?.demoId).toBe('demo-1');
    expect(findHighlightGeneratePendingForDemo('demo-2')).toBeNull();
  });

  it('detecta conclusão quando destaques novos aparecem', () => {
    const pending = {
      demoId: 'demo-1',
      startedAt: Date.now() - 5000,
      snapshotCount: 0,
      snapshotIds: [] as string[],
    };
    const highlights = [{ id: 'h1', clipRenderStatus: 'COMPLETED' }] as MatchHighlight[];
    expect(isHighlightGenerationComplete(highlights, pending)).toBeTrue();
  });

  it('continua enquanto vídeo renderiza', () => {
    const pending = {
      demoId: 'demo-1',
      startedAt: Date.now(),
      ...createHighlightSnapshot([{ id: 'h1' } as MatchHighlight]),
    };
    const highlights = [{ id: 'h1', clipRenderStatus: 'PROCESSING' }] as MatchHighlight[];
    expect(hasHighlightVideoRendering(highlights)).toBeTrue();
    expect(isHighlightGenerationComplete(highlights, pending)).toBeFalse();
  });
});
