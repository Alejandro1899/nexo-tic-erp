import { useEffect, useMemo, useState, type FormEvent } from "react";
import { calcularTotales, formatearMXN, importeLinea, pesosACentavos } from "@nexo/shared";
import { api, mensajeError } from "../api";
import { useAuth } from "../auth";

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  unidad: string;
  tarifaCentavos: number;
  activo: boolean;
}

export interface ServicioAsignado {
  id: string;
  nombre: string;
  tarifaEfectivaCentavos: number;
}

/** Línea del formulario. Cantidad, precio y descuento se escriben como texto y se convierten al enviar. */
interface Linea {
  clave: number;
  tipo: "catalogo" | "libre";
  servicioId: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  descuento: string;
  /** Costo estimado unitario, interno. Solo ADMIN y DIRECCION lo capturan. */
  costo: string;
}

let claveSeq = 0;
const lineaVacia = (): Linea => ({
  clave: ++claveSeq,
  tipo: "catalogo",
  servicioId: "",
  descripcion: "",
  cantidad: "1",
  precio: "",
  descuento: "0",
  costo: "",
});

/** Convierte texto a enteros sin floats: cantidad a milésimas, descuento a puntos básicos. */
const aMilesimas = (t: string) => Math.round(Number(t) * 1000);
const aPuntosBasicos = (t: string) => Math.round(Number(t || "0") * 100);

/**
 * Formulario de cotización (alta y edición en borrador). El total que se muestra es una vista previa:
 * el servidor vuelve a calcularlo y es el que vale. Los servicios del catálogo usan la tarifa del cliente.
 */
