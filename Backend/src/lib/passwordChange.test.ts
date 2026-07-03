import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cancelPasswordChange,
  getPasswordChangeState,
  resendPasswordChangeCode,
  startPasswordChange,
  verifyPasswordChangeCode,
} from './passwordChange';

const EMAIL = 'player@example.com';
const NAME = 'Player One';

/**
 * Executa `fn` capturando o console.log (o provedor "console" registra o código
 * gerado) e devolve o código de 6 dígitos enviado por e-mail.
 */
async function captureCode(fn: () => Promise<unknown>): Promise<string> {
  const original = console.log;
  let code = '';
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    const match = line.match(/código\s+(\d{6})/);
    if (match) code = match[1];
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return code;
}

describe('passwordChange', () => {
  it('estado inicial é nulo', async () => {
    const state = await getPasswordChangeState('user-empty');
    assert.equal(state, null);
  });

  it('startPasswordChange envia código e cria estado', async () => {
    const userId = 'user-start';
    const code = await captureCode(() => startPasswordChange(userId, EMAIL, NAME));
    assert.match(code, /^\d{6}$/);
    assert.ok(await getPasswordChangeState(userId));
  });

  it('bloqueia reenvio imediato pelo cooldown', async () => {
    const userId = 'user-cooldown';
    await startPasswordChange(userId, EMAIL, NAME);
    const again = await startPasswordChange(userId, EMAIL, NAME);
    assert.equal(again.ok, false);
    if (!again.ok) {
      assert.match(again.error, /Aguarde/);
    }
  });

  it('código correto conclui a troca e limpa o estado', async () => {
    const userId = 'user-valid';
    const code = await captureCode(() => startPasswordChange(userId, EMAIL, NAME));
    const result = await verifyPasswordChangeCode(userId, code);
    assert.equal(result.ok, true);
    assert.equal(await getPasswordChangeState(userId), null);
  });

  it('código inválido retorna invalid sem apagar o estado', async () => {
    const userId = 'user-invalid';
    const code = await captureCode(() => startPasswordChange(userId, EMAIL, NAME));
    const wrong = code === '000000' ? '111111' : '000000';
    const result = await verifyPasswordChangeCode(userId, wrong);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'invalid');
    assert.ok(await getPasswordChangeState(userId));
  });

  it('bloqueia após muitas tentativas erradas', async () => {
    const userId = 'user-lock';
    const code = await captureCode(() => startPasswordChange(userId, EMAIL, NAME));
    const wrong = code === '000000' ? '111111' : '000000';
    let lastCode: string | undefined;
    for (let i = 0; i < 5; i++) {
      const res = await verifyPasswordChangeCode(userId, wrong);
      if (!res.ok) lastCode = res.code;
    }
    assert.equal(lastCode, 'locked');
    assert.equal(await getPasswordChangeState(userId), null);
  });

  it('verify sem estado retorna expired', async () => {
    const result = await verifyPasswordChangeCode('user-none', '123456');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'expired');
  });

  it('resend sem troca em andamento falha', async () => {
    const result = await resendPasswordChangeCode('user-noflow', EMAIL, NAME);
    assert.equal(result.ok, false);
  });

  it('cancelPasswordChange limpa o estado', async () => {
    const userId = 'user-cancel';
    await startPasswordChange(userId, EMAIL, NAME);
    await cancelPasswordChange(userId);
    assert.equal(await getPasswordChangeState(userId), null);
  });
});
