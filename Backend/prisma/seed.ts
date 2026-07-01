import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';

const hashPassword = promisify(bcrypt.hash);
const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();

const ADMIN_DISPLAY_NAME = 'Administrador';
const MAX_EMAIL_LENGTH = 255;

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new Error('ADMIN_EMAIL é obrigatório para rodar o seed (defina no .env ou no ambiente).');
  }
  if (!adminEmail.includes('@') || adminEmail.length > MAX_EMAIL_LENGTH) {
    throw new Error('ADMIN_EMAIL inválido.');
  }

  const adminPass = process.env.ADMIN_PASS?.trim();
  if (!adminPass) {
    throw new Error('ADMIN_PASS é obrigatória para rodar o seed (defina no .env ou no ambiente).');
  }
  if (adminPass.length < 6) {
    throw new Error('ADMIN_PASS deve ter pelo menos 6 caracteres.');
  }

  console.log('Criando usuário administrador...\n');

  const passwordHash = await hashPassword(adminPass, BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      displayName: ADMIN_DISPLAY_NAME,
      role: 'ADMIN',
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: adminEmail,
      displayName: ADMIN_DISPLAY_NAME,
      role: 'ADMIN',
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✓ Admin criado/atualizado: ${adminEmail}`);
  console.log('\nSeed concluído.');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
