-- CreateEnum
CREATE TYPE "GameTitle" AS ENUM ('CS2', 'VALORANT', 'LOL', 'PUBG');

-- AlterEnum
ALTER TYPE "LeagueFormat" ADD VALUE 'POINTS_RACE';

-- AlterEnum
ALTER TYPE "SeriesFormat" ADD VALUE 'BO5';

-- AlterEnum
ALTER TYPE "GameSide" ADD VALUE 'ATTACK';
ALTER TYPE "GameSide" ADD VALUE 'DEFENDER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "riotId" TEXT;

-- CreateTable
CREATE TABLE "UserGameAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "GameTitle" NOT NULL,
    "externalId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "League" ADD COLUMN "game" "GameTitle" NOT NULL DEFAULT 'CS2';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "riotMatchId" TEXT;
ALTER TABLE "Match" ADD COLUMN "pubgMatchId" TEXT;
ALTER TABLE "Match" ADD COLUMN "placement" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "UserGameAccount_userId_game_key" ON "UserGameAccount"("userId", "game");

-- CreateIndex
CREATE INDEX "UserGameAccount_game_externalId_idx" ON "UserGameAccount"("game", "externalId");

-- AddForeignKey
ALTER TABLE "UserGameAccount" ADD CONSTRAINT "UserGameAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
