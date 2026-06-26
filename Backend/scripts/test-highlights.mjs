import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const hashPassword = promisify(bcrypt.hash);
const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_EMAIL = `hl-test-${Date.now()}@example.com`;
const TEST_PASS = 'testpass123';
const ids = {
  userId: null,
  leagueId: null,
  team1Id: null,
  team2Id: null,
  matchId: null,
  matchDemoId: null,
  personalDemoId: null,
  matchHighlightId: null,
  demoHighlightId: null,
};

async function request(apiPath, { method = 'GET', token, body, accept } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function adminToken() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASS?.trim();
  if (!adminEmail || !adminPass) {
    throw new Error('ADMIN_EMAIL e ADMIN_PASS são necessários no .env');
  }
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPass },
  });
  if (login.status !== 200 || !login.json?.token) {
    throw new Error(`Login admin falhou: ${login.status}`);
  }
  return login.json.token;
}

async function seedData(adminTok) {
  const passwordHash = await hashPassword(TEST_PASS, 12);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      displayName: 'Highlight Tester',
      steamId: '76561198999999999',
    },
  });
  ids.userId = user.id;

  const league = await prisma.league.create({
    data: {
      name: `HL Test ${Date.now()}`,
      ownerId: user.id,
      format: 'ONE_VS_ONE',
      maxTeams: 2,
      status: 'UPCOMING',
    },
  });
  ids.leagueId = league.id;

  const team1 = await prisma.team.create({
    data: { name: 'HL Team 1', tag: 'H1', ownerId: user.id },
  });
  const team2 = await prisma.team.create({
    data: { name: 'HL Team 2', tag: 'H2', ownerId: user.id },
  });
  ids.team1Id = team1.id;
  ids.team2Id = team2.id;

  await prisma.leagueTeam.createMany({
    data: [
      { leagueId: league.id, teamId: team1.id },
      { leagueId: league.id, teamId: team2.id },
    ],
  });

  const match = await prisma.match.create({
    data: {
      leagueId: league.id,
      team1Id: team1.id,
      team2Id: team2.id,
      status: 'SCHEDULED',
      phase: 'GROUP',
    },
  });
  ids.matchId = match.id;

  const matchDemo = await prisma.demo.create({
    data: {
      matchId: match.id,
      uploadedById: user.id,
      fileName: 'match-hl.dem',
      filePath: 'missing-match.dem',
      status: 'COMPLETED',
      isPersonal: false,
    },
  });
  ids.matchDemoId = matchDemo.id;

  const personalDemo = await prisma.demo.create({
    data: {
      uploadedById: user.id,
      fileName: 'personal-hl.dem',
      filePath: 'missing-personal.dem',
      status: 'COMPLETED',
      isPersonal: true,
    },
  });
  ids.personalDemoId = personalDemo.id;

  const matchHighlight = await prisma.matchHighlight.create({
    data: {
      matchId: match.id,
      demoId: matchDemo.id,
      round: 10,
      tick: 15000,
      clipStartTick: 14680,
      clipEndTick: 15320,
      steamId: user.steamId,
      playerName: user.displayName,
      type: 'ACE',
      description: 'ACE no round 10',
      score: 5.5,
      clipRenderStatus: 'COMPLETED',
      clipVideoPath: null,
    },
  });
  ids.matchHighlightId = matchHighlight.id;

  const demoHighlight = await prisma.demoHighlight.create({
    data: {
      demoId: personalDemo.id,
      round: 4,
      tick: 8000,
      clipStartTick: 7680,
      clipEndTick: 8320,
      steamId: user.steamId,
      playerName: user.displayName,
      type: 'CLUTCH',
      description: 'Clutch 1v2 no round 4',
      score: 8,
      clipRenderStatus: 'PENDING',
    },
  });
  ids.demoHighlightId = demoHighlight.id;

  const clipsDir = path.resolve(__dirname, '../data/highlights');
  fs.mkdirSync(clipsDir, { recursive: true });
  const clipFile = path.join(clipsDir, `${matchHighlight.id}.mp4`);
  fs.writeFileSync(clipFile, Buffer.from('fake-mp4-content'));

  await prisma.matchHighlight.update({
    where: { id: matchHighlight.id },
    data: { clipVideoPath: `${matchHighlight.id}.mp4` },
  });

  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASS },
  });
  if (userLogin.status !== 200 || !userLogin.json?.token) {
    throw new Error('Login do usuário de teste falhou');
  }

  return { userToken: userLogin.json.token, adminTok };
}

async function cleanup() {
  if (ids.matchHighlightId) {
    const clip = path.resolve(__dirname, `../data/highlights/${ids.matchHighlightId}.mp4`);
    if (fs.existsSync(clip)) fs.unlinkSync(clip);
  }
  if (ids.leagueId) {
    await prisma.league.deleteMany({ where: { id: ids.leagueId } });
  }
  if (ids.team1Id) await prisma.team.deleteMany({ where: { id: ids.team1Id } });
  if (ids.team2Id) await prisma.team.deleteMany({ where: { id: ids.team2Id } });
  if (ids.userId) await prisma.user.deleteMany({ where: { id: ids.userId } });
}

