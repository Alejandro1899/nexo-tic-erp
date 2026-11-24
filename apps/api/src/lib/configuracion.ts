/** Acceso a la fila única de configuración de la empresa. Si no existe, la crea con valores por defecto. */
import { prisma } from "./db.js";

/** Valores de respaldo si la fila de configuración no existe. Coinciden con la migración inicial. */
const POR_DEFECTO = {
  nombreComercial: "Nexo TIC",
  correo: "contacto@nexotic.com.mx",
  telefono: "+52 55 6039 2959",
  sitioWeb: "nexotic.com.mx",
  condicionesCotizacion: "",
  vigenciaDiasDefault: 15,
  prefijoFolioCotizacion: "COT",
};

/** Datos de la empresa. Siempre devuelve una fila (la crea con valores por defecto si falta). */
export async function obtenerConfiguracion() {
  const existente = await prisma.configuracionEmpresa.findUnique({ where: { id: "empresa" } });
  if (existente) return existente;
  return prisma.configuracionEmpresa.create({ data: { id: "empresa", ...POR_DEFECTO } });
}

/** Vista pública de la configuración: sin los bytes del logo, solo si existe. */
export function vistaConfiguracion(c: Awaited<ReturnType<typeof obtenerConfiguracion>>) {
  const { logoPng, ...resto } = c;
  return { ...resto, tieneLogo: logoPng !== null };
}
