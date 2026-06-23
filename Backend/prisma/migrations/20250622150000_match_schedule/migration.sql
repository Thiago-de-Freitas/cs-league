-- AlterTable
ALTER TABLE "League" ADD COLUMN "defaultMatchDays" JSONB,
ADD COLUMN "defaultMatchTime" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN "scheduleTimezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeagueScheduleWeek" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "daysOfWeek" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueScheduleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueScheduleWeek_leagueId_idx" ON "LeagueScheduleWeek"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueScheduleWeek_leagueId_weekStart_key" ON "LeagueScheduleWeek"("leagueId", "weekStart");

-- AddForeignKey
ALTER TABLE "LeagueScheduleWeek" ADD CONSTRAINT "LeagueScheduleWeek_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
