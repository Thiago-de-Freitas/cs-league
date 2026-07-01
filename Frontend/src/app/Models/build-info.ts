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

type BuildInfoCore = Pick<
  BuildInfo,
  'component' | 'name' | 'version' | 'commit' | 'commitFull' | 'branch' | 'buildTime' | 'dirty'
>;

const BUILD_INFO_DEFAULTS: Pick<
  BuildInfo,
  'commitCount' | 'commitsSinceVersion' | 'versionTag' | 'commitSubject'
> = {
  commitCount: 0,
  commitsSinceVersion: 0,
  versionTag: null,
  commitSubject: null,
};

/** Garante campos de versão mesmo em metadados gerados por scripts antigos. */
export function normalizeBuildInfo(info: BuildInfoCore & Partial<BuildInfo>): BuildInfo {
  return { ...BUILD_INFO_DEFAULTS, ...info };
}
