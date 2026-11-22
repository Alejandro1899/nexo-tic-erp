export const COOKIE_SESION = "nexo_sesion";
export const DURACION_SESION_SEG = 60 * 60 * 12; // 12 horas

export function leerCookie(header: string | undefined, nombre: string): string | undefined {
  if (!header) return undefined;
  for (const par of header.split(";")) {
    const idx = par.indexOf("=");
    if (idx === -1) continue;
    if (par.slice(0, idx).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function cookieSesion(valor: string, maxAgeSeg: number): string {
  const partes = [
    `${COOKIE_SESION}=${encodeURIComponent(valor)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeg}`,
  ];
  if (process.env.NODE_ENV === "production") partes.push("Secure");
  return partes.join("; ");
}
