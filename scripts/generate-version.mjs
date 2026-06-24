#!/usr/bin/env node
/**
 * Gera metadados de build (semver, commit, branch, data) para Backend e Frontend.
 * Uso: node scripts/generate-version.mjs
 * Env opcional: GIT_COMMIT, GIT_COMMIT_FULL, GIT_BRANCH, BUILD_TIME, BUILD_DIRTY
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(__dirname, '..');

const backendPkgPath = path.join(repoRoot, 'Backend', 'package.json');
const frontendPkgPath = path.join(repoRoot, 'Frontend', 'package.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: repoRoot,
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
  const commitFull = process.env.GIT_COMMIT_FULL?.trim() || runGit('rev-parse HEAD') || 'unknown';
  const commit =
    process.env.GIT_COMMIT?.trim()
    || (commitFull !== 'unknown' ? commitFull.slice(0, 7) : 'unknown');
  const branch =
    process.env.GIT_BRANCH?.trim()
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

function makeBuildInfo(component, pkg) {
  const git = resolveGitMeta();
  return {
    component,
    name: pkg.name,
    version: pkg.version ?? '0.0.0',
    commit: git.commit,
    commitFull: git.commitFull,
    branch: git.branch,
    buildTime: git.buildTime,
    dirty: git.dirty,
  };
}

function toTsExport(info) {
  return `/** Gerado automaticamente — não editar. */\nexport const BUILD_INFO = ${JSON.stringify(info, null, 2)} as const;\n\nexport type BuildInfo = typeof BUILD_INFO;\n`;
}

function writeFileEnsuringDir(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

const backendPkg = fs.existsSync(backendPkgPath) ? readJson(backendPkgPath) : null;
const frontendPkg = fs.existsSync(frontendPkgPath) ? readJson(frontendPkgPath) : null;

if (!backendPkg && !frontendPkg) {
  console.error('[version] Nenhum package.json encontrado em Backend/ ou Frontend/');
  process.exit(1);
}

if (backendPkg) {
  const backendInfo = makeBuildInfo('backend', backendPkg);
  writeFileEnsuringDir(
    path.join(repoRoot, 'Backend', 'src', 'generated', 'build-info.ts'),
    toTsExport(backendInfo)
  );
  console.log(
    `[version] backend ${backendInfo.version} (${backendInfo.commit}${backendInfo.dirty ? '-dirty' : ''})`
  );
}

if (frontendPkg) {
  const frontendInfo = makeBuildInfo('frontend', frontendPkg);
  writeFileEnsuringDir(
    path.join(repoRoot, 'Frontend', 'src', 'app', 'generated', 'build-info.ts'),
    toTsExport(frontendInfo)
  );
  writeFileEnsuringDir(
    path.join(repoRoot, 'Frontend', 'public', 'build-info.json'),
    `${JSON.stringify(frontendInfo, null, 2)}\n`
  );
  console.log(
    `[version] frontend ${frontendInfo.version} (${frontendInfo.commit}${frontendInfo.dirty ? '-dirty' : ''})`
  );
}
