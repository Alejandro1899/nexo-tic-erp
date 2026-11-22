import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatearMXN } from "@nexo/shared";
import { api, mensajeError } from "../api";
import { useAuth } from "../auth";
import { ETIQUETA_COTIZACION } from "./Cotizaciones";
import { ETIQUETA_ESTADO } from "./Clientes";

type Periodo = "mes" | "trimestre" | "anio";

const ETIQUETA_PERIODO: Record<Periodo, string> = {
  mes: "Este mes",
  trimestre: "Últimos 3 meses",
  anio: "Este año",
};

/** Colores de los estados, alineados con las insignias (ALCANCE 4.12). */
const COLOR_COTIZACION: Record<string, string> = {
  BORRADOR: "#9aa0a6",
  ENVIADA: "#3b82f6",
  APROBADA: "#22a55b",
  RECHAZADA: "#e5484d",
  VENCIDA: "#f59e0b",
};

const COLOR_CLIENTE: Record<string, string> = {
  EN_REVISION: "#eab308",
  EN_PROCESO: "#3b82f6",
  ACTIVO: "#22a55b",
  SUSPENDIDO: "#e5484d",
  FINALIZADO: "#9aa0a6",
};

interface Resumen {
  periodo: { tipo: Periodo; desde: string; hasta: string };
  clientes: {
    total: number;
    nuevosEnPeriodo: number;
    datosFiscalesPendientes: number;
    porEstado: Record<string, number>;
  };
  cotizaciones?: {
    alcance: "empresa" | "propias";
    pipeline: Record<string, { cantidad: number; montoCentavos: number }>;
    creadasEnPeriodo: number;
    aprobadoCentavos: number;
    aprobadasEnPeriodo: number;
    rechazadasEnPeriodo: number;
    tasaAprobacion: number | null;
    pendienteCentavos: number;
    pendientesVigentes: number;
    porVencer: Array<{ id: string; folio: string; totalCentavos: number; vigenciaHasta: string; cliente: { id: string; nombre: string } }>;
    pendientesAutorizar: Array<{ id: string; folio: string; totalCentavos: number; vigenciaHasta: string; cliente: { id: string; nombre: string } }>;
  };
  tendencia?: Array<{ mes: string; enviadas: number; enviadoCentavos: number; aprobadas: number; aprobadoCentavos: number }>;
}

const aPesos = (centavos: number) => centavos / 100;

function Indicador({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="indicador">
      <span className="indicador-titulo">{titulo}</span>
      <strong className="indicador-valor">{valor}</strong>
      {nota && <small>{nota}</small>}
    </div>
  );
}

/** Pantalla de inicio: indicadores y gráficas según el rol (ALCANCE 4.8). El backend filtra los datos. */
export function Inicio() {
  const { sesion } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Resumen>(`/api/dashboard?periodo=${periodo}`)
      .then((r) => {
        setResumen(r);
        setError(null);
      })
      .catch((e) => setError(mensajeError(e)));
  }, [periodo]);

  if (error) return <p className="error">{error}</p>;
  if (!resumen) return <p>Cargando indicadores…</p>;

  const cot = resumen.cotizaciones;
  const pipelineData = cot
    ? Object.entries(cot.pipeline).map(([estado, v]) => ({
        estado: ETIQUETA_COTIZACION[estado] ?? estado,
        clave: estado,
        cantidad: v.cantidad,
      }))
    : [];
  const clientesData = Object.entries(resumen.clientes.porEstado).map(([estado, cantidad]) => ({
    nombre: ETIQUETA_ESTADO[estado as keyof typeof ETIQUETA_ESTADO] ?? estado,
    clave: estado,
    cantidad,
  }));
  const tendenciaData = (resumen.tendencia ?? []).map((t) => ({
    mes: t.mes,
    Enviado: aPesos(t.enviadoCentavos),
    Aprobado: aPesos(t.aprobadoCentavos),
  }));

  return (
    <section>
      <div className="barra">
        <h2>Inicio</h2>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Periodo">
          {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PERIODO[p]}
            </option>
          ))}
        </select>
      </div>
      {cot?.alcance === "propias" && <p>Solo se muestran tus cotizaciones. Los clientes son los de toda la empresa.</p>}

      <div className="indicadores">
        <Indicador titulo="Clientes" valor={String(resumen.clientes.total)} nota={`${resumen.clientes.nuevosEnPeriodo} nuevos en el periodo`} />
        <Indicador titulo="Datos fiscales pendientes" valor={String(resumen.clientes.datosFiscalesPendientes)} nota="Bloquean solo la exportación" />
        {cot && (
          <>
            <Indicador titulo="Cotizaciones creadas" valor={String(cot.creadasEnPeriodo)} nota={`${cot.pendientesVigentes} esperan respuesta`} />
            <Indicador titulo="Esperando respuesta" valor={formatearMXN(cot.pendienteCentavos)} nota={`${cot.pendientesVigentes} vigentes`} />
            <Indicador titulo="Aprobado en el periodo" valor={formatearMXN(cot.aprobadoCentavos)} nota={`${cot.aprobadasEnPeriodo} cotizaciones`} />
            <Indicador
              titulo="Tasa de aprobación"
              valor={cot.tasaAprobacion === null ? "—" : `${cot.tasaAprobacion} %`}
              nota={`${cot.aprobadasEnPeriodo} aprobadas · ${cot.rechazadasEnPeriodo} rechazadas`}
            />
          </>
        )}
      </div>

      {cot && (
        <div className="graficas">
          <div className="tarjeta">
            <h3>Cotizaciones por estado</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="estado" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="cantidad" name="Cotizaciones">
                  {pipelineData.map((d) => (
                    <Cell key={d.clave} fill={COLOR_COTIZACION[d.clave] ?? "#9aa0a6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="tarjeta">
            <h3>Clientes por estado</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={clientesData} dataKey="cantidad" nameKey="nombre" innerRadius={50} outerRadius={85} label>
                  {clientesData.map((d) => (
                    <Cell key={d.clave} fill={COLOR_CLIENTE[d.clave] ?? "#9aa0a6"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="tarjeta grafica-ancha">
            <h3>Enviado contra aprobado, últimos 6 meses (MXN)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tendenciaData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatearMXN(Math.round(v * 100))} />
                <Legend />
                <Bar dataKey="Enviado" fill="#3b82f6" />
                <Bar dataKey="Aprobado" fill="#22a55b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {cot && (
        <div className="listas">
          <div className="tarjeta">
            <h3>Por vencer en 7 días</h3>
            {cot.porVencer.length === 0 ? (
              <p>Ninguna cotización vence pronto.</p>
            ) : (
              <ul className="lista-simple">
                {cot.porVencer.map((c) => (
                  <li key={c.id}>
                    <Link to={`/cotizaciones/${c.id}`}>{c.folio}</Link> · {c.cliente.nombre} · {formatearMXN(c.totalCentavos)} · vence{" "}
                    {new Date(c.vigenciaHasta).toLocaleDateString("es-MX")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(sesion?.usuario.rol === "ADMIN" || sesion?.usuario.rol === "DIRECCION") && (
            <div className="tarjeta">
              <h3>Pendientes de autorizar</h3>
              {cot.pendientesAutorizar.length === 0 ? (
                <p>No hay cotizaciones esperando tu decisión.</p>
              ) : (
                <ul className="lista-simple">
                  {cot.pendientesAutorizar.map((c) => (
                    <li key={c.id}>
                      <Link to={`/cotizaciones/${c.id}`}>{c.folio}</Link> · {c.cliente.nombre} · {formatearMXN(c.totalCentavos)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
