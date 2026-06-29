import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const API = 'http://localhost:3000';
const demoId = process.argv[2] ?? 'cmqv8lfvc00090wq4mdby0vx7';

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gamersleague.com', password: 'admin123' }),
  }).then((r) => r.json() as Promise<{ token?: string }>);

  const token = login.token;
  if (!token) throw new Error('login failed');

  const gen = await fetch(`${API}/api/demos/${demoId}/highlights/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('generate', gen.status, await gen.text());

  for (let i = 0; i < 30; i++) {
    const p = await fetch(`${API}/api/demos/${demoId}/highlights/progress`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json() as Promise<{ phase?: string; percent?: number; message?: string }>);
    console.log('progress', p.phase, p.percent, p.message);
    if (p.phase === 'completed' || p.phase === 'failed') break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  const count = await prisma.demoHighlight.count({ where: { demoId } });
  console.log('db highlights', count);
}

main().finally(() => prisma.$disconnect());
