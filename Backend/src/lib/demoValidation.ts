import { prisma } from './prisma';
import { checkLeagueManagerMatchDataAccess } from './matchPermissions';

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
  _role?: string
): Promise<PersonalDemoValidation> {
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

  return { valid: true };
}

export async function validateGeneralDemoUpload(matchId: string): Promise<PersonalDemoValidation> {
  const existing = await prisma.demo.findFirst({
    where: {
      matchId,
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
    select: { id: true, isManual: true },
  });

  if (existing) {
    return {
      valid: false,
      error: existing.isManual
        ? 'Já existem estatísticas manuais para esta partida. Edite-as em vez de enviar uma demo.'
        : 'Já existe uma demo geral associada a esta partida.',
      code: 'MATCH_HAS_DEMO',
    };
  }

  return { valid: true };
}

export async function canUserViewDemo(
  userId: string,
  role: string,
  demo: { uploadedById: string; isPersonal: boolean; matchId: string | null }
): Promise<{ allowed: boolean; error?: string }> {
  if (role === 'ADMIN' || demo.uploadedById === userId) {
    return { allowed: true };
  }

  if (demo.isPersonal) {
    return { allowed: false, error: 'Sem permissão para visualizar esta demo.' };
  }

  if (!demo.matchId) {
    return { allowed: false, error: 'Sem permissão para visualizar esta demo.' };
  }

  const match = await prisma.match.findUnique({
    where: { id: demo.matchId },
    include: { league: { select: { ownerId: true } } },
  });

  if (!match) {
    return { allowed: false, error: 'Partida não encontrada.' };
  }

  if (match.league.ownerId === userId) {
    return { allowed: true };
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: { in: [match.team1Id, match.team2Id] },
    },
  });

  if (membership) {
    return { allowed: true };
  }

  return { allowed: false, error: 'Sem permissão para visualizar esta demo.' };
}

export async function canUserManageMatchDemo(
  userId: string,
  role: string,
  matchId: string
): Promise<{ allowed: boolean; error?: string }> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { league: { select: { ownerId: true, status: true } } },
  });

  if (!match) {
    return { allowed: false, error: 'Partida não encontrada.' };
  }

  if (match.league.status === 'ARCHIVED') {
    return { allowed: false, error: 'Liga arquivada. Não é possível enviar demos nesta partida.' };
  }

  if (!checkLeagueManagerMatchDataAccess(userId, role, match)) {
    return {
      allowed: false,
      error: 'Somente o gerente da liga pode enviar ou associar demos nesta partida.',
    };
  }

  return { allowed: true };
}

export async function canUserDeleteDemoHighlights(
  userId: string,
  role: string,
  demo: { uploadedById: string; isPersonal: boolean; matchId: string | null }
): Promise<{ allowed: boolean; error?: string }> {
  if (role === 'ADMIN' || demo.uploadedById === userId) {
    return { allowed: true };
  }

  if (!demo.isPersonal && demo.matchId) {
    const match = await prisma.match.findUnique({
      where: { id: demo.matchId },
      include: { league: { select: { ownerId: true } } },
    });
    if (match?.league.ownerId === userId) {
      return { allowed: true };
    }
  }

  return { allowed: false, error: 'Sem permissão para excluir destaques desta demo.' };
}
