import { connectRedis, redis } from './redis';
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_SEC,
  EMAIL_RESEND_COOLDOWN_SEC,
  generateEmailVerificationCode,
  hashVerificationCode,
  maskEmail,
} from './emailVerification';
import { sendEmailChangeCode } from './email';

export type EmailChangePhase = 'old' | 'new';

export type EmailChangeState = {
  phase: EmailChangePhase;
  newEmail: string;
  codeHash: string;
  attempts: number;
};

const devStore = new Map<string, EmailChangeState>();
const devResendCooldown = new Map<string, number>();

function stateKey(userId: string): string {
  return `email-change:${userId}`;
}

function resendKey(userId: string, phase: EmailChangePhase): string {
  return `email-change:resend:${userId}:${phase}`;
}

function useDevMemoryFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function readState(userId: string): Promise<EmailChangeState | null> {
  if (useDevMemoryFallback() && redis.status !== 'ready') {
    return devStore.get(userId) ?? null;
  }

  await connectRedis();
  if (redis.status !== 'ready') {
    if (useDevMemoryFallback()) {
      return devStore.get(userId) ?? null;
    }
    throw new Error('Redis indisponível para troca de e-mail.');
  }

  const raw = await redis.get(stateKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EmailChangeState;
  } catch {
    return null;
  }
}

async function writeState(userId: string, state: EmailChangeState): Promise<void> {
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
    throw new Error('Redis indisponível para troca de e-mail.');
  }

  await redis.set(stateKey(userId), JSON.stringify(state), 'EX', EMAIL_CODE_TTL_SEC);
}

async function deleteState(userId: string): Promise<void> {
  devStore.delete(userId);
  if (redis.status === 'ready') {
    await redis.del(stateKey(userId));
  }
}

async function canResend(userId: string, phase: EmailChangePhase): Promise<boolean> {
  const key = resendKey(userId, phase);

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
    throw new Error('Redis indisponível para troca de e-mail.');
  }

  const exists = await redis.get(key);
  return !exists;
}

async function markResend(userId: string, phase: EmailChangePhase): Promise<void> {
  const key = resendKey(userId, phase);

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
    throw new Error('Redis indisponível para troca de e-mail.');
  }

  await redis.set(key, '1', 'EX', EMAIL_RESEND_COOLDOWN_SEC);
}

export type CodeCheckResult = 'valid' | 'invalid' | 'expired' | 'locked';

async function verifyCodeForState(state: EmailChangeState, code: string): Promise<CodeCheckResult> {
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

export async function cancelEmailChange(userId: string): Promise<void> {
  await deleteState(userId);
}

export async function getEmailChangeState(userId: string): Promise<EmailChangeState | null> {
  return readState(userId);
}

export async function startEmailChange(
  userId: string,
  currentEmail: string,
  newEmail: string,
  displayName: string
): Promise<{ ok: true; maskedEmail: string } | { ok: false; error: string }> {
  const canSend = await canResend(userId, 'old');
  if (!canSend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.' };
  }

  const code = generateEmailVerificationCode();
  const sent = await sendEmailChangeCode(currentEmail, code, displayName, 'old', newEmail);
  if (!sent.ok) {
    return sent;
  }

  await writeState(userId, {
    phase: 'old',
    newEmail,
    codeHash: hashVerificationCode(code),
    attempts: 0,
  });
  await markResend(userId, 'old');
  return { ok: true, maskedEmail: maskEmail(currentEmail) };
}

export async function verifyOldEmailForChange(
  userId: string,
  code: string,
  displayName: string
): Promise<
  | { ok: true; maskedNewEmail: string; newEmail: string }
  | { ok: false; error: string; code: CodeCheckResult | 'unavailable' }
> {
  const state = await readState(userId);
  if (!state || state.phase !== 'old') {
    return { ok: false, error: 'Solicitação expirada. Inicie a troca de e-mail novamente.', code: 'expired' };
  }

  const result = await verifyCodeForState(state, code);
  if (result !== 'valid') {
    if (result === 'locked') {
      await deleteState(userId);
      return { ok: false, error: 'Muitas tentativas incorretas. Inicie a troca de e-mail novamente.', code: 'locked' };
    }
    if (result === 'expired') {
      return { ok: false, error: 'Código expirado. Inicie a troca de e-mail novamente.', code: 'expired' };
    }
    await writeState(userId, state);
    return { ok: false, error: 'Código inválido.', code: 'invalid' };
  }

  const canSend = await canResend(userId, 'new');
  if (!canSend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.', code: 'invalid' };
  }

  const nextCode = generateEmailVerificationCode();
  const sent = await sendEmailChangeCode(state.newEmail, nextCode, displayName, 'new');
  if (!sent.ok) {
    return { ok: false, error: sent.error, code: 'invalid' };
  }

  await writeState(userId, {
    phase: 'new',
    newEmail: state.newEmail,
    codeHash: hashVerificationCode(nextCode),
    attempts: 0,
  });
  await markResend(userId, 'new');
  return { ok: true, maskedNewEmail: maskEmail(state.newEmail), newEmail: state.newEmail };
}

export async function verifyNewEmailForChange(
  userId: string,
  code: string
): Promise<
  | { ok: true; newEmail: string }
  | { ok: false; error: string; code: CodeCheckResult | 'unavailable' }
> {
  const state = await readState(userId);
  if (!state || state.phase !== 'new') {
    return { ok: false, error: 'Solicitação expirada. Inicie a troca de e-mail novamente.', code: 'expired' };
  }

  const result = await verifyCodeForState(state, code);
  if (result !== 'valid') {
    if (result === 'locked') {
      await deleteState(userId);
      return { ok: false, error: 'Muitas tentativas incorretas. Inicie a troca de e-mail novamente.', code: 'locked' };
    }
    await writeState(userId, state);
    return { ok: false, error: result === 'expired' ? 'Código expirado.' : 'Código inválido.', code: result };
  }

  await deleteState(userId);
  return { ok: true, newEmail: state.newEmail };
}

export async function resendEmailChangeCode(
  userId: string,
  currentEmail: string,
  displayName: string
): Promise<{ ok: true; phase: EmailChangePhase; maskedEmail: string } | { ok: false; error: string }> {
  const state = await readState(userId);
  if (!state) {
    return { ok: false, error: 'Nenhuma troca de e-mail em andamento.' };
  }

  const phase = state.phase;
  const canSend = await canResend(userId, phase);
  if (!canSend) {
    return { ok: false, error: 'Aguarde 2 minutos antes de solicitar um novo código.' };
  }

  const targetEmail = phase === 'old' ? currentEmail : state.newEmail;
  const code = generateEmailVerificationCode();
  const sent = await sendEmailChangeCode(
    targetEmail,
    code,
    displayName,
    phase,
    phase === 'old' ? state.newEmail : undefined
  );
  if (!sent.ok) {
    return sent;
  }

  await writeState(userId, {
    ...state,
    codeHash: hashVerificationCode(code),
    attempts: 0,
  });
  await markResend(userId, phase);
  return { ok: true, phase, maskedEmail: maskEmail(targetEmail) };
}
