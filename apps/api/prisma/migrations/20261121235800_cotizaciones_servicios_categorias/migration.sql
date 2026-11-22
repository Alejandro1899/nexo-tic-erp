-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "Servicio" ADD COLUMN     "categoriaId" TEXT;

-- CreateTable
CREATE TABLE "CategoriaServicio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "eliminadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteServicio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "tarifaCentavos" INTEGER,
    "creadoPorId" TEXT,
    "eliminadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "vigenciaHasta" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "descuentoCentavos" INTEGER NOT NULL DEFAULT 0,
    "ivaCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT,
    "enviadaEn" TIMESTAMP(3),
    "autorizadaPorId" TEXT,
    "autorizadaEn" TIMESTAMP(3),
    "eliminadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionPartida" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "servicioId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidadMilesimas" INTEGER NOT NULL,
    "precioUnitarioCentavos" INTEGER NOT NULL,
    "descuentoPb" INTEGER NOT NULL DEFAULT 0,
    "importeCentavos" INTEGER NOT NULL,
    "descuentoCentavos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CotizacionPartida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consecutivo" (
    "tipo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("tipo","anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaServicio_nombre_key" ON "CategoriaServicio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteServicio_clienteId_servicioId_key" ON "ClienteServicio"("clienteId", "servicioId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_folio_key" ON "Cotizacion"("folio");

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaServicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteServicio" ADD CONSTRAINT "ClienteServicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteServicio" ADD CONSTRAINT "ClienteServicio_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionPartida" ADD CONSTRAINT "CotizacionPartida_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionPartida" ADD CONSTRAINT "CotizacionPartida_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
