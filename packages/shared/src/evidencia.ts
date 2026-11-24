/**
 * Evidencia de aprobación de cotizaciones (cotización firmada u otro respaldo).
 * Las imágenes se comprimen en el navegador antes de subirlas; los PDF se suben tal cual, con límite de tamaño.
 */
export const EVIDENCIA_TIPOS = ["application/pdf", "image/jpeg", "image/png"] as const;
export const EVIDENCIA_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCIA_MAX_POR_COTIZACION = 5;
/** Lado mayor de una imagen al comprimirla. Basta para leer una firma y un sello. */
export const EVIDENCIA_LADO_IMAGEN_PX = 1600;

/** Firma de cada tipo, para comprobar que el archivo es lo que dice ser. */
export const FIRMAS_EVIDENCIA: Record<(typeof EVIDENCIA_TIPOS)[number], number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};
