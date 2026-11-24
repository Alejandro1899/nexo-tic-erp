import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatearMXN } from "@nexo/shared";
import { api, ApiError, BASE_API, mensajeError } from "../api";
import type { CotizacionDetalle as CotizacionDetalleDatos } from "./CotizacionDetalle";

interface Empresa {
  nombreComercial: string;
  razonSocial: string | null;
  rfc: string | null;
  regimenFiscal: string | null;
  codigoPostal: string | null;
  correo: string | null;
  telefono: string | null;
  sitioWeb: string | null;
  condicionesCotizacion: string;
  tieneLogo: boolean;
}

/** Vista lista para imprimir o guardar como PDF con el diálogo del navegador. */
export function CotizacionImprimir() {
  const { id } = useParams();
  const [cotizacion, setCotizacion] = useState<CotizacionDetalleDatos | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ cotizacion: CotizacionDetalleDatos }>(`/api/cotizaciones/${id}`),
      api<{ configuracion: Empresa }>("/api/configuracion"),
    ])
      .then(([c, e]) => {
        setCotizacion(c.cotizacion);
        setEmpresa(e.configuracion);
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "Esta cotización no existe." : mensajeError(e)));
  }, [id]);

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/cotizaciones">Volver a cotizaciones</Link>
      </section>
    );
  }
  if (!cotizacion || !empresa) return <p>Preparando impresión…</p>;

  const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX");

  return (
    <section className="hoja">
      <div className="acciones no-imprimir">
        <button onClick={() => window.print()}>Imprimir / guardar PDF</button>
        <Link to={`/cotizaciones/${cotizacion.id}`}>← Volver a la cotización</Link>
      </div>

      <div className="hoja-encabezado">
        <div>
          <h2>{empresa.nombreComercial}</h2>
          {empresa.razonSocial && <div>{empresa.razonSocial}</div>}
          {empresa.rfc && <div>RFC: {empresa.rfc}</div>}
          {empresa.regimenFiscal && <div>Régimen: {empresa.regimenFiscal}</div>}
          {empresa.codigoPostal && <div>C.P. {empresa.codigoPostal}</div>}
          {empresa.correo && <div>{empresa.correo}</div>}
          {empresa.telefono && <div>{empresa.telefono}</div>}
          {empresa.sitioWeb && <div>{empresa.sitioWeb}</div>}
        </div>
        {empresa.tieneLogo && <img src={`${BASE_API}/api/configuracion/logo`} alt="" className="hoja-logo" />}
      </div>

      <h3 className="hoja-titulo">Cotización {cotizacion.folio}</h3>
      <dl className="detalle">
        <dt>Cliente</dt>
        <dd>{cotizacion.cliente.nombre}</dd>
        <dt>Fecha de vigencia</dt>
        <dd>{fecha(cotizacion.vigenciaHasta)}</dd>
      </dl>

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Desc. %</th>
            <th>Descuento</th>
            <th>Importe neto</th>
          </tr>
        </thead>
        <tbody>
          {cotizacion.partidas.map((p) => (
            <tr key={p.id}>
              <td>{p.descripcion}</td>
              <td>{p.cantidadMilesimas / 1000}</td>
              <td>{formatearMXN(p.precioUnitarioCentavos)}</td>
              <td>{p.descuentoPb / 100} %</td>
              <td>{formatearMXN(p.descuentoCentavos)}</td>
              <td>{formatearMXN(p.importeCentavos - p.descuentoCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="detalle totales">
        <dt>Subtotal (antes de descuento)</dt>
        <dd>{formatearMXN(cotizacion.subtotalCentavos)}</dd>
        <dt>Descuento</dt>
        <dd>{formatearMXN(cotizacion.descuentoCentavos)}</dd>
        <dt>IVA 16 %</dt>
        <dd>{formatearMXN(cotizacion.ivaCentavos)}</dd>
        <dt>Total</dt>
        <dd>
          <strong>{formatearMXN(cotizacion.totalCentavos)}</strong>
        </dd>
        {cotizacion.anticipoPb > 0 && (
          <>
            <dt>Anticipo ({cotizacion.anticipoPb / 100} %)</dt>
            <dd>{formatearMXN(cotizacion.anticipoCentavos)}</dd>
            <dt>Saldo</dt>
            <dd>{formatearMXN(cotizacion.saldoCentavos)}</dd>
          </>
        )}
      </dl>

      {cotizacion.notas && (
        <>
          <h4>Notas</h4>
          <p className="hoja-texto">{cotizacion.notas}</p>
        </>
      )}

      {empresa.condicionesCotizacion && (
        <>
          <h4>Condiciones</h4>
          <p className="hoja-texto">{empresa.condicionesCotizacion}</p>
        </>
      )}

      <div className="hoja-aceptacion">
        <h4>Aceptación del cliente</h4>
        <p>Acepto esta cotización y sus condiciones.</p>
        <div className="hoja-firmas">
          <div className="hoja-firma">
            <div className="hoja-linea" />
            <span>Nombre y cargo</span>
          </div>
          <div className="hoja-firma">
            <div className="hoja-linea" />
            <span>Firma</span>
          </div>
          <div className="hoja-firma">
            <div className="hoja-linea" />
            <span>Fecha</span>
          </div>
        </div>
      </div>
    </section>
  );
}
