-- Demos pessoais ficam exclusivamente no perfil, sem vínculo com partidas
UPDATE "Demo" SET "matchId" = NULL WHERE "isPersonal" = true AND "matchId" IS NOT NULL;
