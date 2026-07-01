import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDemoUploadTempPath } from './demoStorage';

const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface DemoUploadSessionMeta {
  uploadId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  isPersonal: boolean;
  matchId?: string;
  createdAt: number;
  receivedChunks: number[];
}

export function getDemoUploadChunkBytes(): number {
  const raw = process.env.DEMO_UPLOAD_CHUNK_BYTES?.trim();
  if (!raw) return DEFAULT_CHUNK_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 256 * 1024 || parsed > 16 * 1024 * 1024) {
    return DEFAULT_CHUNK_BYTES;
  }
  return parsed;
}

function getSessionsRoot(): string {
  return path.join(getDemoUploadTempPath(), 'sessions');
}

function getSessionDir(uploadId: string): string {
  return path.join(getSessionsRoot(), uploadId);
}

function getMetaPath(uploadId: string): string {
  return path.join(getSessionDir(uploadId), 'meta.json');
}

export function getChunkPath(uploadId: string, index: number): string {
  return path.join(getSessionDir(uploadId), 'chunks', String(index));
}

function readMeta(uploadId: string): DemoUploadSessionMeta | null {
  const metaPath = getMetaPath(uploadId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as DemoUploadSessionMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: DemoUploadSessionMeta): void {
  fs.writeFileSync(getMetaPath(meta.uploadId), JSON.stringify(meta));
}

export function cleanupStaleDemoUploadSessions(): void {
  const root = getSessionsRoot();
  if (!fs.existsSync(root)) return;
  const now = Date.now();
  for (const uploadId of fs.readdirSync(root)) {
    const meta = readMeta(uploadId);
    if (!meta || now - meta.createdAt > SESSION_TTL_MS) {
      fs.rmSync(path.join(root, uploadId), { recursive: true, force: true });
    }
  }
}

export function createDemoUploadSession(input: {
  userId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  isPersonal: boolean;
  matchId?: string;
}): DemoUploadSessionMeta {
  cleanupStaleDemoUploadSessions();
  const uploadId = uuidv4();
  const dir = getSessionDir(uploadId);
  fs.mkdirSync(path.join(dir, 'chunks'), { recursive: true });
  const meta: DemoUploadSessionMeta = {
    uploadId,
    userId: input.userId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    totalChunks: input.totalChunks,
    isPersonal: input.isPersonal,
    ...(input.matchId && !input.isPersonal ? { matchId: input.matchId } : {}),
    createdAt: Date.now(),
    receivedChunks: [],
  };
  writeMeta(meta);
  return meta;
}

export function loadDemoUploadSession(uploadId: string, userId: string): DemoUploadSessionMeta | null {
  const meta = readMeta(uploadId);
  if (!meta || meta.userId !== userId) return null;
  if (Date.now() - meta.createdAt > SESSION_TTL_MS) {
    destroyDemoUploadSession(uploadId);
    return null;
  }
  return meta;
}

export function markChunkReceived(uploadId: string, userId: string, index: number): DemoUploadSessionMeta | null {
  const meta = loadDemoUploadSession(uploadId, userId);
  if (!meta) return null;
  if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
    return null;
  }
  if (!meta.receivedChunks.includes(index)) {
    meta.receivedChunks.push(index);
    meta.receivedChunks.sort((a, b) => a - b);
    writeMeta(meta);
  }
  return meta;
}

export function isDemoUploadSessionComplete(meta: DemoUploadSessionMeta): boolean {
  return meta.receivedChunks.length === meta.totalChunks;
}

export async function assembleDemoUploadSession(uploadId: string, userId: string): Promise<string> {
  const meta = loadDemoUploadSession(uploadId, userId);
  if (!meta) {
    throw new Error('Sessão de upload não encontrada ou expirada');
  }
  if (!isDemoUploadSessionComplete(meta)) {
    throw new Error('Upload incompleto — envie todos os blocos antes de finalizar');
  }

  const assembledPath = path.join(getSessionDir(uploadId), 'assembled.dem');
  const fd = fs.openSync(assembledPath, 'w');

  try {
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkPath = getChunkPath(uploadId, i);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`Bloco ${i} ausente no servidor`);
      }
      fs.writeSync(fd, fs.readFileSync(chunkPath));
    }
  } catch (err) {
    fs.closeSync(fd);
    fs.unlink(assembledPath, () => {});
    throw err;
  }
  fs.closeSync(fd);

  const stat = fs.statSync(assembledPath);
  if (stat.size !== meta.fileSize) {
    fs.unlink(assembledPath, () => {});
    throw new Error('Tamanho do arquivo montado não confere com o informado');
  }

  return assembledPath;
}

export function destroyDemoUploadSession(uploadId: string): void {
  const dir = getSessionDir(uploadId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function validateChunkedUploadParams(
  fileName: string,
  fileSize: number,
  totalChunks: number
): { valid: true } | { valid: false; error: string } {
  if (!fileName.toLowerCase().endsWith('.dem')) {
    return { valid: false, error: 'Apenas arquivos .dem são permitidos' };
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { valid: false, error: 'Tamanho do arquivo inválido' };
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1) {
    return { valid: false, error: 'Número de blocos inválido' };
  }
  const chunkBytes = getDemoUploadChunkBytes();
  const expectedChunks = Math.ceil(fileSize / chunkBytes);
  if (totalChunks !== expectedChunks) {
    return {
      valid: false,
      error: `Número de blocos incorreto (esperado ${expectedChunks} para ${chunkBytes} bytes por bloco)`,
    };
  }
  return { valid: true };
}
