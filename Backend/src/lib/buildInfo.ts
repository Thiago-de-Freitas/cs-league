export interface BuildInfo {
  component: 'backend' | 'frontend';
  name: string;
  version: string;
  commit: string;
  commitFull: string;
  branch: string;
  buildTime: string;
  dirty: boolean;
}

const DEV_FALLBACK: BuildInfo = {
  component: 'backend',
  name: 'cs-league-api',
  version: '0.0.0-dev',
  commit: 'dev',
  commitFull: 'dev',
  branch: 'local',
  buildTime: new Date(0).toISOString(),
  dirty: true,
};

let cached: BuildInfo | null = null;

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../generated/build-info') as { BUILD_INFO: BuildInfo };
    cached = mod.BUILD_INFO;
    return cached;
  } catch {
    cached = DEV_FALLBACK;
    return cached;
  }
}

export function formatBuildLabel(info: BuildInfo = getBuildInfo()): string {
  const dirty = info.dirty ? '-dirty' : '';
  return `v${info.version} (${info.commit}${dirty})`;
}
