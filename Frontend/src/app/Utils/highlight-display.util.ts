export function getHighlightTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MULTI_KILL: 'Multi-kill',
    ACE: 'ACE',
    CLUTCH: 'Clutch',
    OPENING_KILL: 'Opening kill',
  };
  return labels[type] ?? type;
}

export function getHighlightRenderLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    PENDING: 'Vídeo na fila',
    PROCESSING: 'Renderizando vídeo',
    COMPLETED: 'Vídeo pronto',
    FAILED: 'Falha no vídeo',
    UNAVAILABLE: 'Vídeo indisponível',
  };
  return labels[status ?? ''] ?? '';
}

export function getHighlightTypeAccent(type: string): string {
  const accents: Record<string, string> = {
    ACE: 'highlight-accent-ace',
    MULTI_KILL: 'highlight-accent-multikill',
    CLUTCH: 'highlight-accent-clutch',
    OPENING_KILL: 'highlight-accent-opening',
  };
  return accents[type] ?? 'highlight-accent-default';
}

export function getHighlightRenderBadgeClass(status?: string | null): string {
  switch (status) {
    case 'COMPLETED':
      return 'badge-green';
    case 'PENDING':
    case 'PROCESSING':
      return 'badge-orange';
    case 'FAILED':
      return 'badge-red';
    default:
      return 'badge-gray';
  }
}