async function main() {
  const schema = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('MatchHighlight', 'DemoHighlight')
  `;
  const tables = schema.map((row) => row.table_name);
  if (!tables.includes('MatchHighlight') || !tables.includes('DemoHighlight')) {
    throw new Error(`Tabelas de highlight ausentes: ${tables.join(', ')}`);
  }
  console.log('✓ Schema MatchHighlight + DemoHighlight');

  const adminTok = await adminToken();
  console.log('✓ Login admin OK');

  const { userToken } = await seedData(adminTok);
  console.log('✓ Dados de teste criados');

  const match = await request(`/api/matches/${ids.matchId}`, { token: userToken });
  if (match.status !== 200) throw new Error(`GET match falhou: ${match.status}`);
  const matchHl = (match.json.highlights ?? []).find((h) => h.id === ids.matchHighlightId);
  if (!matchHl || matchHl.type !== 'ACE' || !matchHl.clipVideoUrl) {
    throw new Error('Match não retornou highlight serializado com clipVideoUrl');
  }
  console.log('✓ GET /api/matches/:id inclui highlights com clipVideoUrl');

  const matchHighlights = await request(`/api/matches/${ids.matchId}/highlights`, { token: userToken });
  if (matchHighlights.status !== 200 || !matchHighlights.json.videoExportAvailable) {
    throw new Error('Listagem de highlights da partida falhou');
  }
  console.log('✓ GET /api/matches/:id/highlights');

  const clip = await request(
    `/api/matches/${ids.matchId}/highlights/${ids.matchHighlightId}/clip?format=vdm`,
    { token: userToken, accept: 'text/plain' }
  );
  if (clip.status !== 200 || !clip.text.includes('mirv_cmd addAtTick')) {
    throw new Error('Download spec VDM falhou');
  }
  console.log('✓ GET clip spec VDM da partida');

  const video = await request(
    `/api/matches/${ids.matchId}/highlights/${ids.matchHighlightId}/video`,
    { token: userToken }
  );
  if (video.status !== 200) {
    throw new Error(`Download MP4 da partida falhou: ${video.status}`);
  }
  console.log('✓ GET vídeo MP4 da partida');

  const demo = await request(`/api/demos/${ids.personalDemoId}`, { token: userToken });
  if (demo.status !== 200) throw new Error(`GET demo falhou: ${demo.status}`);
  const demoHl = (demo.json.highlights ?? []).find((h) => h.id === ids.demoHighlightId);
  if (!demoHl || demoHl.type !== 'CLUTCH') {
    throw new Error('Demo pessoal não retornou highlight');
  }
  console.log('✓ GET /api/demos/:id inclui highlights pessoais');

  const demoHighlights = await request(`/api/demos/${ids.personalDemoId}/highlights`, { token: userToken });
  if (demoHighlights.status !== 200 || !Array.isArray(demoHighlights.json.highlights)) {
    throw new Error('Listagem de highlights da demo falhou');
  }
  console.log('✓ GET /api/demos/:id/highlights');

  const demoClip = await request(
    `/api/demos/${ids.personalDemoId}/highlights/${ids.demoHighlightId}/clip?format=vdm`,
    { token: userToken, accept: 'text/plain' }
  );
  if (demoClip.status !== 200 || !demoClip.text.includes('mirv_cmd')) {
    throw new Error('Download spec da demo pessoal falhou');
  }
  console.log('✓ GET clip spec da demo pessoal');

  const pendingVideo = await request(
    `/api/demos/${ids.personalDemoId}/highlights/${ids.demoHighlightId}/video`,
    { token: userToken }
  );
  if (pendingVideo.status !== 202) {
    throw new Error(`Vídeo pendente deveria retornar 202, obteve ${pendingVideo.status}`);
  }
  console.log('✓ GET vídeo pendente retorna 202');

  const forbidden = await request(`/api/matches/${ids.matchId}`, { token: null });
  if (forbidden.status !== 401) {
    throw new Error(`Acesso sem token deveria retornar 401, obteve ${forbidden.status}`);
  }
  console.log('✓ Proteção de autenticação');

  const internalKey = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (internalKey) {
    const internalRes = await fetch(`${API}/api/internal/matches/${ids.matchId}/highlights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': internalKey,
      },
      body: JSON.stringify({
        highlights: [
          {
            demoId: ids.matchDemoId,
            round: 1,
            tick: 1000,
            clipStartTick: 680,
            clipEndTick: 1320,
            steamId: '76561198999999999',
            playerName: 'Tester',
            type: 'OPENING_KILL',
            description: 'Opening kill',
            score: 3,
          },
        ],
      }),
    });
    if (internalRes.status !== 201) {
      throw new Error(`Internal highlights falhou: ${internalRes.status}`);
    }
    console.log('✓ POST internal/matches/:id/highlights');
  } else {
    console.log('⊘ POST internal (INTERNAL_SERVICE_KEY não configurado — pulado)');
  }

  console.log('\nIntegração de highlights: OK');
}

main()
  .catch(async (err) => {
    console.error('FALHA:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch {
      // ignore cleanup errors
    }
    await prisma.$disconnect();
  });
