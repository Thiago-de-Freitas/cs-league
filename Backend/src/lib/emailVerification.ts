import crypto from 'node:crypto';
import { connectRedis, redis } from './redis';
import { sendVerificationEmail } from './email';

export const EMAIL_CODE_TTL_SEC = 600;
export const EMAIL_RESEND_COOLDOWN_SEC = 120;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

type StoredVerification = {
  codeHash: string;
  attempts: number;
};

const devVerificationStore = new Map<string, StoredVerification>();
const devResendCooldown = new Map<string, number>();

function verificationKey(userId: string): string {
  return `email-verify:${userId}`;
}

function resendKey(email: string): string {
  return `email-verify:resend:${email.trim().toLowerCase()}`;
}

function codeSecret(): string {
  return process.env.JWT_SECRET?.trim() || 'dev-email-code-secret';
}

export function generateEmailVerificationCode(): string {
  return String(crypto.randomInt(100000, 1_000_000));
}

export function hashVerificationCode(code: string): string {
  const normalized = code.replace(/\D/g, '');
  return crypto.createHash('sha256').update(`${codeSecret()}:${normalized}`).digest('hex');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

function useDevMemoryFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function readStoredVerification(userId: string): Promise<StoredVerification | null> {
  if (useDevMemoryFallback() && redis.status !== 'ready') {
    return devVerificationStore.get(userId) ?? null;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      return devVerificationStore.get(userId) ?? null;
    }
    throw new Error('Redis indisponível para verificação de e-mail.');
  }

  const raw = await redis.get(verificationKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVerification;
  } catch {
    return null;
  }
}

async function writeStoredVerification(userId: string, payload: StoredVerification): Promise<void> {
  if (useDevMemoryFallback() && redis.status !== 'ready') {
    devVerificationStore.set(userId, payload);
    return;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      devVerificationStore.set(userId, payload);
      return;
    }
    throw new Error('Redis indisponível para verificação de e-mail.');
  }

  await redis.set(verificationKey(userId), JSON.stringify(payload), 'EX', EMAIL_CODE_TTL_SEC);
}

async function deleteStoredVerification(userId: string): Promise<void> {
  devVerificationStore.delete(userId);
  if (redis.status === 'ready') {
    await redis.del(verificationKey(userId));
  }
}

export async function storeVerificationCode(userId: string, code: string): Promise<void> {
  await writeStoredVerification(userId, {
    codeHash: hashVerificationCode(code),
    attempts: 0,
  });
}

export type VerificationCheckResult = 'valid' | 'invalid' | 'expired' | 'locked';

export async function verifyStoredCode(userId: string, code: string): Promise<VerificationCheckResult> {
  const stored = await readStoredVerification(userId);
  if (!stored) return 'expired';

  if (stored.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    await deleteStoredVerification(userId);
    return 'locked';
  }

  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== 6) {
    stored.attempts += 1;
    await writeStoredVerification(userId, stored);
    return stored.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'locked' : 'invalid';
  }

  const matches = stored.codeHash === hashVerificationCode(normalized);
  if (!matches) {
    stored.attempts += 1;
    await writeStoredVerification(userId, stored);
    return stored.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'locked' : 'invalid';
  }

  await deleteStoredVerification(userId);
  return 'valid';
}

export async function canResendVerification(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const key = resendKey(normalized);

  if (useDevMemoryFallback() && redis.status !== 'ready') {
    const until = devResendCooldown.get(key);
    return !until || Date.now() >= until;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      const until = devResendCooldown.get(key);
      return !until || Date.now() >= until;
    }
    throw new Error('Redis indisponível para verificação de e-mail.');
  }

  const exists = await redis.get(key);
  return !exists;
}

export async function markResendCooldown(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const key = resendKey(normalized);

  if (useDevMemoryFallback() && redis.status !== 'ready') {
    devResendCooldown.set(key, Date.now() + EMAIL_RESEND_COOLDOWN_SEC * 1000);
    return;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      devResendCooldown.set(key, Date.now() + EMAIL_RESEND_COOLDOWN_SEC * 1000);
      return;
    }
    throw new Error('Redis indisponível para verificação de e-mail.');
  }

  await redis.set(key, '1', 'EX', EMAIL_RESEND_COOLDOWN_SEC);
}

export async function issueVerificationCode(
  userId: string,
  email: string,
  displayName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const canResend = await canResendVerification(email);
  if (!canResend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.' };
  }

  const code = generateEmailVerificationCode();
  const sent = await sendVerificationEmail(email, code, displayName);
  if (!sent.ok) {
    return sent;
  }

  await storeVerificationCode(userId, code);
  await markResendCooldown(email);
  return { ok: true };
}
