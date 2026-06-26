-- CreateEnum
CREATE TYPE "SeriesFormat" AS ENUM ('BO1', 'BO3');

-- CreateEnum
CREATE TYPE "SeriesVetoStatus" AS ENUM ('BAN_PHASE', 'PICK_PHASE', 'MAPS_ASSIGNED', 'COMPLETED');

-- AlterTable
ALTER TABLE "League" ADD COLUMN "seriesFormat" "SeriesFormat" NOT NULL DEFAULT 'BO1';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "seriesId" TEXT,
ADD COLUMN "seriesGameNumber" INTEGER;

-- AlterTable
ALTER TABLE "MatchHighlight" ADD COLUMN "clipStartTick" INTEGER,
ADD COLUMN "clipEndTick" INTEGER;

-- CreateTable
CREATE TABLE "MatchSeries" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "team1Id" TEXT NOT NULL,
    "team2Id" TEXT NOT NULL,
    "format" "SeriesFormat" NOT NULL DEFAULT 'BO1',
    "team1MapWins" INTEGER NOT NULL DEFAULT 0,
    "team2MapWins" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "mapPool" JSONB NOT NULL,
    "bannedMaps" JSONB NOT NULL DEFAULT '[]',
    "pickedMaps" JSONB NOT NULL DEFAULT '[]',
    "firstActionTeamId" TEXT NOT NULL,
    "vetoTurnTeamId" TEXT,
    "vetoStatus" "SeriesVetoStatus" NOT NULL DEFAULT 'BAN_PHASE',
    "activeGameNumber" INTEGER NOT NULL DEFAULT 1,
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_seriesId_idx" ON "Match"("seriesId");

-- CreateIndex
CREATE INDEX "MatchSeries_leagueId_idx" ON "MatchSeries"("leagueId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MatchSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSeries" ADD CONSTRAINT "MatchSeries_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
