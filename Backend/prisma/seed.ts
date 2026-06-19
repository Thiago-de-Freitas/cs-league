import { PrismaClient, LeagueStatus, MatchStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { getFirstRoundPairings } from '../src/lib/bracket';

const prisma = new PrismaClient();
const PASSWORD = '123456';

const USERS = [
  { email: 'admin@test.com', displayName: 'Admin Test', role: 'ADMIN' as const },
  { email: 'thiago@csleague.com', displayName: 'Thiago Freitas', role: 'USER' as const },
  { email: 'player1@csleague.com', displayName: 'FalleN', role: 'USER' as const },
  { email: 'player2@csleague.com', displayName: 'fer', role: 'USER' as const },
  { email: 'player3@csleague.com', displayName: 'yuurih', role: 'USER' as const },
  { email: 'player4@csleague.com', displayName: 'KSCERATO', role: 'USER' as const },
  { email: 'player5@csleague.com', displayName: 'drop', role: 'USER' as const },
  { email: 'player6@csleague.com', displayName: 'saffee', role: 'USER' as const },
  { email: 'player7@csleague.com', displayName: 'ZywOo', role: 'USER' as const },
  { email: 'player8@csleague.com', displayName: 'apEX', role: 'USER' as const },
  { email: 'player9@csleague.com', displayName: 'NiKo', role: 'USER' as const },
  { email: 'player10@csleague.com', displayName: 'm0NESY', role: 'USER' as const },
  { email: 'player11@csleague.com', displayName: 'broky', role: 'USER' as const },
  { email: 'player12@csleague.com', displayName: 'karrigan', role: 'USER' as const },
  { email: 'player13@csleague.com', displayName: 'rain', role: 'USER' as const },
  { email: 'player14@csleague.com', displayName: 'frozen', role: 'USER' as const },
  { email: 'player15@csleague.com', displayName: 'ropz', role: 'USER' as const },
];

const TEAMS = [
  { name: 'FURIA Academy', tag: 'FURIA', ownerEmail: 'player1@csleague.com', members: ['player2@csleague.com', 'player3@csleague.com'] },
  { name: 'Vitality BR', tag: 'VIT', ownerEmail: 'player7@csleague.com', members: ['player8@csleague.com'] },
  { name: 'G2 Mix', tag: 'G2', ownerEmail: 'player9@csleague.com', members: ['player10@csleague.com'] },
  { name: 'FaZe Clan BR', tag: 'FAZE', ownerEmail: 'player11@csleague.com', members: ['player12@csleague.com', 'player13@csleague.com'] },
  { name: 'MOUZ Rising', tag: 'MOUZ', ownerEmail: 'player14@csleague.com', members: ['player15@csleague.com'] },
  { name: 'Imperial', tag: 'IMP', ownerEmail: 'player4@csleague.com', members: ['player5@csleague.com', 'player6@csleague.com'] },
  { name: 'CS Retakes', tag: 'RETK', ownerEmail: 'thiago@csleague.com', members: ['admin@test.com'] },
  { name: 'Liga Legends', tag: 'LEG', ownerEmail: 'player3@csleague.com', members: ['player1@csleague.com'] },
];

async function main() {
  console.log('🌱 Populando banco de dados...\n');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const userMap = new Map<string, string>();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { displayName: u.displayName, role: u.role },
      create: {
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        passwordHash,
        steamId: `76561198${String(100000000 + USERS.indexOf(u)).slice(-9)}`,
      },
    });
    userMap.set(u.email, user.id);
  }
  console.log(`✓ ${USERS.length} usuários`);

  const teamMap = new Map<string, string>();
  for (const t of TEAMS) {
    const ownerId = userMap.get(t.ownerEmail)!;
    let team = await prisma.team.findFirst({ where: { name: t.name, ownerId } });
    if (!team) {
      team = await prisma.team.create({
        data: { name: t.name, tag: t.tag, ownerId },
      });
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: ownerId } },
      update: { role: 'CAPTAIN' },
      create: { teamId: team.id, userId: ownerId, role: 'CAPTAIN' },
    });

    for (const memberEmail of t.members) {
      const userId = userMap.get(memberEmail)!;
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        update: {},
        create: { teamId: team.id, userId, role: 'MEMBER' },
      });
    }
    teamMap.set(t.tag, team.id);
  }
  console.log(`✓ ${TEAMS.length} times`);

  const ownerId = userMap.get('thiago@csleague.com')!;

  // Liga principal — 8 times, em andamento, com chaveamento
  const mainLeague = await prisma.league.findFirst({ where: { name: 'Liga CS League 2026' } })
    ?? await prisma.league.create({
      data: {
        name: 'Liga CS League 2026',
        description: 'Temporada inaugural — eliminatória simples 8 times',
        status: LeagueStatus.ONGOING,
        maxTeams: 8,
        ownerId,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-07-31'),
      },
    });

  const mainTeamTags = ['FURIA', 'VIT', 'G2', 'FAZE', 'MOUZ', 'IMP', 'RETK', 'LEG'];
  const leagueTeamRecords: { leagueId: string; teamId: string; seed: number; wins: number; losses: number; points: number }[] = [];

  const stats = [
    { wins: 3, losses: 0, points: 9 },
    { wins: 2, losses: 1, points: 6 },
    { wins: 2, losses: 1, points: 6 },
    { wins: 1, losses: 2, points: 3 },
    { wins: 1, losses: 2, points: 3 },
    { wins: 1, losses: 1, points: 3 },
    { wins: 0, losses: 2, points: 0 },
    { wins: 0, losses: 1, points: 0 },
  ];

  for (let i = 0; i < mainTeamTags.length; i++) {
    const teamId = teamMap.get(mainTeamTags[i])!;
    const s = stats[i];
    leagueTeamRecords.push({
      leagueId: mainLeague.id,
      teamId,
      seed: i + 1,
      wins: s.wins,
      losses: s.losses,
      points: s.points,
    });
  }

  for (const lt of leagueTeamRecords) {
    await prisma.leagueTeam.upsert({
      where: { leagueId_teamId: { leagueId: lt.leagueId, teamId: lt.teamId } },
      update: { seed: lt.seed, wins: lt.wins, losses: lt.losses, points: lt.points },
      create: lt,
    });
  }

  await prisma.match.deleteMany({ where: { leagueId: mainLeague.id } });

  const seedToTeamId = new Map(leagueTeamRecords.map((lt) => [lt.seed, lt.teamId]));
  const pairings = getFirstRoundPairings(8);
  const maps = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient'];

  for (let i = 0; i < pairings.length; i++) {
    const [seedA, seedB] = pairings[i];
    const team1Id = seedToTeamId.get(seedA)!;
    const team2Id = seedToTeamId.get(seedB)!;
    const completed = i < 2;

    await prisma.match.create({
      data: {
        leagueId: mainLeague.id,
        team1Id,
        team2Id,
        round: 1,
        bracketPosition: i + 1,
        map: maps[i],
        status: completed ? MatchStatus.COMPLETED : MatchStatus.SCHEDULED,
        winnerId: completed ? team1Id : null,
        playedAt: completed ? new Date() : null,
      },
    });
  }
  console.log(`✓ Liga "${mainLeague.name}" — 8 times, 4 partidas (2 finalizadas)`);

  // Liga secundária — inscrições abertas
  const cupLeague = await prisma.league.findFirst({ where: { name: 'Copa Inferno' } })
    ?? await prisma.league.create({
      data: {
        name: 'Copa Inferno',
        description: 'Torneio rápido 16 times — inscrições abertas',
        status: LeagueStatus.UPCOMING,
        maxTeams: 16,
        ownerId: userMap.get('admin@test.com')!,
        startDate: new Date('2026-07-15'),
      },
    });

  const cupTags = ['FURIA', 'VIT', 'G2', 'FAZE'];
  for (let i = 0; i < cupTags.length; i++) {
    await prisma.leagueTeam.upsert({
      where: {
        leagueId_teamId: { leagueId: cupLeague.id, teamId: teamMap.get(cupTags[i])! },
      },
      update: { seed: i + 1 },
      create: {
        leagueId: cupLeague.id,
        teamId: teamMap.get(cupTags[i])!,
        seed: i + 1,
      },
    });
  }
  console.log(`✓ Liga "${cupLeague.name}" — 4/16 times inscritos`);

  console.log('\n✅ Banco populado com sucesso!\n');
  console.log('Contas de teste (senha: 123456):');
  console.log('  admin@test.com       — Admin');
  console.log('  thiago@csleague.com  — Dono das ligas');
  console.log('  player1@csleague.com — Capitão FURIA Academy');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
