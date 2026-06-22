import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const demos = await prisma.demo.findMany({
  select: {
    id: true,
    fileName: true,
    status: true,
    errorMessage: true,
    isPersonal: true,
    createdAt: true,
    updatedAt: true,
  },
  orderBy: { createdAt: 'desc' },
  take: 15,
});
const counts = await prisma.demo.groupBy({
  by: ['status'],
  _count: { id: true },
});
console.log(JSON.stringify({ counts, demos }, null, 2));
await prisma.$disconnect();
