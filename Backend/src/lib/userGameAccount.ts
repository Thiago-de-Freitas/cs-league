import { GameTitle, Prisma } from '@prisma/client';
import { prisma } from './prisma';

const RIOT_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s.-]{2,15}#[\p{L}\p{N}]{3,5}$/u;

export function isValidRiotId(value: string): boolean {
  return RIOT_ID_PATTERN.test(value.trim());
}

export function parseRiotId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  return isValidRiotId(trimmed) ? trimmed : null;
}

export async function upsertUserGameAccount(
  userId: string,
  game: GameTitle,
  externalId: string,
  metadata?: Record<string, unknown>
) {
  return prisma.userGameAccount.upsert({
    where: { userId_game: { userId, game } },
    create: { userId, game, externalId, metadata: metadata as Prisma.InputJsonValue | undefined },
    update: { externalId, metadata: metadata as Prisma.InputJsonValue | undefined },
  });
}

export async function getUserGameExternalId(
  userId: string,
  game: GameTitle
): Promise<string | null> {
  const row = await prisma.userGameAccount.findUnique({
    where: { userId_game: { userId, game } },
    select: { externalId: true },
  });
  return row?.externalId ?? null;
}

export async function syncRiotIdToUser(userId: string, riotId: string | null) {
  await prisma.user.update({
    where: { id: userId },
    data: { riotId },
  });
  if (riotId) {
    await upsertUserGameAccount(userId, 'VALORANT', riotId);
    await upsertUserGameAccount(userId, 'LOL', riotId);
  }
}
