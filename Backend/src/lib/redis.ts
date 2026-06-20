import Redis from 'ioredis';
import { isValidResourceId } from './pathSafe';
import { resolveDemoFilePath } from './demoStorage';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl);

export const DEMO_QUEUE = 'demo:queue';

export async function enqueueDemoJob(demoId: string, filePath: string): Promise<void> {
  if (!isValidResourceId(demoId)) {
    throw new Error('ID de demo inválido');
  }
  const safePath = resolveDemoFilePath(filePath);
  await redis.lpush(DEMO_QUEUE, JSON.stringify({ demoId, filePath: safePath }));
}
