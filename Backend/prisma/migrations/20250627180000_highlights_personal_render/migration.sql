-- CreateEnum
CREATE TYPE "HighlightClipRenderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "MatchHighlight" ADD COLUMN "clipRenderStatus" "HighlightClipRenderStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "clipVideoPath" TEXT,
ADD COLUMN "clipRenderError" TEXT;

-- CreateTable
CREATE TABLE "DemoHighlight" (
    "id" TEXT NOT NULL,
    "demoId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "tick" INTEGER,
    "steamId" TEXT,
    "playerName" TEXT NOT NULL,
    "type" "HighlightType" NOT NULL,
    "description" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clipStartTick" INTEGER,
    "clipEndTick" INTEGER,
    "clipRenderStatus" "HighlightClipRenderStatus" NOT NULL DEFAULT 'PENDING',
    "clipVideoPath" TEXT,
    "clipRenderError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoHighlight_demoId_idx" ON "DemoHighlight"("demoId");

-- AddForeignKey
ALTER TABLE "DemoHighlight" ADD CONSTRAINT "DemoHighlight_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
