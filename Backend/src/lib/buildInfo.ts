export interface BuildInfo {
  component: 'backend' | 'frontend';
  name: string;
  version: string;
  commit: string;
  commitFull: string;
  branch: string;
  buildTime: string;
  dirty: boolean;
  commitCount: number;
  commitsSinceVersion: number;
  versionTag: string | null;
  commitSubject: string | null;
}

const DEV_FALLBACK: BuildInfo = {
  component: 'backend',
  name: 'gamers-league-api',
  version: '0.0.0-dev',
  commit: 'dev',
  commitFull: 'dev',
  branch: 'local',
  buildTime: new Date(0).toISOString(),
  dirty: true,
  commitCount: 0,
  commitsSinceVersion: 0,
  versionTag: null,
  commitSubject: null,
};

let cached: BuildInfo | null = null;

function withDefaults(info: Partial<BuildInfo> & Pick<BuildInfo, 'component' | 'name' | 'version' | 'commit' | 'commitFull' | 'branch' | 'buildTime' | 'dirty'>): BuildInfo {
  return {
    commitCount: 0,
    commitsSinceVersion: 0,
    versionTag: null,
    commitSubject: null,
    ...info,
  };
}

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../generated/build-info') as { BUILD_INFO: BuildInfo };
    cached = withDefaults(mod.BUILD_INFO);
    return cached;
  } catch {
    cached = DEV_FALLBACK;
    return cached;
  }
}

export function formatVersionCore(info: Pick<BuildInfo, 'version' | 'commitCount'>): string {
  const build = info.commitCount ?? 0;
  return build > 0 ? `v${info.version}+${build}` : `v${info.version}`;
}

export function formatBuildLabel(info: BuildInfo = getBuildInfo()): string {
  const dirty = info.dirty ? '-dirty' : '';
  return `${formatVersionCore(info)} (${info.commit}${dirty})`;
}
