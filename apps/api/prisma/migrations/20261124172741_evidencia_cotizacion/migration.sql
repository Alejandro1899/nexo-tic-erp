-- CreateTable
CREATE TABLE "EvidenciaCotizacion" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "subidoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "EvidenciaCotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenciaCotizacion_cotizacionId_idx" ON "EvidenciaCotizacion"("cotizacionId");

-- AddForeignKey
ALTER TABLE "EvidenciaCotizacion" ADD CONSTRAINT "EvidenciaCotizacion_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
