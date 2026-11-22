/**
 * Módulo único de cálculo de montos.
 * Reglas:
 *  - Todo dinero se maneja en centavos enteros (Centavos). Nunca floats.
 *  - Las tasas se expresan en puntos básicos (1 pb = 0.01%). IVA 16% = 1600 pb.
 *  - El redondeo es "mitad hacia arriba" y se define SOLO aquí.
 * Frontend y backend importan este módulo; ninguno calcula totales por su cuenta.
 */

export type Centavos = number;

/** Cantidades en milésimas (2.5 horas = 2500). Evita decimales flotantes. */
export type CantidadMilesimas = number;

/** Tasa de IVA general vigente en México: 16%. Cambiar aquí si la ley cambia. */
export const TASA_IVA_PB = 1600;

const BASE_PB = 10_000;

function assertEntero(valor: number, nombre: string): void {
  if (!Number.isSafeInteger(valor)) {
    throw new RangeError(`${nombre} debe ser un entero seguro, recibido: ${valor}`);
  }
}

/** Aplica una tasa en puntos básicos a un monto en centavos, redondeando mitad hacia arriba. */
export function aplicarTasaPb(montoCentavos: Centavos, tasaPb: number): Centavos {
  assertEntero(montoCentavos, "montoCentavos");
  assertEntero(tasaPb, "tasaPb");
  if (montoCentavos < 0) throw new RangeError("El monto no puede ser negativo");
  if (tasaPb < 0 || tasaPb > BASE_PB) throw new RangeError("La tasa debe estar entre 0 y 10000 pb");
  return Math.floor((montoCentavos * tasaPb + BASE_PB / 2) / BASE_PB);
}

/** Importe de una línea: precio unitario (centavos) × cantidad (milésimas), redondeado. */
export function importeLinea(precioUnitarioCentavos: Centavos, cantidadMilesimas: CantidadMilesimas): Centavos {
  assertEntero(precioUnitarioCentavos, "precioUnitarioCentavos");
  assertEntero(cantidadMilesimas, "cantidadMilesimas");
  if (precioUnitarioCentavos < 0 || cantidadMilesimas < 0) {
    throw new RangeError("Precio y cantidad no pueden ser negativos");
  }
  return Math.floor((precioUnitarioCentavos * cantidadMilesimas + 500) / 1000);
}

export interface LineaCotizacion {
  precioUnitarioCentavos: Centavos;
  cantidadMilesimas: CantidadMilesimas;
  /** Descuento de la línea en puntos básicos. Opcional. */
  descuentoPb?: number;
}

export interface TotalesCotizacion {
  subtotalCentavos: Centavos;
  descuentoCentavos: Centavos;
  baseGravableCentavos: Centavos;
  ivaCentavos: Centavos;
  totalCentavos: Centavos;
}

/**
 * Calcula totales de una cotización.
 * Orden: importe de cada línea -> descuento por línea -> base gravable -> IVA -> total.
 */
export function calcularTotales(lineas: LineaCotizacion[], tasaIvaPb: number = TASA_IVA_PB): TotalesCotizacion {
  let subtotal = 0;
  let descuento = 0;

  for (const linea of lineas) {
    const importe = importeLinea(linea.precioUnitarioCentavos, linea.cantidadMilesimas);
    const descuentoLinea = aplicarTasaPb(importe, linea.descuentoPb ?? 0);
    subtotal += importe;
    descuento += descuentoLinea;
  }

  const baseGravable = subtotal - descuento;
  const iva = aplicarTasaPb(baseGravable, tasaIvaPb);

  return {
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    baseGravableCentavos: baseGravable,
    ivaCentavos: iva,
    totalCentavos: baseGravable + iva,
  };
}

/**
 * Anticipo de una cotización: porcentaje (en pb) sobre el total con IVA.
 * El saldo es lo que resta, así que anticipo + saldo siempre suman el total.
 */
export function calcularAnticipo(totalCentavos: Centavos, anticipoPb: number): { anticipoCentavos: Centavos; saldoCentavos: Centavos } {
  const anticipo = aplicarTasaPb(totalCentavos, anticipoPb);
  return { anticipoCentavos: anticipo, saldoCentavos: totalCentavos - anticipo };
}

/** Formatea centavos para mostrar, por ejemplo 123456 -> "$1,234.56". Solo para vista. */
export function formatearMXN(centavos: Centavos): string {
  assertEntero(centavos, "centavos");
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100).toLocaleString("es-MX");
  const cents = String(abs % 100).padStart(2, "0");
  return `${signo}$${pesos}.${cents}`;
}

/** Convierte texto de pesos ("1234", "1,234.5", "1234.56") a centavos enteros, sin floats. */
export function pesosACentavos(texto: string): Centavos {
  const limpio = texto.trim().replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!m) throw new RangeError(`Monto inválido: ${texto}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
