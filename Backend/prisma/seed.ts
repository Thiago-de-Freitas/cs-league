import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';

const hashPassword = promisify(bcrypt.hash);
const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'tfgoncalvesfreelancer@gmail.com';
const ADMIN_DISPLAY_NAME = 'Administrador';

async function main() {
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
    where: { email: ADMIN_EMAIL },
    update: {
      displayName: ADMIN_DISPLAY_NAME,
      role: 'ADMIN',
      passwordHash,
    },
    create: {
      email: ADMIN_EMAIL,
      displayName: ADMIN_DISPLAY_NAME,
      role: 'ADMIN',
      passwordHash,
    },
  });

  console.log(`✓ Admin criado/atualizado: ${ADMIN_EMAIL}`);
  console.log('\nSeed concluído.');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
