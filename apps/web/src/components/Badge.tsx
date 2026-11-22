import type { ReactNode } from "react";

/** Colores de estado (ALCANCE 4.12). Siempre va con texto, nunca solo color. */
export type Tono = "verde" | "amarillo" | "azul" | "rojo" | "gris" | "ambar";

export function Badge({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`badge badge-${tono}`}>{children}</span>;
}
