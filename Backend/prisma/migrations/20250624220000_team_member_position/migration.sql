-- CreateEnum
CREATE TYPE "PlayerPosition" AS ENUM ('AWP', 'RIFLER', 'ENTRY', 'LURKER', 'IGL', 'SUPPORT', 'FLEX');

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN "position" "PlayerPosition";

-- Migra tags livres comuns para posição estruturada
UPDATE "TeamMember" SET "position" = 'AWP' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('AWP', 'AWPER', 'SNIPER');
UPDATE "TeamMember" SET "position" = 'RIFLER' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('RIFLER', 'RIFLE', 'RIFLEIRO');
UPDATE "TeamMember" SET "position" = 'ENTRY' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('ENTRY', 'ENTRY FRAGGER', 'OPENER');
UPDATE "TeamMember" SET "position" = 'LURKER' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('LURKER', 'LURK', 'LURKING');
UPDATE "TeamMember" SET "position" = 'IGL' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('IGL', 'CAPTAIN', 'CAPITAO', 'CAPITÃO');
UPDATE "TeamMember" SET "position" = 'SUPPORT' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('SUPPORT', 'SUPORTE', 'UTIL');
UPDATE "TeamMember" SET "position" = 'FLEX' WHERE "position" IS NULL AND UPPER(TRIM("memberTag")) IN ('FLEX', 'FLEXO');
