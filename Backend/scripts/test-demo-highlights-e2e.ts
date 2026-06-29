/**
 * Teste E2E local: upload de demo pessoal + geração de destaques.
 * Uso: npx tsx scripts/test-demo-highlights-e2e.ts [caminho.dem] [steamId]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Blob } from 'node:buffer';

const API = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@gamersleague.com';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'admin123';

const DEFAULT_DEMO = String.raw`C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\replays\match730_003816032273745052085_0593011861_201.dem`;
const DEFAULT_STEAM_ID = '76561199263125658';

const demoPath = process.argv[2] ?? DEFAULT_DEMO;
const steamId = process.argv[3] ?? DEFAULT_STEAM_ID;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api<T>(
  method: string,
  route: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { raw: text } as T;
  }
  return { status: res.status, data };
}

async function login(): Promise<string> {
  const { status, data } = await api<{ token?: string; error?: string }>('POST', '/api/auth/login', undefined, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (status !== 200 || !data.token) {
    throw new Error(`Login falhou (${status}): ${data.error ?? JSON.stringify(data)}`);
  }
  return data.token;
}

async function setSteamId(token: string): Promise<void> {
  const { status, data } = await api<{ error?: string }>('PATCH', '/api/auth/me', token, { steamId });
  if (status !== 200) {
    throw new Error(`PATCH /me falhou (${status}): ${JSON.stringify(data)}`);
  }
  console.log(`✓ Steam ID configurado: ${steamId}`);
}

async function deleteExistingByFileName(token: string, fileName: string): Promise<void> {
  const { data: personal } = await api<Array<{ id: string; fileName: string }>>('GET', '/api/demos/personal', token);
  const { data: general } = await api<Array<{ id: string; fileName: string }>>('GET', '/api/demos', token);
  const all = [...(personal ?? []), ...(general ?? [])];
  const matches = all.filter((d) => d.fileName.toLowerCase() === fileName.toLowerCase());
  for (const demo of matches) {
    const { status } = await api('DELETE', `/api/demos/${demo.id}`, token);
    console.log(`✓ Demo removida: ${demo.id} (${demo.fileName}) status=${status}`);
  }
}

async function uploadDemo(token: string, filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  console.log(`↑ Upload ${fileName} (${(stat.size / (1024 * 1024)).toFixed(1)} MB)...`);

  const form = new FormData();
  form.append('demo', new Blob([fs.readFileSync(filePath)]), fileName);
  form.append('isPersonal', 'true');

  const res = await fetch(`${API}/api/demos/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const data = (await res.json()) as { id?: string; error?: string };
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Upload falhou (${res.status}): ${data.error ?? JSON.stringify(data)}`);
  }
  if (!data.id) {
    throw new Error(`Upload sem id: ${JSON.stringify(data)}`);
  }
  console.log(`✓ Upload OK: demoId=${data.id}`);
  return data.id;
}

async function waitDemoCompleted(token: string, demoId: string, timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await api<{ status?: string; errorMessage?: string }>('GET', `/api/demos/${demoId}`, token);
    const status = String(data.status ?? '').toLowerCase();
    console.log(`  demo status=${status}`);
    if (status === 'completed') return;
    if (status === 'failed') {
      throw new Error(`Demo falhou: ${data.errorMessage ?? 'sem mensagem'}`);
    }
    await sleep(5000);
  }
  throw new Error('Timeout aguardando processamento da demo');
}

async function generateHighlights(token: string, demoId: string): Promise<void> {
  const { status, data } = await api<{ ok?: boolean; error?: string; message?: string }>(
    'POST',
    `/api/demos/${demoId}/highlights/generate`,
    token,
    {}
  );
  if (status !== 202) {
    throw new Error(`Gerar destaques falhou (${status}): ${data.error ?? JSON.stringify(data)}`);
  }
  console.log(`✓ ${data.message ?? 'Destaques enfileirados'}`);
}

async function waitHighlightProgress(token: string, demoId: string, timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let data: {
      phase?: string;
      percent?: number;
      message?: string;
      error?: string;
    };
    try {
      ({ data } = await api('GET', `/api/demos/${demoId}/highlights/progress`, token));
    } catch (err) {
      console.log('  highlights poll retry (API indisponível)...');
      await sleep(2000);
      continue;
    }

    const phase = data.phase ?? 'unknown';
    const pct = data.percent ?? 0;
    console.log(`  highlights phase=${phase} ${pct}% — ${data.message ?? ''}`);
    if (phase === 'completed') return;
    if (phase === 'failed') {
      throw new Error(`Destaques falharam: ${data.error ?? data.message ?? 'sem detalhe'}`);
    }
    if (phase === 'rendering' || phase === 'saving') {
      const { data: list } = await api<{ highlights?: unknown[] }>(
        'GET',
        `/api/demos/${demoId}/highlights`,
        token
      );
      if ((list.highlights?.length ?? 0) > 0) {
        console.log(`✓ ${list.highlights!.length} destaque(s) salvos (renderização pode continuar em segundo plano)`);
        return;
      }
    }
    await sleep(3000);
  }
  throw new Error('Timeout aguardando destaques');
}

async function listHighlights(token: string, demoId: string): Promise<number> {
  const { status, data } = await api<{ highlights?: unknown[]; error?: string }>(
    'GET',
    `/api/demos/${demoId}/highlights`,
    token
  );
  if (status !== 200) {
    throw new Error(`Listar destaques falhou (${status}): ${data.error ?? JSON.stringify(data)}`);
  }
  const count = data.highlights?.length ?? 0;
  console.log(`✓ Destaques na demo: ${count}`);
  if (count > 0) {
    const first = data.highlights![0] as Record<string, unknown>;
    console.log('  exemplo:', first.type, first.playerName, first.description);
  }
  return count;
}

async function main(): Promise<void> {
  console.log('=== E2E upload + destaques ===');
  console.log('API:', API);
  console.log('Demo:', demoPath);
  console.log('Steam ID:', steamId);

  const token = await login();
  await setSteamId(token);
  await deleteExistingByFileName(token, path.basename(demoPath));

  const demoId = await uploadDemo(token, demoPath);
  await waitDemoCompleted(token, demoId);
  await generateHighlights(token, demoId);
  await waitHighlightProgress(token, demoId);
  const count = await listHighlights(token, demoId);

  if (count === 0) {
    throw new Error('Nenhum destaque gerado após pipeline completo');
  }
  console.log('\n=== SUCESSO ===');
}

main().catch((err) => {
  console.error('\n=== FALHA ===');
  console.error(err);
  process.exit(1);
});
