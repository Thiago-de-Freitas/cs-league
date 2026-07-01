-- Verificação de e-mail por código de 6 dígitos
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Contas existentes permanecem utilizáveis sem revalidação
UPDATE "User" SET "emailVerified" = true, "emailVerifiedAt" = COALESCE("createdAt", NOW()) WHERE "emailVerified" = false;
