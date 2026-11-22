-- Usuario de acceso (username), super administrador, último acceso y borrado lógico.
-- Los usuarios existentes reciben como usuario de acceso la parte local de su correo, en minúsculas.

ALTER TABLE "Usuario" ADD COLUMN "username" TEXT;
UPDATE "Usuario" SET "username" = lower(split_part("email", '@', 1)) WHERE "username" IS NULL;
ALTER TABLE "Usuario" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

ALTER TABLE "Usuario"
  ADD COLUMN "esSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ultimoAcceso" TIMESTAMP(3),
  ADD COLUMN "eliminadoEn" TIMESTAMP(3);

ALTER TABLE "Cliente" ADD COLUMN "eliminadoEn" TIMESTAMP(3);
ALTER TABLE "Servicio" ADD COLUMN "eliminadoEn" TIMESTAMP(3);
