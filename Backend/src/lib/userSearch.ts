import { publicUploadUrlForResponse } from '../lib/uploadAssets';
import { getPlayerPositionLabel } from './playerPosition';
import { isParticipationBanned } from './userModeration';

export type UserSearchResult = {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  position: string | null;
  avatarUrl: string | null;
};

export type AdminUserEntry = {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  position: string | null;
  positionLabel: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  bannedUntil: string | null;
  isBanned: boolean;
  createdAt: string;
  teamCount: number;
};

export function formatUserSearchResults(
  users: {
    id: string;
    email: string;
    displayName: string;
    steamId: string | null;
    position: string | null;
    avatarUrl: string | null;
  }[]
): UserSearchResult[] {
  return users.map((user) => ({
    ...user,
    avatarUrl: publicUploadUrlForResponse(user.avatarUrl),
    position: user.position?.toLowerCase() ?? null,
  }));
}

export function formatAdminUserEntries(
  users: {
    id: string;
    email: string;
    displayName: string;
    steamId: string | null;
    position: string | null;
    avatarUrl: string | null;
    role: string;
    isActive: boolean;
    bannedUntil: Date | null;
    createdAt: Date;
    _count: { memberships: number };
  }[]
): AdminUserEntry[] {
  return users.map((user) => {
    const position = user.position?.toLowerCase() ?? null;
    const moderation = { isActive: user.isActive, bannedUntil: user.bannedUntil };
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      steamId: user.steamId,
      position,
      positionLabel: user.position ? getPlayerPositionLabel(user.position) : null,
      avatarUrl: publicUploadUrlForResponse(user.avatarUrl),
      role: user.role,
      isActive: user.isActive,
      bannedUntil: user.bannedUntil?.toISOString() ?? null,
      isBanned: isParticipationBanned(moderation),
      createdAt: user.createdAt.toISOString(),
      teamCount: user._count.memberships,
    };
  });
}
