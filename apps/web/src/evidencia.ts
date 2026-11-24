import { EVIDENCIA_LADO_IMAGEN_PX } from "@nexo/shared";

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => no(new Error("No se pudo leer la imagen"));
    img.src = url;
  });
}

/**
 * Comprime una imagen para subirla como evidencia: la reduce a EVIDENCIA_LADO_IMAGEN_PX de lado mayor
 * y la guarda como JPEG. El fondo transparente se vuelve blanco para que la firma o el sello se vean.
 */
export async function comprimirImagen(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    const escala = Math.min(1, EVIDENCIA_LADO_IMAGEN_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite comprimir imágenes");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, no) =>
      canvas.toBlob((b) => (b ? ok(b) : no(new Error("No se pudo comprimir la imagen"))), "image/jpeg", 0.8),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function tamanoLegible(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
