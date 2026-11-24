/** Secciones del detalle de cliente: servicios asignados y cotizaciones del cliente. */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatearMXN, pesosACentavos } from "@nexo/shared";
import { api, mensajeError } from "../api";
import { CotizacionFormulario } from "./CotizacionFormulario";
import { EstadoCotizacion, type CotizacionResumen } from "../pages/Cotizaciones";
import { ETIQUETA_UNIDAD } from "../pages/Servicios";

interface ServicioAsignadoFila {
  id: string;
  nombre: string;
  categoria: { id: string; nombre: string } | null;
  unidad: string;
  tarifaCatalogoCentavos: number;
  tarifaCentavos: number | null;
  tarifaEfectivaCentavos: number;
}

/** Servicios que el cliente tiene asignados. Quien asigna: DIRECCION y ADMIN. */
export function ServiciosAsignados({ clienteId, puedeAsignar }: { clienteId: string; puedeAsignar: boolean }) {
  const [asignados, setAsignados] = useState<ServicioAsignadoFila[]>([]);
  const [catalogo, setCatalogo] = useState<Array<{ id: string; nombre: string }>>([]);
  const [servicioId, setServicioId] = useState("");
  const [tarifa, setTarifa] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        api<{ servicios: ServicioAsignadoFila[] }>(`/api/clientes/${clienteId}/servicios`),
        api<{ servicios: Array<{ id: string; nombre: string; activo: boolean }> }>("/api/servicios"),
      ]);
      setAsignados(a.servicios);
      setCatalogo(c.servicios.filter((s) => s.activo));
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function asignar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/clientes/${clienteId}/servicios`, {
        body: { servicioId, tarifaCentavos: tarifa.trim() ? pesosACentavos(tarifa) : null },
      });
      setServicioId("");
      setTarifa("");
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function quitar(id: string, nombre: string) {
    if (!window.confirm(`¿Quitar ${nombre} de este cliente?`)) return;
    try {
      await api(`/api/clientes/${clienteId}/servicios/${id}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  const disponibles = catalogo.filter((s) => !asignados.some((a) => a.id === s.id));

  return (
    <div className="tarjeta">
      <h3>Servicios asignados</h3>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Categoría</th>
            <th>Cobro</th>
            <th>Tarifa para este cliente</th>
            {puedeAsignar && <th />}
          </tr>
        </thead>
        <tbody>
          {asignados.map((s) => (
            <tr key={s.id}>
              <td>{s.nombre}</td>
              <td>{s.categoria?.nombre ?? "—"}</td>
              <td>{ETIQUETA_UNIDAD[s.unidad as keyof typeof ETIQUETA_UNIDAD] ?? s.unidad}</td>
              <td>
                {formatearMXN(s.tarifaEfectivaCentavos)}
                {s.tarifaCentavos !== null && <small> · tarifa propia</small>}
              </td>
              {puedeAsignar && (
                <td>
                  <button type="button" onClick={() => void quitar(s.id, s.nombre)}>
                    Quitar
                  </button>
                </td>
              )}
            </tr>
          ))}
          {asignados.length === 0 && (
            <tr>
              <td colSpan={puedeAsignar ? 5 : 4}>Este cliente todavía no tiene servicios asignados.</td>
            </tr>
          )}
        </tbody>
      </table>

      {puedeAsignar && (
        <form className="barra" onSubmit={asignar}>
          <select value={servicioId} onChange={(e) => setServicioId(e.target.value)} required>
            <option value="">Elige un servicio</option>
            {disponibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <input inputMode="decimal" placeholder="Tarifa propia (opcional)" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
          <button type="submit" disabled={!servicioId}>
            Asignar
          </button>
        </form>
      )}
    </div>
  );
}

/** Cotizaciones del cliente y alta de una nueva. Lo ven y crean ADMIN, DIRECCION y VENDEDOR. */
export function CotizacionesDelCliente({ clienteId, puedeCotizar }: { clienteId: string; puedeCotizar: boolean }) {
  const [cotizaciones, setCotizaciones] = useState<CotizacionResumen[]>([]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ cotizaciones: CotizacionResumen[] }>(`/api/cotizaciones?clienteId=${clienteId}`);
      setCotizaciones(data.cotizaciones);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="tarjeta">
      <div className="barra">
        <h3>Cotizaciones</h3>
        {puedeCotizar && !creando && <button onClick={() => setCreando(true)}>Nueva cotización</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {creando && puedeCotizar && (
        <CotizacionFormulario
          clienteId={clienteId}
          onCancelar={() => setCreando(false)}
          onGuardado={async () => {
            setCreando(false);
            await cargar();
          }}
        />
      )}

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {cotizaciones.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/cotizaciones/${c.id}`}>{c.folio}</Link>
              </td>
              <td>{formatearMXN(c.totalCentavos)}</td>
              <td>
                <EstadoCotizacion estado={c.estadoMostrado} />
              </td>
            </tr>
          ))}
          {cotizaciones.length === 0 && (
            <tr>
              <td colSpan={3}>Sin cotizaciones para este cliente.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
