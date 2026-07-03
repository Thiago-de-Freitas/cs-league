-- Ranking global estilo Faceit: pontos persistidos por jogador + ledger por demo
ALTER TABLE "User" ADD COLUMN "rankPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerRatingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "demoId" TEXT NOT NULL,
    "steamId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRatingEvent_userId_idx" ON "PlayerRatingEvent"("userId");

-- CreateIndex
CREATE INDEX "PlayerRatingEvent_demoId_idx" ON "PlayerRatingEvent"("demoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRatingEvent_userId_demoId_key" ON "PlayerRatingEvent"("userId", "demoId");

-- AddForeignKey
ALTER TABLE "PlayerRatingEvent" ADD CONSTRAINT "PlayerRatingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRatingEvent" ADD CONSTRAINT "PlayerRatingEvent_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
