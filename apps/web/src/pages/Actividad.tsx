import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api, ApiError, BASE_API, mensajeError } from "../api";
import { useAuth } from "../auth";

interface Registro {
  id: string;
  creadoEn: string;
  usuarioNombre: string;
  accion: string;
  entidad: string;
  resumen: string;
  cambios: Record<string, { antes: unknown; despues: unknown }> | null;
}

interface Resumen {
  total: number;
  ultimaExportacionEn: string | null;
  diasDesdeExportacion: number | null;
  avisarLimpieza: boolean;
}

/** Nombres en lenguaje claro para cada acción registrada. */
const ETIQUETA_ACCION: Record<string, string> = {
  "sesion.iniciar": "Inició sesión",
  "sesion.fallida": "Intento de acceso fallido",
  "cliente.crear": "Creó cliente",
  "cliente.editar": "Editó cliente",
  "cliente.eliminar": "Eliminó cliente",
  "cliente.servicio.asignar": "Asignó servicio",
  "cliente.servicio.quitar": "Quitó servicio",
  "cotizacion.crear": "Creó cotización",
  "cotizacion.editar": "Editó cotización",
  "cotizacion.enviar": "Envió cotización",
  "cotizacion.aprobar": "Aprobó cotización",
  "cotizacion.rechazar": "Rechazó cotización",
  "cotizacion.cambiar_estado": "Cambió estado de cotización",
  "cotizacion.eliminar": "Eliminó borrador",
  "cotizacion.evidencia.subir": "Subió evidencia de cotización",
  "cotizacion.evidencia.eliminar": "Quitó evidencia de cotización",
  "usuario.crear": "Creó usuario",
  "usuario.editar": "Editó usuario",
  "usuario.eliminar": "Eliminó usuario",
  "usuario.restablecer_password": "Restableció contraseña",
  "servicio.crear": "Creó servicio",
  "servicio.editar": "Editó servicio",
  "servicio.eliminar": "Eliminó servicio",
  "configuracion.editar": "Editó datos de la empresa",
  "bitacora.exportar": "Exportó bitácora",
  "bitacora.purgar": "Limpió bitácora",
  "bitacora.importar": "Importó bitácora",
};

const ENTIDADES = ["", "sesion", "cliente", "cotizacion", "usuario", "servicio", "configuracion", "bitacora"];

const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX");

function formatoValor(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Bitácora de actividad (ALCANCE 4.13). Consulta: ADMIN y DIRECCION. Exportar, limpiar e importar: solo ADMIN. */
export function Actividad() {
  const { sesion } = useAuth();
  const esAdmin = sesion?.usuario.rol === "ADMIN";
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [entidad, setEntidad] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: "200" });
      if (entidad) params.set("entidad", entidad);
      if (desde) params.set("desde", new Date(desde).toISOString());
      if (hasta) params.set("hasta", new Date(`${hasta}T23:59:59`).toISOString());
      const [lista, r] = await Promise.all([
        api<{ registros: Registro[] }>(`/api/actividad?${params.toString()}`),
        api<Resumen>("/api/actividad/resumen"),
      ]);
      setRegistros(lista.registros);
      setResumen(r);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [entidad, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Descarga el archivo de exportación hasta la fecha de corte. */
  async function descargarExportacion(corte: string): Promise<boolean> {
    const res = await fetch(`${BASE_API}/api/actividad/exportar?hasta=${encodeURIComponent(corte)}`, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.error ?? "error", data.mensaje ?? "No se pudo exportar");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `bitacora-${corte.slice(0, 10)}.json`;
    enlace.click();
    URL.revokeObjectURL(url);
    return true;
  }

  async function exportar() {
    setMensaje(null);
    setError(null);
    try {
      await descargarExportacion(new Date().toISOString());
      setMensaje("Exportación descargada.");
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  /** Limpieza manual: primero se descarga la exportación hasta hoy; después se borra con confirmación escrita. */
  async function limpiar() {
    setMensaje(null);
    setError(null);
    const corte = new Date().toISOString();
    const confirmacion = window.prompt(
      `Esto descarga primero una exportación de todos los registros y luego los borra. Escribe BORRAR para continuar.`,
    );
    if (confirmacion !== "BORRAR") return;
    try {
      await descargarExportacion(corte);
      const data = await api<{ eliminados: number }>("/api/actividad/purgar", {
        method: "POST",
        body: { hasta: corte, confirmacion: "BORRAR" },
      });
      setMensaje(`Se borraron ${data.eliminados} registros. Guarda el archivo descargado para importarlo después.`);
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function importar(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setMensaje(null);
    setError(null);
    try {
      const contenido = JSON.parse(await archivo.text());
      const data = await api<{ importados: number; omitidos: number }>("/api/actividad/importar", { body: contenido });
      setMensaje(`Importados ${data.importados} registros. Omitidos ${data.omitidos} que ya existían.`);
      await cargar();
    } catch (err) {
      setError(err instanceof SyntaxError ? "El archivo no es un JSON válido" : mensajeError(err));
    }
  }

  return (
    <section>
      <div className="barra">
        <h2>Actividad</h2>
        {esAdmin && <button onClick={() => void exportar()}>Exportar</button>}
        {esAdmin && <button onClick={() => void limpiar()}>Exportar y limpiar</button>}
        {esAdmin && (
          <label className="boton-archivo">
            Importar archivo
            <input type="file" accept="application/json,.json" onChange={(e) => void importar(e)} hidden />
          </label>
        )}
      </div>

      {resumen?.avisarLimpieza && (
        <p className="error">
          {resumen.diasDesdeExportacion === null
            ? "Todavía no se ha exportado la bitácora. Conviene exportar y limpiar."
            : `Han pasado ${resumen.diasDesdeExportacion} días desde la última exportación. Conviene exportar y limpiar.`}
        </p>
      )}
      {resumen && (
        <p>
          {resumen.total} registros
          {resumen.ultimaExportacionEn ? ` · última exportación: ${fecha(resumen.ultimaExportacionEn)}` : " · sin exportaciones todavía"}
        </p>
      )}
      {mensaje && <p>{mensaje}</p>}
      {error && <p className="error">{error}</p>}

      <div className="barra">
        <select value={entidad} onChange={(e) => setEntidad(e.target.value)} aria-label="Filtrar por entidad">
          {ENTIDADES.map((v) => (
            <option key={v || "todas"} value={v}>
              {v ? v : "Todas las entidades"}
            </option>
          ))}
        </select>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Quién</th>
            <th>Acción</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id}>
              <td>{fecha(r.creadoEn)}</td>
              <td>{r.usuarioNombre}</td>
              <td>{ETIQUETA_ACCION[r.accion] ?? r.accion}</td>
              <td>
                {r.resumen}
                {r.cambios &&
                  Object.entries(r.cambios).map(([campo, v]) => (
                    <div key={campo}>
                      <small>
                        {campo}: {formatoValor(v.antes)} → {formatoValor(v.despues)}
                      </small>
                    </div>
                  ))}
              </td>
            </tr>
          ))}
          {registros.length === 0 && (
            <tr>
              <td colSpan={4}>Sin registros con esos filtros</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
