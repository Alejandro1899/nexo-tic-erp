import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatearMXN } from "@nexo/shared";
import { api, mensajeError } from "../api";
import { useAuth } from "../auth";
import { Badge, type Tono } from "../components/Badge";
import { CotizacionFormulario } from "../components/CotizacionFormulario";

export const ETIQUETA_COTIZACION: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

export const TONO_COTIZACION: Record<string, Tono> = {
  BORRADOR: "gris",
  ENVIADA: "azul",
  APROBADA: "verde",
  RECHAZADA: "rojo",
  VENCIDA: "ambar",
};

export interface CotizacionResumen {
  id: string;
  folio: string;
  estado: string;
  estadoMostrado: string;
  subtotalCentavos: number;
  descuentoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
  vigenciaHasta: string;
  creadoEn: string;
  cliente: { id: string; nombre: string };
}

export function EstadoCotizacion({ estado }: { estado: string }) {
  return <Badge tono={TONO_COTIZACION[estado] ?? "gris"}>{ETIQUETA_COTIZACION[estado] ?? estado}</Badge>;
}

/** Lista de cotizaciones. ADMIN, DIRECCION y VENDEDOR; el backend también lo exige. */
export function Cotizaciones() {
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const [cotizaciones, setCotizaciones] = useState<CotizacionResumen[]>([]);
  const [estado, setEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ estado });
      const data = await api<{ cotizaciones: CotizacionResumen[] }>(`/api/cotizaciones?${params.toString()}`);
      setCotizaciones(data.cotizaciones);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [estado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const rol = sesion?.usuario.rol;
  if (rol === "TECNICO") return <p className="error">Tu rol no tiene acceso a cotizaciones.</p>;

  return (
    <section>
      <div className="barra">
        <h2>Cotizaciones</h2>
        {!creando && <button onClick={() => setCreando(true)}>Nueva cotización</button>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="chips" role="group" aria-label="Filtrar por estado">
        {[{ valor: "", etiqueta: "Todas" }, ...["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"].map((k) => ({ valor: k, etiqueta: ETIQUETA_COTIZACION[k] }))].map((o) => (
          <button key={o.valor || "todas"} type="button" className={`chip${estado === o.valor ? " activo" : ""}`} onClick={() => setEstado(o.valor)} aria-pressed={estado === o.valor}>
            {o.etiqueta}
          </button>
        ))}
      </div>

      {creando && (
        <CotizacionFormulario
          clienteId={null}
          onCancelar={() => setCreando(false)}
          onGuardado={(id) => navigate(`/cotizaciones/${id}`)}
        />
      )}

      <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Subtotal</th>
            <th>Descuento</th>
            <th>IVA</th>
            <th>Total</th>
            <th>Vigente hasta</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {cotizaciones.map((c) => (
            <tr key={c.id} className="fila">
              <td>
                <Link to={`/cotizaciones/${c.id}`}>{c.folio}</Link>
              </td>
              <td>
                <Link to={`/clientes/${c.cliente.id}`}>{c.cliente.nombre}</Link>
              </td>
              <td className="num">{formatearMXN(c.subtotalCentavos)}</td>
              <td className="num">{formatearMXN(c.descuentoCentavos)}</td>
              <td className="num">{formatearMXN(c.ivaCentavos)}</td>
              <td className="num">
                <strong>{formatearMXN(c.totalCentavos)}</strong>
              </td>
              <td>{new Date(c.vigenciaHasta).toLocaleDateString("es-MX")}</td>
              <td>
                <EstadoCotizacion estado={c.estadoMostrado} />
              </td>
            </tr>
          ))}
          {cotizaciones.length === 0 && (
            <tr>
              <td colSpan={8}>Sin cotizaciones</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}
