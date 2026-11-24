-- CreateTable
CREATE TABLE "RegistroActividad" (
    "id" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "resumen" TEXT NOT NULL,
    "cambios" JSONB,

    CONSTRAINT "RegistroActividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroActividad_creadoEn_idx" ON "RegistroActividad"("creadoEn");

-- CreateIndex
CREATE INDEX "RegistroActividad_usuarioId_idx" ON "RegistroActividad"("usuarioId");

-- CreateIndex
CREATE INDEX "RegistroActividad_entidad_entidadId_idx" ON "RegistroActividad"("entidad", "entidadId");
