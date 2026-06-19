import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl);

export const DEMO_QUEUE = 'demo:queue';

export async function enqueueDemoJob(demoId: string, filePath: string): Promise<void> {
  await redis.lpush(DEMO_QUEUE, JSON.stringify({ demoId, filePath }));
}
