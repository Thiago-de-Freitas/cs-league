ALTER TABLE "MatchMapVeto" ADD COLUMN "vetoReopenedByAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MatchSeries" ADD COLUMN "vetoReopenedByAdmin" BOOLEAN NOT NULL DEFAULT false;
