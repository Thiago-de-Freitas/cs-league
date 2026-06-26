-- Posição do jogador passa a ser atributo do usuário (perfil), não do roster.

ALTER TABLE "User" ADD COLUMN "position" "PlayerPosition";

UPDATE "User" u
SET "position" = sub."position"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "position"
  FROM "TeamMember"
  WHERE "position" IS NOT NULL
  ORDER BY "userId", "id"
) sub
WHERE u.id = sub."userId";

ALTER TABLE "TeamMember" DROP COLUMN "position";
