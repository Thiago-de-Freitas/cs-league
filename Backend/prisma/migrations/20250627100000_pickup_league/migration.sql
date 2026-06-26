-- Liga individual (formato 1x1): times efêmeros e pool de jogadores

CREATE TYPE "PickupBalanceMode" AS ENUM ('RATING', 'ADR', 'HS_PERCENT', 'POSITION_MIX');

ALTER TABLE "Team" ADD COLUMN "leagueId" TEXT;
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "League" ADD COLUMN "pickupTeamCount" INTEGER;
ALTER TABLE "League" ADD COLUMN "pickupPlayersPerTeam" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "League" ADD COLUMN "pickupBalanceMode" "PickupBalanceMode" NOT NULL DEFAULT 'RATING';
ALTER TABLE "League" ADD COLUMN "pickupBalancedAt" TIMESTAMP(3);

CREATE TABLE "LeaguePlayerEntry" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaguePlayerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaguePlayerEntry_leagueId_userId_key" ON "LeaguePlayerEntry"("leagueId", "userId");
CREATE INDEX "LeaguePlayerEntry_leagueId_idx" ON "LeaguePlayerEntry"("leagueId");
CREATE INDEX "LeaguePlayerEntry_teamId_idx" ON "LeaguePlayerEntry"("teamId");

ALTER TABLE "LeaguePlayerEntry" ADD CONSTRAINT "LeaguePlayerEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaguePlayerEntry" ADD CONSTRAINT "LeaguePlayerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaguePlayerEntry" ADD CONSTRAINT "LeaguePlayerEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
