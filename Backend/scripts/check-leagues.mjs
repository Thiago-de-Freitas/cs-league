import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const leagues = await prisma.league.findMany({
  select: {
    id: true,
    name: true,
    format: true,
    groupCount: true,
    advancePerGroup: true,
    status: true,
    _count: { select: { teams: true, matches: true } },
  },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
console.log(JSON.stringify(leagues, null, 2));
await prisma.$disconnect();
