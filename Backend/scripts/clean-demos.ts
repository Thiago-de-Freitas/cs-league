import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { redis, DEMO_QUEUE } from '../src/lib/redis';
import { getDemoStoragePath } from '../src/lib/demoStorage';

async function main() {
  const storagePath = getDemoStoragePath();

  const statsDeleted = await prisma.matchPlayerStat.deleteMany();
  const demosDeleted = await prisma.demo.deleteMany();

  if (fs.existsSync(storagePath)) {
    for (const file of fs.readdirSync(storagePath)) {
      if (file.endsWith('.dem')) {
        fs.unlinkSync(path.join(storagePath, file));
      }
    }
  }

  await redis.del(DEMO_QUEUE);

  console.log(`Demos removidas: ${demosDeleted.count}`);
  console.log(`Stats removidas: ${statsDeleted.count}`);
  console.log(`Arquivos .dem limpos em: ${storagePath}`);
  console.log('Fila Redis demo:queue limpa.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
