export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Opciones {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/** Cliente HTTP mínimo. La cookie de sesión viaja sola (mismo origen, vía proxy de Vite). */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const tieneCuerpo = opciones.body !== undefined;
  const res = await fetch(ruta, {
    method: opciones.method ?? (tieneCuerpo ? "POST" : "GET"),
    credentials: "same-origin",
    headers: tieneCuerpo ? { "Content-Type": "application/json" } : undefined,
    body: tieneCuerpo ? JSON.stringify(opciones.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.mensaje ?? "Error del servidor");
  return data as T;
}

export function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}
