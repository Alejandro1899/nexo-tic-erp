import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatearMXN } from "@nexo/shared";
import { api, ApiError, BASE_API, mensajeError } from "../api";
import { useAuth } from "../auth";
import { CotizacionFormulario } from "../components/CotizacionFormulario";
import { EstadoCotizacion } from "./Cotizaciones";

interface PartidaDetalle {
  id: string;
  orden: number;
  servicioId: string | null;
  descripcion: string;
  cantidadMilesimas: number;
  precioUnitarioCentavos: number;
  descuentoPb: number;
  importeCentavos: number;
  descuentoCentavos: number;
}

/** Datos de la empresa que aparecen en la hoja impresa. */
interface EmpresaImpresion {
  nombreComercial: string;
  razonSocial: string | null;
  rfc: string | null;
  correo: string | null;
  telefono: string | null;
  sitioWeb: string | null;
  tieneLogo: boolean;
  condicionesCotizacion: string;
}

interface CotizacionDetalle {
  id: string;
  folio: string;
  estado: string;
  estadoMostrado: string;
  creadoEn: string;
  vigenciaHasta: string;
  notas: string | null;
  subtotalCentavos: number;
  descuentoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
  creadoPorId: string | null;
  autorizadaPorId: string | null;
  cliente: { id: string; nombre: string };
  partidas: PartidaDetalle[];
}

/** Detalle de cotización con sus acciones según estado y rol. El backend valida cada acción. */
export function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const rol = sesion?.usuario.rol;
  const miId = sesion?.usuario.id;
  const [cotizacion, setCotizacion] = useState<CotizacionDetalle | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaImpresion | null>(null);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Datos de la empresa para el encabezado de impresión. Si fallan, la hoja sale sin encabezado de empresa.
    api<{ configuracion: EmpresaImpresion }>("/api/configuracion")
      .then((d) => setEmpresa(d.configuracion))
      .catch(() => setEmpresa(null));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ cotizacion: CotizacionDetalle }>(`/api/cotizaciones/${id}`);
      setCotizacion(data.cotizacion);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Esta cotización no existe o fue eliminada." : mensajeError(e));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(ruta: string, metodo: "POST" | "DELETE", confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    try {
      await api(ruta, { method: metodo });
      if (metodo === "DELETE") navigate("/cotizaciones", { replace: true });
      else await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/cotizaciones">Volver a cotizaciones</Link>
      </section>
    );
  }
  if (!cotizacion) return <p>Cargando…</p>;

  const esAdminODireccion = rol === "ADMIN" || rol === "DIRECCION";
  const puedeGestionar = esAdminODireccion || cotizacion.creadoPorId === miId;
  const esBorrador = cotizacion.estado === "BORRADOR";
  const esEnviada = cotizacion.estado === "ENVIADA";
  const vencida = cotizacion.estadoMostrado === "VENCIDA";

  if (editando) {
    return (
      <section>
        <CotizacionFormulario
          clienteId={cotizacion.cliente.id}
          inicial={cotizacion}
          onCancelar={() => setEditando(false)}
          onGuardado={async () => {
            setEditando(false);
            await cargar();
          }}
        />
      </section>
    );
  }

  return (
    <section>
      {empresa && (
        <header className="solo-imprimir encabezado-impresion">
          <div>
            {empresa.tieneLogo && <img src={`${BASE_API}/api/configuracion/logo`} alt={empresa.nombreComercial} />}
            <strong>{empresa.razonSocial ?? empresa.nombreComercial}</strong>
            <div>
              {[empresa.rfc && `RFC ${empresa.rfc}`, empresa.correo, empresa.telefono, empresa.sitioWeb].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="encabezado-folio">
            <strong>COTIZACIÓN</strong>
            <div>Folio: {cotizacion.folio}</div>
            <div>Fecha: {new Date(cotizacion.creadoEn).toLocaleDateString("es-MX")}</div>
            <div>Vigente hasta: {new Date(cotizacion.vigenciaHasta).toLocaleDateString("es-MX")}</div>
          </div>
        </header>
      )}

      <div className="barra no-imprimir">
        <h2>{cotizacion.folio}</h2>
        <EstadoCotizacion estado={cotizacion.estadoMostrado} />
        <button type="button" onClick={() => window.print()}>Imprimir / PDF</button>
        {esBorrador && puedeGestionar && <button onClick={() => setEditando(true)}>Editar</button>}
        {esBorrador && puedeGestionar && (
          <button onClick={() => void accion(`/api/cotizaciones/${cotizacion.id}/enviar`, "POST")}>Enviar a autorización</button>
        )}
        {esEnviada && !vencida && esAdminODireccion && (
          <>
            <button onClick={() => void accion(`/api/cotizaciones/${cotizacion.id}/aprobar`, "POST", "¿Aprobar esta cotización?")}>Aprobar</button>
            <button onClick={() => void accion(`/api/cotizaciones/${cotizacion.id}/rechazar`, "POST", "¿Rechazar esta cotización?")}>Rechazar</button>
          </>
        )}
        {esBorrador && puedeGestionar && (
          <button onClick={() => void accion(`/api/cotizaciones/${cotizacion.id}`, "DELETE", "¿Eliminar este borrador?")}>Eliminar</button>
        )}
      </div>

      {vencida && <p>La vigencia de esta cotización ya venció. Hay que crear una nueva para autorizarla.</p>}

      <dl className="detalle">
        <dt>Cliente</dt>
        <dd>
          <Link to={`/clientes/${cotizacion.cliente.id}`}>{cotizacion.cliente.nombre}</Link>
        </dd>
        <dt>Vigente hasta</dt>
        <dd>{new Date(cotizacion.vigenciaHasta).toLocaleDateString("es-MX")}</dd>
        <dt>Notas</dt>
        <dd>{cotizacion.notas ?? "—"}</dd>
      </dl>

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Descuento</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {cotizacion.partidas.map((p) => (
            <tr key={p.id}>
              <td>{p.descripcion}</td>
              <td>{p.cantidadMilesimas / 1000}</td>
              <td>{formatearMXN(p.precioUnitarioCentavos)}</td>
              <td>{formatearMXN(p.descuentoCentavos)}</td>
              <td>{formatearMXN(p.importeCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="detalle totales">
        <dt>Subtotal</dt>
        <dd>{formatearMXN(cotizacion.subtotalCentavos)}</dd>
        <dt>Descuento</dt>
        <dd>{formatearMXN(cotizacion.descuentoCentavos)}</dd>
        <dt>IVA 16 %</dt>
        <dd>{formatearMXN(cotizacion.ivaCentavos)}</dd>
        <dt>Total</dt>
        <dd>
          <strong>{formatearMXN(cotizacion.totalCentavos)}</strong>
        </dd>
      </dl>

      <p className="no-imprimir">
        <Link to="/cotizaciones">← Volver a cotizaciones</Link>
      </p>

      {empresa?.condicionesCotizacion && (
        <section className="solo-imprimir condiciones-impresion">
          <strong>Condiciones</strong>
          <p>{empresa.condicionesCotizacion}</p>
        </section>
      )}
    </section>
  );
}
