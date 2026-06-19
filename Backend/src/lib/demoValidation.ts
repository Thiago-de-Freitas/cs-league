import { prisma } from './prisma';

export type PersonalDemoValidation =
  | { valid: true }
  | { valid: false; error: string; code: 'NO_STEAM_ID' | 'NOT_IN_MATCH' | 'MATCH_HAS_DEMO' | 'MATCH_NOT_FOUND' | 'MATCH_REQUIRED' | 'USER_HAS_DEMO' | 'DUPLICATE_DEMO' };

const ACTIVE_DEMO_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED'] as const;

/** Impede reenvio do mesmo arquivo .dem (nome do CS2 identifica a partida). */
export async function validateDuplicateDemoUpload(
  userId: string,
  fileName: string
): Promise<PersonalDemoValidation> {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) {
    return { valid: true };
  }

  const existing = await prisma.demo.findFirst({
    where: {
      uploadedById: userId,
      fileName: { equals: fileName.trim(), mode: 'insensitive' },
      status: { in: [...ACTIVE_DEMO_STATUSES] },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    const statusMsg =
      existing.status === 'COMPLETED'
        ? 'Este arquivo de demo já foi enviado e processado.'
        : 'Este arquivo de demo já está na fila de processamento.';
    return { valid: false, error: statusMsg, code: 'DUPLICATE_DEMO' };
  }

  return { valid: true };
}

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

  const ownPersonalDemo = await prisma.demo.findFirst({
    where: {
      matchId,
      uploadedById: userId,
      isPersonal: true,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
  });

  if (ownPersonalDemo) {
    return {
      valid: false,
      error: 'Você já enviou uma demo pessoal para esta partida.',
      code: 'USER_HAS_DEMO',
    };
  }

  const generalDemo = await prisma.demo.findFirst({
    where: {
      matchId,
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
  });

  if (generalDemo) {
    return {
      valid: false,
      error: 'Já existe uma demo geral enviada para esta partida.',
      code: 'MATCH_HAS_DEMO',
    };
  }

  return { valid: true };
}

export async function validateGeneralDemoUpload(matchId: string): Promise<PersonalDemoValidation> {
  const existing = await prisma.demo.findFirst({
    where: {
      matchId,
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
  });

  if (existing) {
    return {
      valid: false,
      error: 'Já existe uma demo geral associada a esta partida.',
      code: 'MATCH_HAS_DEMO',
    };
  }

  return { valid: true };
}
