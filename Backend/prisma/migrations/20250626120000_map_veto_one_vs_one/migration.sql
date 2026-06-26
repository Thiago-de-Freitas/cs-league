-- CreateEnum
CREATE TYPE "GameSide" AS ENUM ('CT', 'T');

-- CreateEnum
CREATE TYPE "MapVetoStatus" AS ENUM ('BAN_PHASE', 'MAP_DECIDED', 'SIDE_PHASE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HighlightType" AS ENUM ('MULTI_KILL', 'ACE', 'CLUTCH', 'OPENING_KILL');

-- AlterEnum
ALTER TYPE "LeagueFormat" ADD VALUE 'ONE_VS_ONE';

-- AlterTable
ALTER TABLE "League" ADD COLUMN "mapPool" JSONB,
ADD COLUMN "mapVetoEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "team1StartingSide" "GameSide",
ADD COLUMN "team2StartingSide" "GameSide";

-- CreateTable
CREATE TABLE "MatchMapVeto" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "mapPool" JSONB NOT NULL,
    "bannedMaps" JSONB NOT NULL DEFAULT '[]',
    "firstBanTeamId" TEXT NOT NULL,
    "vetoTurnTeamId" TEXT,
    "sidePickTeamId" TEXT,
    "status" "MapVetoStatus" NOT NULL DEFAULT 'BAN_PHASE',
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchMapVeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLineup" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MatchLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchImage" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchHighlight" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "demoId" TEXT,
    "round" INTEGER NOT NULL,
    "tick" INTEGER,
    "steamId" TEXT,
    "playerName" TEXT NOT NULL,
    "type" "HighlightType" NOT NULL,
    "description" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchMapVeto_matchId_key" ON "MatchMapVeto"("matchId");

-- CreateIndex
CREATE INDEX "MatchLineup_matchId_idx" ON "MatchLineup"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_teamId_key" ON "MatchLineup"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "MatchImage_matchId_idx" ON "MatchImage"("matchId");

-- CreateIndex
CREATE INDEX "MatchHighlight_matchId_idx" ON "MatchHighlight"("matchId");

-- AddForeignKey
ALTER TABLE "MatchMapVeto" ADD CONSTRAINT "MatchMapVeto_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchImage" ADD CONSTRAINT "MatchImage_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchHighlight" ADD CONSTRAINT "MatchHighlight_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
