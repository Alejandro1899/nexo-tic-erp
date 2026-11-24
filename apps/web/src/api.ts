/** Cliente HTTP de la web: siempre envía la cookie de sesión y convierte los errores del API en ApiError. */
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

/**
 * URL base del API. En desarrollo va vacía (el proxy de Vite reenvía /api).
 * En producción se define en build con VITE_API_URL, p. ej. https://api.tudominio.com.
 */
export const BASE_API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Cliente HTTP mínimo. La cookie de sesión viaja con cada petición (credentials: include). */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const tieneCuerpo = opciones.body !== undefined;
  const res = await fetch(`${BASE_API}${ruta}`, {
    method: opciones.method ?? (tieneCuerpo ? "POST" : "GET"),
    credentials: "include",
    headers: tieneCuerpo ? { "Content-Type": "application/json" } : undefined,
    body: tieneCuerpo ? JSON.stringify(opciones.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.mensaje ?? `Error del servidor (HTTP ${res.status})`);
  return data as T;
}

export function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}
