import { publicUploadUrlForResponse } from '../lib/uploadAssets';

export type UserSearchResult = {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  position: string | null;
  avatarUrl: string | null;
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
