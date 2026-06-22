import Redis from 'ioredis';
import { isValidResourceId } from './pathSafe';
import { resolveDemoFilePath } from './demoStorage';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let lastRedisErrorLog = 0;
const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;

function logRedisConnectionError(err: Error): void {
  const now = Date.now();
  if (now - lastRedisErrorLog < REDIS_ERROR_LOG_INTERVAL_MS) {
    return;
  }
  lastRedisErrorLog = now;
  console.error(`[redis] connection failed: ${err.message} — check REDIS_URL`);
}

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  retryStrategy(times) {
    return Math.min(times * 500, 30_000);
  },
});

redis.on('error', (err) => {
  logRedisConnectionError(err);
});

/** Tenta conectar sem derrubar a API se o Redis estiver indisponível. */
export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') {
    return;
  }
  try {
    await redis.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[redis] connection failed: ${message} — check REDIS_URL`);
  }
}

export const DEMO_QUEUE = 'demo:queue';

export async function enqueueDemoJob(demoId: string, filePath: string): Promise<void> {
  if (!isValidResourceId(demoId)) {
    throw new Error('ID de demo inválido');
  }
  const safePath = resolveDemoFilePath(filePath);
  await connectRedis();
  try {
    await redis.lpush(DEMO_QUEUE, JSON.stringify({ demoId, filePath: safePath }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fila Redis indisponível: ${message}`);
  }
}
