import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const hashPassword = promisify(bcrypt.hash);
const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://localhost:3000';

const TEST_EMAIL = `mod-test-${Date.now()}@example.com`;
const TEST_PASS = 'testpass123';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASS?.trim();
  if (!adminEmail || !adminPass) {
    throw new Error('ADMIN_EMAIL e ADMIN_PASS são necessários no .env');
  }

  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('isActive', 'bannedUntil')
  `;
  console.log('✓ Colunas no banco:', cols.map((c) => c.column_name).join(', '));

  const passwordHash = await hashPassword(TEST_PASS, 12);
  const testUser = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      displayName: 'Mod Test User',
    },
  });
  console.log('✓ Usuário de teste criado:', testUser.id);

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPass },
  });
  if (adminLogin.status !== 200 || !adminLogin.json?.token) {
    throw new Error(`Login admin falhou: ${adminLogin.status} ${JSON.stringify(adminLogin.json)}`);
  }
  const adminToken = adminLogin.json.token;
  console.log('✓ Login admin OK');

  const list = await request('/api/users?limit=10', { token: adminToken });
  if (list.status !== 200 || !Array.isArray(list.json?.users)) {
    throw new Error(`Listagem admin falhou: ${list.status}`);
  }
  const entry = list.json.users.find((u) => u.id === testUser.id);
  if (!entry?.isActive || entry.isBanned) {
    throw new Error('Listagem não retornou status esperado para usuário novo');
  }
  console.log('✓ Listagem admin com isActive/isBanned');

  const ban = await request(`/api/users/${testUser.id}/ban`, {
    method: 'POST',
    token: adminToken,
    body: { days: 3 },
  });
  if (ban.status !== 200 || !ban.json?.user?.isBanned) {
    throw new Error(`Ban falhou: ${ban.status} ${JSON.stringify(ban.json)}`);
  }
  console.log('✓ Ban aplicado');

  const testLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASS },
  });
  if (testLogin.status !== 200 || !testLogin.json?.user?.isBanned) {
    throw new Error(`Login banido deveria funcionar com isBanned: ${testLogin.status}`);
  }
  const testToken = testLogin.json.token;
  console.log('✓ Login com ban ativo OK (isBanned=true)');

  const leagueAttempt = await request('/api/leagues', {
    method: 'POST',
    token: testToken,
    body: { name: 'Liga bloqueada', format: 'ROUND_ROBIN' },
  });
  if (leagueAttempt.status !== 403) {
    throw new Error(`Criar liga deveria retornar 403, obteve ${leagueAttempt.status}`);
  }
  console.log('✓ Participação bloqueada (403 ao criar liga)');

  const unban = await request(`/api/users/${testUser.id}/ban`, {
    method: 'DELETE',
    token: adminToken,
  });
  if (unban.status !== 200 || unban.json?.user?.isBanned) {
    throw new Error(`Unban falhou: ${unban.status}`);
  }
  console.log('✓ Ban removido');

  const deactivate = await request(`/api/users/${testUser.id}/deactivate`, {
    method: 'PATCH',
    token: adminToken,
  });
  if (deactivate.status !== 200 || deactivate.json?.user?.isActive !== false) {
    throw new Error(`Desativar falhou: ${deactivate.status}`);
  }
  console.log('✓ Conta desativada');

  const deactivatedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASS },
  });
  if (deactivatedLogin.status !== 403) {
    throw new Error(`Login desativado deveria retornar 403, obteve ${deactivatedLogin.status}`);
  }
  console.log('✓ Login bloqueado para conta desativada');

  const del = await request(`/api/users/${testUser.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  if (del.status !== 200) {
    throw new Error(`Exclusão falhou: ${del.status}`);
  }
  const gone = await prisma.user.findUnique({ where: { id: testUser.id } });
  if (gone) throw new Error('Usuário ainda existe após exclusão');
  console.log('✓ Usuário excluído');

  console.log('\nIntegração de moderação: OK');
}

main()
  .catch(async (err) => {
    console.error('FALHA:', err.message);
    process.exitCode = 1;
    try {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    } catch {
      // ignore cleanup errors
    }
  })
  .finally(() => prisma.$disconnect());
