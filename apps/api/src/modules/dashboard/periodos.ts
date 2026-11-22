/** Periodos del dashboard. Todo se calcula contra la fecha del servidor. */
export type Periodo = "mes" | "trimestre" | "anio";

export const PERIODOS: Periodo[] = ["mes", "trimestre", "anio"];

/** Inicio del periodo solicitado: mes actual, últimos tres meses o año en curso. */
export function inicioPeriodo(periodo: Periodo, ahora: Date): Date {
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();
  if (periodo === "mes") return new Date(anio, mes, 1);
  if (periodo === "trimestre") return new Date(anio, mes - 2, 1);
  return new Date(anio, 0, 1);
}

/** Los seis meses que cubre la tendencia, del más antiguo al actual. */
export function mesesTendencia(ahora: Date): Array<{ clave: string; inicio: Date; fin: Date }> {
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const fin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 1);
    const clave = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}`;
    meses.push({ clave, inicio, fin });
  }
  return meses;
}

/** Clave de mes (AAAA-MM) de una fecha, o null si no hay fecha. */
export function claveMes(fecha: Date | null): string | null {
  if (!fecha) return null;
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}
