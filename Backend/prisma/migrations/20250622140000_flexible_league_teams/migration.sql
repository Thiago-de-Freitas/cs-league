-- Limite de vagas opcional + tamanho real do chaveamento após gerar bracket
ALTER TABLE "League" ALTER COLUMN "maxTeams" DROP NOT NULL;
ALTER TABLE "League" ALTER COLUMN "maxTeams" DROP DEFAULT;
ALTER TABLE "League" ADD COLUMN "bracketSize" INTEGER;

-- Ligas que já têm chaveamento: bracketSize = maxTeams usado anteriormente
UPDATE "League" l
SET "bracketSize" = l."maxTeams"
WHERE l."maxTeams" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Match" m
    WHERE m."leagueId" = l."id" AND m."round" > 0
  );
