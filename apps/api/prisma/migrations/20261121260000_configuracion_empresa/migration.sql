-- Configuración de la empresa: una sola fila con los datos del formato de cotización.
-- CreateTable
CREATE TABLE "ConfiguracionEmpresa" (
    "id" TEXT NOT NULL DEFAULT 'empresa',
    "nombreComercial" TEXT NOT NULL,
    "razonSocial" TEXT,
    "rfc" TEXT,
    "regimenFiscal" TEXT,
    "codigoPostal" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "sitioWeb" TEXT,
    "logoPng" BYTEA,
    "condicionesCotizacion" TEXT NOT NULL,
    "vigenciaDiasDefault" INTEGER NOT NULL DEFAULT 15,
    "prefijoFolioCotizacion" TEXT NOT NULL DEFAULT 'COT',
    "actualizadoPorId" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionEmpresa_pkey" PRIMARY KEY ("id")
);


INSERT INTO "ConfiguracionEmpresa" ("id", "nombreComercial", "correo", "telefono", "sitioWeb", "condicionesCotizacion", "vigenciaDiasDefault", "prefijoFolioCotizacion", "actualizadoEn")
VALUES (
    'empresa',
    'Nexo TIC',
    'contacto@nexotic.com.mx',
    '+52 55 6039 2959',
    'nexotic.com.mx',
    '1. Esta cotización tiene una vigencia de 15 días naturales a partir de su fecha de emisión.
2. Los precios están expresados en pesos mexicanos (MXN). El IVA se calcula sobre el subtotal con descuento.
3. Los plazos dependen de que el cliente entregue accesos, información y respuestas en el tiempo acordado.
4. Los cambios de alcance se cotizan por separado y se aprueban por escrito antes de ejecutarse.
5. La cotización no constituye contrato hasta que sea aceptada y firmada por ambas partes.',
    15,
    'COT',
    CURRENT_TIMESTAMP
);
