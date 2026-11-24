import { useCallback, useEffect, useState } from "react";
import { EVIDENCIA_MAX_BYTES, EVIDENCIA_MAX_POR_COTIZACION } from "@nexo/shared";
import { api, BASE_API, mensajeError } from "../api";
import { comprimirImagen, tamanoLegible } from "../evidencia";

interface EvidenciaMeta {
  id: string;
  nombre: string;
  tipo: string;
  tamanoBytes: number;
  creadoEn: string;
}

/** Evidencia de aprobación: la cotización firmada u otro respaldo. Imágenes comprimidas; PDF tal cual. ADMIN y DIRECCION. */
export function EvidenciasCotizacion({ cotizacionId }: { cotizacionId: string }) {
  const [lista, setLista] = useState<EvidenciaMeta[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ evidencias: EvidenciaMeta[] }>(`/api/cotizaciones/${cotizacionId}/evidencias`);
      setLista(data.evidencias);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [cotizacionId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function subir(archivo: File) {
    setError(null);
    setMensaje(null);
    setSubiendo(true);
    try {
      if (lista.length >= EVIDENCIA_MAX_POR_COTIZACION) {
        throw new Error(`Una cotización admite hasta ${EVIDENCIA_MAX_POR_COTIZACION} evidencias. Quita una para subir otra.`);
      }
      let cuerpo: Blob = archivo;
      let nombre = archivo.name;
      if (archivo.type.startsWith("image/")) {
        // Solo se usa la versión comprimida si realmente pesa menos que el original.
        const comprimida = await comprimirImagen(archivo);
        if (comprimida.size < archivo.size) {
          cuerpo = comprimida;
          nombre = `${nombre.replace(/\.[^.]+$/, "")}.jpg`;
        }
      } else if (archivo.type !== "application/pdf") {
        throw new Error("Solo se aceptan PDF, JPG o PNG.");
      }
      if (cuerpo.size > EVIDENCIA_MAX_BYTES) {
        throw new Error("El archivo sigue pesando más de 5 MB. Si es un PDF, escanéalo con menor resolución.");
      }
      const res = await fetch(`${BASE_API}/api/cotizaciones/${cotizacionId}/evidencias?nombre=${encodeURIComponent(nombre)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": cuerpo.type },
        body: cuerpo,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.mensaje ?? "No se pudo subir la evidencia");
      }
      setMensaje(`Se subió "${nombre}" (${tamanoLegible(cuerpo.size)}).`);
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function ver(evidencia: EvidenciaMeta) {
    setError(null);
    try {
      const res = await fetch(`${BASE_API}/api/cotizaciones/${cotizacionId}/evidencias/${evidencia.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo abrir la evidencia");
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function quitar(evidencia: EvidenciaMeta) {
    if (!window.confirm(`¿Quitar "${evidencia.nombre}" de esta cotización?`)) return;
    setError(null);
    try {
      await api(`/api/cotizaciones/${cotizacionId}/evidencias/${evidencia.id}`, { method: "DELETE" });
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  return (
    <div className="tarjeta">
      <h3>Evidencia de aprobación</h3>
      <p>Cotización firmada u otro respaldo de la decisión. Las imágenes se comprimen antes de subirlas.</p>
      {error && <p className="error">{error}</p>}
      {mensaje && <p>{mensaje}</p>}
      {lista.length === 0 ? (
        <p>Todavía no hay evidencias.</p>
      ) : (
        <ul className="lista-simple">
          {lista.map((e) => (
            <li key={e.id}>
              {e.nombre} <small>· {tamanoLegible(e.tamanoBytes)}</small>{" "}
              <button type="button" onClick={() => void ver(e)}>
                Ver
              </button>{" "}
              <button type="button" onClick={() => void quitar(e)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="boton-archivo">
        {subiendo ? "Subiendo…" : "Subir evidencia"}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          hidden
          disabled={subiendo}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo) void subir(archivo);
          }}
        />
      </label>
    </div>
  );
}
