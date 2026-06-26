import { prisma } from './prisma';
import { getPlayerPositionLabel } from './playerPosition';
import { getPlayerProfileBySteamId, type PlayerProfileStats } from './rankings';
import { publicUploadUrlForResponse } from './uploadAssets';
import { isAdmin } from './permissions';
import { getPersonalStatsForUser, type SerializedPersonalStatsOverview } from './personalStats';

export function canViewInactiveUserProfile(
  isActive: boolean,
  isSelf: boolean,
  viewerIsAdmin: boolean
): boolean {
  if (isActive) return true;
  return isSelf || viewerIsAdmin;
}

export function shouldExposeProfileEmail(isSelf: boolean, viewerIsAdmin: boolean): boolean {
  return isSelf || viewerIsAdmin;
}

export type PublicUserTeam = {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  role: string;
};

export type PublicUserProfile = {
  id: string;
  displayName: string;
  email?: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: string | null;
  positionLabel: string | null;
  role: string;
  createdAt: string;
  teamCount: number;
  teams: PublicUserTeam[];
  leagueStats: PlayerProfileStats | null;
  personalStats: SerializedPersonalStatsOverview | null;
  isSelf: boolean;
};

export async function getPublicUserProfile(
  userId: string,
  viewer: { userId: string; role: string }
): Promise<PublicUserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      steamId: true,
      avatarUrl: true,
      position: true,
      role: true,
      isActive: true,
      createdAt: true,
      memberships: {
        include: {
          team: {
            select: { id: true, name: true, tag: true, logoUrl: true },
          },
        },
        orderBy: { team: { name: 'asc' } },
      },
    },
  });

  if (!user) return null;

  const isSelf = viewer.userId === user.id;
  const viewerIsAdmin = isAdmin(viewer);

  if (!canViewInactiveUserProfile(user.isActive, isSelf, viewerIsAdmin)) {
    return null;
  }

  const [leagueStats, personalStats] = await Promise.all([
    user.steamId?.trim() ? getPlayerProfileBySteamId(user.steamId) : Promise.resolve(null),
    getPersonalStatsForUser(user.id),
  ]);

  const position = user.position?.toLowerCase() ?? null;

  const profile: PublicUserProfile = {
    id: user.id,
    displayName: user.displayName,
    steamId: user.steamId,
    avatarUrl: publicUploadUrlForResponse(user.avatarUrl),
    position,
    positionLabel: user.position ? getPlayerPositionLabel(user.position) : null,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    teamCount: user.memberships.length,
    teams: user.memberships.map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      tag: membership.team.tag,
      logoUrl: publicUploadUrlForResponse(membership.team.logoUrl),
      role: membership.role,
    })),
    leagueStats,
    personalStats,
    isSelf,
  };

  if (shouldExposeProfileEmail(isSelf, viewerIsAdmin)) {
    profile.email = user.email;
  }

  return profile;
}

export async function findUserIdBySteamId(steamId: string): Promise<string | null> {
  const normalized = steamId.trim();
  if (!normalized) return null;
  const user = await prisma.user.findFirst({
    where: { steamId: normalized, isActive: true },
    select: { id: true },
  });
  return user?.id ?? null;
}
