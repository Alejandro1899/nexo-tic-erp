-- Folio de cliente (CLI-0001). Se agrega como opcional, se llena a los clientes existentes
-- en orden de creación y después se vuelve obligatorio.
ALTER TABLE "Cliente" ADD COLUMN "folio" TEXT;

UPDATE "Cliente" AS c
SET "folio" = 'CLI-' || lpad(t.rn::text, 4, '0')
FROM (
    SELECT "id", row_number() OVER (ORDER BY "creadoEn", "id") AS rn FROM "Cliente"
) AS t
WHERE c."id" = t."id";

-- El siguiente folio continúa después del último asignado (año 0 = consecutivo global de clientes).
INSERT INTO "Consecutivo" ("tipo", "anio", "valor")
SELECT 'CLI', 0, COUNT(*) FROM "Cliente"
ON CONFLICT ("tipo", "anio") DO UPDATE SET "valor" = EXCLUDED."valor";

ALTER TABLE "Cliente" ALTER COLUMN "folio" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_folio_key" ON "Cliente"("folio");

-- CreateTable
CREATE TABLE "Contacto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT,
    "eliminadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contacto_clienteId_idx" ON "Contacto"("clienteId");

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
