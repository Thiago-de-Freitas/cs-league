#!/usr/bin/env node
/**
 * Gera metadados de build (semver, commit, branch, data) para Backend e Frontend.
 * Funciona no monorepo (raiz) ou com contexto isolado (Frontend/ ou Backend/).
 *
 * Uso: node scripts/generate-version.mjs
 * Env opcional: REPO_ROOT, GIT_COMMIT, GIT_COMMIT_FULL, GIT_BRANCH, BUILD_TIME, BUILD_DIRTY
 * Railway: RAILWAY_GIT_COMMIT_SHA, RAILWAY_GIT_BRANCH
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRepoRoot(scriptDir) {
  if (process.env.REPO_ROOT) {
    return path.resolve(process.env.REPO_ROOT);
  }

  const serviceRoot = path.resolve(scriptDir, '..');
  const serviceName = path.basename(serviceRoot);

  if (serviceName === 'Frontend' || serviceName === 'Backend') {
    const monorepoRoot = path.resolve(serviceRoot, '..');
    const hasMonorepo =
      fs.existsSync(path.join(monorepoRoot, 'Backend', 'package.json'))
      && fs.existsSync(path.join(monorepoRoot, 'Frontend', 'package.json'));
    return hasMonorepo ? monorepoRoot : serviceRoot;
  }

  return serviceRoot;
}

function resolveBuildTargets(root) {
  const targets = [];

  const monoBackendPkg = path.join(root, 'Backend', 'package.json');
  const monoFrontendPkg = path.join(root, 'Frontend', 'package.json');

  if (fs.existsSync(monoBackendPkg)) {
    targets.push({
      component: 'backend',
      pkg: readJson(monoBackendPkg),
      tsOut: path.join(root, 'Backend', 'src', 'generated', 'build-info.ts'),
    });
  }

  if (fs.existsSync(monoFrontendPkg)) {
    targets.push({
      component: 'frontend',
      pkg: readJson(monoFrontendPkg),
      tsOut: path.join(root, 'Frontend', 'src', 'app', 'generated', 'build-info.ts'),
      jsonOut: path.join(root, 'Frontend', 'public', 'build-info.json'),
    });
  }

  if (targets.length > 0) {
    return targets;
  }

  const rootPkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(rootPkgPath)) {
    return targets;
  }

  const pkg = readJson(rootPkgPath);
  if (pkg.name === 'gamers-league-api') {
    targets.push({
      component: 'backend',
      pkg,
      tsOut: path.join(root, 'src', 'generated', 'build-info.ts'),
    });
  } else if (pkg.name === 'gamers-league') {
    targets.push({
      component: 'frontend',
      pkg,
      tsOut: path.join(root, 'src', 'app', 'generated', 'build-info.ts'),
      jsonOut: path.join(root, 'public', 'build-info.json'),
    });
  }

  return targets;
}

const repoRoot = resolveRepoRoot(__dirname);
const gitRoot = fs.existsSync(path.join(repoRoot, '.git'))
  ? repoRoot
  : path.resolve(repoRoot, '..');

function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function isDirty() {
  if (process.env.BUILD_DIRTY === 'true') return true;
  if (process.env.BUILD_DIRTY === 'false') return false;
  const status = runGit('status --porcelain');
  return status.length > 0;
}

function resolveGitMeta() {
  const commitFull =
    process.env.GIT_COMMIT_FULL?.trim()
    || process.env.RAILWAY_GIT_COMMIT_SHA?.trim()
    || runGit('rev-parse HEAD')
    || 'unknown';
  const commit =
    process.env.GIT_COMMIT?.trim()
    || (commitFull !== 'unknown' ? commitFull.slice(0, 7) : 'unknown');
  const branch =
    process.env.GIT_BRANCH?.trim()
    || process.env.RAILWAY_GIT_BRANCH?.trim()
    || runGit('rev-parse --abbrev-ref HEAD')
    || 'unknown';
  const buildTime = process.env.BUILD_TIME?.trim() || new Date().toISOString();

  return {
    commit,
    commitFull,
    branch,
    buildTime,
    dirty: isDirty(),
  };
}

function resolveVersionCounts(version) {
  const commitCount = Number(runGit('rev-list --count HEAD')) || 0;
  const commitSubject = (runGit('log -1 --format=%s') || '').slice(0, 80);

  const exactTag = `v${version}`;
  let versionTag = '';
  let commitsSinceVersion = commitCount;

  if (runGit(`rev-list -n 1 ${exactTag}`)) {
    versionTag = exactTag;
    commitsSinceVersion = Number(runGit(`rev-list --count ${exactTag}..HEAD`)) || 0;
  } else {
    const latestTag = runGit('describe --tags --abbrev=0 --match v*');
    if (latestTag) {
      versionTag = latestTag;
      commitsSinceVersion = Number(runGit(`rev-list --count ${latestTag}..HEAD`)) || 0;
    }
  }

  return { commitCount, commitsSinceVersion, versionTag, commitSubject };
}

function makeBuildInfo(component, pkg) {
  const git = resolveGitMeta();
  const version = pkg.version ?? '0.0.0';
  const counts = resolveVersionCounts(version);
  return {
    component,
    name: pkg.name,
    version,
    commit: git.commit,
    commitFull: git.commitFull,
    branch: git.branch,
    buildTime: git.buildTime,
    dirty: git.dirty,
    commitCount: counts.commitCount,
    commitsSinceVersion: counts.commitsSinceVersion,
    versionTag: counts.versionTag || null,
    commitSubject: counts.commitSubject || null,
  };
}

function toTsExport(info, component) {
  const payload = JSON.stringify(info, null, 2);
  if (component === 'frontend') {
    return `/** Gerado automaticamente — não editar. */\nimport { normalizeBuildInfo, type BuildInfo } from '../Models/build-info';\n\nexport const BUILD_INFO: BuildInfo = normalizeBuildInfo(${payload});\n`;
  }
  return `/** Gerado automaticamente — não editar. */\nimport type { BuildInfo } from '../lib/buildInfo';\n\nexport const BUILD_INFO: BuildInfo = ${payload};\n`;
}

function writeFileEnsuringDir(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

const targets = resolveBuildTargets(repoRoot);

if (targets.length === 0) {
  console.error('[version] Nenhum package.json reconhecido em', repoRoot);
  process.exit(1);
}

for (const target of targets) {
  const info = makeBuildInfo(target.component, target.pkg);
  writeFileEnsuringDir(target.tsOut, toTsExport(info, target.component));
  if (target.jsonOut) {
    writeFileEnsuringDir(target.jsonOut, `${JSON.stringify(info, null, 2)}\n`);
  }
  console.log(
    `[version] ${target.component} v${info.version}+${info.commitCount} (${info.commit}${info.dirty ? '-dirty' : ''})`
  );
}
