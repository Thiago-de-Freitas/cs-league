-- CreateEnum
CREATE TYPE "LeagueFormat" AS ENUM ('SINGLE_ELIMINATION', 'GROUP_STAGE');

-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('GROUP', 'PLAYOFF');

-- AlterTable
ALTER TABLE "League" ADD COLUMN "format" "LeagueFormat" NOT NULL DEFAULT 'SINGLE_ELIMINATION';
ALTER TABLE "League" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "League" ADD COLUMN "advancePerGroup" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "LeagueTeam" ADD COLUMN "groupId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "phase" "MatchPhase" NOT NULL DEFAULT 'PLAYOFF';
ALTER TABLE "Match" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Match" ADD COLUMN "groupRound" INTEGER;

-- CreateTable
CREATE TABLE "LeagueGroup" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LeagueGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueGroup_leagueId_idx" ON "LeagueGroup"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueGroup_leagueId_name_key" ON "LeagueGroup"("leagueId", "name");

-- AddForeignKey
ALTER TABLE "LeagueTeam" ADD CONSTRAINT "LeagueTeam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
