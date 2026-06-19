import { prisma } from './prisma';

export type PersonalDemoValidation =
  | { valid: true }
  | { valid: false; error: string; code: 'NO_STEAM_ID' | 'NOT_IN_MATCH' | 'MATCH_HAS_DEMO' | 'MATCH_NOT_FOUND' | 'MATCH_REQUIRED' };

export async function validatePersonalDemoUpload(
  userId: string,
  matchId: string
): Promise<PersonalDemoValidation> {
  if (!matchId) {
    return { valid: false, error: 'Selecione uma partida para enviar a demo pessoal.', code: 'MATCH_REQUIRED' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { steamId: true },
  });

  if (!user?.steamId?.trim()) {
    return {
      valid: false,
      error: 'Configure seu Steam ID no perfil antes de enviar uma demo pessoal.',
      code: 'NO_STEAM_ID',
    };
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, team1Id: true, team2Id: true },
  });

  if (!match) {
    return { valid: false, error: 'Partida não encontrada.', code: 'MATCH_NOT_FOUND' };
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: { in: [match.team1Id, match.team2Id] },
    },
  });

  if (!membership) {
    return {
      valid: false,
      error: 'Você não faz parte desta partida. Só é possível enviar demo pessoal de jogos em que você participou.',
      code: 'NOT_IN_MATCH',
    };
  }

  const existingDemo = await prisma.demo.findFirst({
    where: {
      matchId,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
    select: { id: true, uploadedById: true },
  });

  if (existingDemo) {
    const sameUser = existingDemo.uploadedById === userId;
    return {
      valid: false,
      error: sameUser
        ? 'Você já enviou uma demo para esta partida.'
        : 'Já existe uma demo enviada para esta partida.',
      code: 'MATCH_HAS_DEMO',
    };
  }

  return { valid: true };
}
