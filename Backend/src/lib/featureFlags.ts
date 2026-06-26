/** Extração e render de destaques — desabilitado por padrão (HIGHLIGHTS_FEATURE_ENABLED=true para reativar). */
export function isHighlightsFeatureEnabled(): boolean {
  const raw = process.env.HIGHLIGHTS_FEATURE_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}
