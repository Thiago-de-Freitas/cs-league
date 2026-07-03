import { connectRedis, redis } from './redis';
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_SEC,
  EMAIL_RESEND_COOLDOWN_SEC,
  generateEmailVerificationCode,
  hashVerificationCode,
  maskEmail,
} from './emailVerification';
import { sendPasswordChangeCode } from './email';

export type PasswordChangeState = {
  codeHash: string;
  attempts: number;
};

const devStore = new Map<string, PasswordChangeState>();
const devResendCooldown = new Map<string, number>();

function stateKey(userId: string): string {
  return `password-change:${userId}`;
}

function resendKey(userId: string): string {
  return `password-change:resend:${userId}`;
}

function useDevMemoryFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function readState(userId: string): Promise<PasswordChangeState | null> {
  if (useDevMemoryFallback() && redis.status !== 'ready') {
    return devStore.get(userId) ?? null;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      return devStore.get(userId) ?? null;
    }
    throw new Error('Redis indisponível para troca de senha.');
  }

  const raw = await redis.get(stateKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PasswordChangeState;
  } catch {
    return null;
  }
}

async function writeState(userId: string, state: PasswordChangeState): Promise<void> {
  if (useDevMemoryFallback() && redis.status !== 'ready') {
    devStore.set(userId, state);
    return;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      devStore.set(userId, state);
      return;
    }
    throw new Error('Redis indisponível para troca de senha.');
  }

  await redis.set(stateKey(userId), JSON.stringify(state), 'EX', EMAIL_CODE_TTL_SEC);
}

async function deleteState(userId: string): Promise<void> {
  devStore.delete(userId);
  if (redis.status === 'ready') {
    await redis.del(stateKey(userId));
  }
}

async function canResend(userId: string): Promise<boolean> {
  const key = resendKey(userId);

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
    throw new Error('Redis indisponível para troca de senha.');
  }

  const exists = await redis.get(key);
  return !exists;
}

async function markResend(userId: string): Promise<void> {
  const key = resendKey(userId);

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
    throw new Error('Redis indisponível para troca de senha.');
  }

  await redis.set(key, '1', 'EX', EMAIL_RESEND_COOLDOWN_SEC);
}

export type CodeCheckResult = 'valid' | 'invalid' | 'expired' | 'locked';

async function verifyCodeForState(state: PasswordChangeState, code: string): Promise<CodeCheckResult> {
  if (state.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    return 'locked';
  }

  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== 6) {
    state.attempts += 1;
    return state.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'locked' : 'invalid';
  }

  const matches = state.codeHash === hashVerificationCode(normalized);
  if (!matches) {
    state.attempts += 1;
    return state.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'locked' : 'invalid';
  }

  return 'valid';
}

export async function cancelPasswordChange(userId: string): Promise<void> {
  await deleteState(userId);
}

export async function getPasswordChangeState(userId: string): Promise<PasswordChangeState | null> {
  return readState(userId);
}

export async function startPasswordChange(
  userId: string,
  email: string,
  displayName: string
): Promise<{ ok: true; maskedEmail: string } | { ok: false; error: string }> {
  const canSend = await canResend(userId);
  if (!canSend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.' };
  }

  const code = generateEmailVerificationCode();
  const sent = await sendPasswordChangeCode(email, code, displayName);
  if (!sent.ok) {
    return sent;
  }

  await writeState(userId, {
    codeHash: hashVerificationCode(code),
    attempts: 0,
  });
  await markResend(userId);
  return { ok: true, maskedEmail: maskEmail(email) };
}

export async function verifyPasswordChangeCode(
  userId: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string; code: CodeCheckResult }> {
  const state = await readState(userId);
  if (!state) {
    return { ok: false, error: 'Solicitação expirada. Inicie a troca de senha novamente.', code: 'expired' };
  }

  const result = await verifyCodeForState(state, code);
  if (result !== 'valid') {
    if (result === 'locked') {
      await deleteState(userId);
      return { ok: false, error: 'Muitas tentativas incorretas. Inicie a troca de senha novamente.', code: 'locked' };
    }
    if (result === 'expired') {
      return { ok: false, error: 'Código expirado. Inicie a troca de senha novamente.', code: 'expired' };
    }
    await writeState(userId, state);
    return { ok: false, error: 'Código inválido.', code: 'invalid' };
  }

  await deleteState(userId);
  return { ok: true };
}

export async function resendPasswordChangeCode(
  userId: string,
  email: string,
  displayName: string
): Promise<{ ok: true; maskedEmail: string } | { ok: false; error: string }> {
  const state = await readState(userId);
  if (!state) {
    return { ok: false, error: 'Nenhuma troca de senha em andamento.' };
  }

  const canSend = await canResend(userId);
  if (!canSend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.' };
  }

  const code = generateEmailVerificationCode();
  const sent = await sendPasswordChangeCode(email, code, displayName);
  if (!sent.ok) {
    return sent;
  }

  await writeState(userId, {
    codeHash: hashVerificationCode(code),
    attempts: 0,
  });
  await markResend(userId);
  return { ok: true, maskedEmail: maskEmail(email) };
}
