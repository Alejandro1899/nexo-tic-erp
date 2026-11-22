-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "anticipoPb" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CotizacionPartida" ADD COLUMN     "costoUnitarioCentavos" INTEGER;