export function CotizacionFormulario({
  clienteId: clienteFijo,
  inicial,
  onGuardado,
  onCancelar,
}: {
  clienteId: string | null;
  inicial?: {
    id: string;
    notas: string | null;
    anticipoPb?: number;
    partidas: Array<{
      servicioId: string | null;
      descripcion: string;
      cantidadMilesimas: number;
      precioUnitarioCentavos: number;
      descuentoPb: number;
      costoUnitarioCentavos?: number | null;
    }>;
  } | null;
  onGuardado: (id: string) => void;
  onCancelar: () => void;
}) {
  const [clientes, setClientes] = useState<Array<{ id: string; nombre: string }>>([]);
  const [clienteId, setClienteId] = useState<string>(clienteFijo ?? "");
  const [catalogo, setCatalogo] = useState<ServicioCatalogo[]>([]);
  const [asignados, setAsignados] = useState<ServicioAsignado[]>([]);
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [vigenciaDias, setVigenciaDias] = useState("15");
  const [anticipo, setAnticipo] = useState(inicial?.anticipoPb ? String(inicial.anticipoPb / 100) : "0");
  const { sesion } = useAuth();
  const puedeCostos = sesion?.usuario.rol === "ADMIN" || sesion?.usuario.rol === "DIRECCION";
  const [lineas, setLineas] = useState<Linea[]>(() =>
    inicial
      ? inicial.partidas.map((p) => ({
          clave: ++claveSeq,
          tipo: p.servicioId ? "catalogo" : "libre",
          servicioId: p.servicioId ?? "",
          descripcion: p.descripcion,
          cantidad: String(p.cantidadMilesimas / 1000),
          precio: p.servicioId ? "" : String(p.precioUnitarioCentavos / 100),
          descuento: String(p.descuentoPb / 100),
          costo: p.costoUnitarioCentavos != null ? String(p.costoUnitarioCentavos / 100) : "",
        }))
      : [lineaVacia()],
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ servicios: ServicioCatalogo[] }>("/api/servicios").then((d) => setCatalogo(d.servicios.filter((s) => s.activo))).catch(() => {});
    if (!clienteFijo) {
      api<{ clientes: Array<{ id: string; nombre: string }> }>("/api/clientes").then((d) => setClientes(d.clientes)).catch(() => {});
    }
  }, [clienteFijo]);

  useEffect(() => {
    if (!clienteId) {
      setAsignados([]);
      return;
    }
    api<{ servicios: ServicioAsignado[] }>(`/api/clientes/${clienteId}/servicios`)
      .then((d) => setAsignados(d.servicios))
      .catch(() => setAsignados([]));
  }, [clienteId]);

  /** Precio que verá el cliente: tarifa propia si la tiene, si no la del catálogo. */
  const precioDe = useMemo(() => {
    const mapa = new Map<string, number>();
    catalogo.forEach((s) => mapa.set(s.id, s.tarifaCentavos));
    asignados.forEach((s) => mapa.set(s.id, s.tarifaEfectivaCentavos));
    return mapa;
  }, [catalogo, asignados]);

  const vista = useMemo(() => {
    try {
      const filas = lineas.map((l) => {
        const cant = aMilesimas(l.cantidad);
        const precio = l.tipo === "catalogo" ? (precioDe.get(l.servicioId) ?? 0) : pesosACentavos(l.precio || "0");
        return { precioUnitarioCentavos: precio, cantidadMilesimas: cant, descuentoPb: aPuntosBasicos(l.descuento) };
      });
      const totales = calcularTotales(filas);
      const importes = filas.map((f) => importeLinea(f.precioUnitarioCentavos, f.cantidadMilesimas));
      return { totales, importes };
    } catch {
      return { totales: null, importes: [] as number[] };
    }
  }, [lineas, precioDe]);

  function actualizar(clave: number, cambios: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }

  /** El costo solo se envía si el usuario puede verlo; vacío significa sin costo capturado. */
  function costoDe(l: Linea): { costoUnitarioCentavos: number | null } | Record<string, never> {
    if (!puedeCostos) return {};
    return { costoUnitarioCentavos: l.costo.trim() ? pesosACentavos(l.costo) : null };
  }

  function construirPartidas() {
    return lineas.map((l) => {
      const base = { cantidadMilesimas: aMilesimas(l.cantidad), descuentoPb: aPuntosBasicos(l.descuento), ...costoDe(l) };
      if (l.tipo === "catalogo") return { servicioId: l.servicioId, ...base };
      return { descripcion: l.descripcion.trim(), precioUnitarioCentavos: pesosACentavos(l.precio || "0"), ...base };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const cuerpo = {
        vigenciaDias: Number(vigenciaDias),
        notas: notas.trim() || null,
        anticipoPb: Math.round(Number(anticipo || "0") * 100),
        partidas: construirPartidas(),
      };
      if (inicial) {
        await api(`/api/cotizaciones/${inicial.id}`, { method: "PATCH", body: cuerpo });
        onGuardado(inicial.id);
      } else {
        const data = await api<{ cotizacion: { id: string } }>("/api/cotizaciones", { body: { clienteId, ...cuerpo } });
        onGuardado(data.cotizacion.id);
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={onSubmit}>
      <h3>{inicial ? "Editar cotización" : "Nueva cotización"}</h3>
      <div className="grid">
        {!clienteFijo && !inicial && (
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="">Elige un cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Vigencia (días)
          <input type="number" min={1} max={365} value={vigenciaDias} onChange={(e) => setVigenciaDias(e.target.value)} required />
        </label>
        <label>
          Anticipo (%)
          <input type="number" min={0} max={100} step="0.01" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} />
          <small>Sobre el total con IVA. 0 = sin anticipo.</small>
        </label>
        <label>
          Notas
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} />
        </label>
      </div>

      <h4>Partidas</h4>
      <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Servicio o descripción</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Desc. %</th>
            {puedeCostos && <th>Costo (interno)</th>}
            <th>Importe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={l.clave}>
              <td>
                <select value={l.tipo} onChange={(e) => actualizar(l.clave, { tipo: e.target.value as Linea["tipo"] })}>
                  <option value="catalogo">Catálogo</option>
                  <option value="libre">Libre</option>
                </select>
              </td>
              <td>
                {l.tipo === "catalogo" ? (
                  <select value={l.servicioId} onChange={(e) => actualizar(l.clave, { servicioId: e.target.value })} required>
                    <option value="">Elige un servicio</option>
                    {asignados.length > 0 && (
                      <optgroup label="Asignados a este cliente">
                        {asignados.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre} — {formatearMXN(s.tarifaEfectivaCentavos)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={asignados.length > 0 ? "Otros servicios del catálogo" : "Catálogo"}>
                      {catalogo
                        .filter((s) => !asignados.some((a) => a.id === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre} — {formatearMXN(s.tarifaCentavos)}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                ) : (
                  <input value={l.descripcion} onChange={(e) => actualizar(l.clave, { descripcion: e.target.value })} required placeholder="Descripción" />
                )}
              </td>
              <td>
                <input type="number" min={0.001} step="0.001" value={l.cantidad} onChange={(e) => actualizar(l.clave, { cantidad: e.target.value })} required />
              </td>
              <td>
                {l.tipo === "libre" ? (
                  <input inputMode="decimal" value={l.precio} onChange={(e) => actualizar(l.clave, { precio: e.target.value })} required placeholder="0.00" />
                ) : (
                  <span>{formatearMXN(precioDe.get(l.servicioId) ?? 0)}</span>
                )}
              </td>
              <td>
                <input type="number" min={0} max={100} step="0.01" value={l.descuento} onChange={(e) => actualizar(l.clave, { descuento: e.target.value })} />
              </td>
              {puedeCostos && (
                <td>
                  <input inputMode="decimal" value={l.costo} onChange={(e) => actualizar(l.clave, { costo: e.target.value })} placeholder="0.00" />
                </td>
              )}
              <td>{vista.importes[i] !== undefined ? formatearMXN(vista.importes[i]) : "—"}</td>
              <td>
                {lineas.length > 1 && (
                  <button type="button" onClick={() => setLineas((prev) => prev.filter((x) => x.clave !== l.clave))}>
                    Quitar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <button type="button" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}>
        Agregar partida
      </button>

      {vista.totales && (
        <dl className="detalle totales">
          <dt>Subtotal</dt>
          <dd>{formatearMXN(vista.totales.subtotalCentavos)}</dd>
          <dt>Descuento</dt>
          <dd>{formatearMXN(vista.totales.descuentoCentavos)}</dd>
          <dt>IVA 16 %</dt>
          <dd>{formatearMXN(vista.totales.ivaCentavos)}</dd>
          <dt>Total</dt>
          <dd>
            <strong>{formatearMXN(vista.totales.totalCentavos)}</strong>
          </dd>
        </dl>
      )}
      <p>El total final lo calcula el servidor al guardar.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="submit" disabled={enviando || (!inicial && !clienteId)}>
          Guardar borrador
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

