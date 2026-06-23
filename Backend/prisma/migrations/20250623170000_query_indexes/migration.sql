-- CreateIndex
CREATE INDEX "Match_leagueId_idx" ON "Match"("leagueId");

-- CreateIndex
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

-- CreateIndex
CREATE INDEX "Match_leagueId_phase_idx" ON "Match"("leagueId", "phase");

-- CreateIndex
CREATE INDEX "Demo_matchId_idx" ON "Demo"("matchId");

-- CreateIndex
CREATE INDEX "Demo_uploadedById_isPersonal_idx" ON "Demo"("uploadedById", "isPersonal");

-- CreateIndex
CREATE INDEX "Demo_status_isPersonal_idx" ON "Demo"("status", "isPersonal");
