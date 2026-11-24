/** Indicadores por rol. El servidor decide qué datos salen: VENDEDOR solo ve sus cotizaciones y TECNICO no ve cotizaciones. */
import { Router } from "express";
import { ruta } from "../../lib/async.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { sesionDe } from "../../middleware/roles.js";
import { claveMes, inicioPeriodo, mesesTendencia, PERIODOS, type Periodo } from "./periodos.js";

/**
 * Dashboard de inicio (ALCANCE 4.8, en forma de indicadores).
 *  - ADMIN y DIRECCION ven toda la empresa.
 *  - VENDEDOR ve solo sus cotizaciones; los clientes son comunes para todos.
 *  - TECNICO no ve cotizaciones: su tablero trae solo clientes.
 *  - Todos los montos salen en centavos enteros.
 */
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const ESTADOS = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"] as const;
const DIAS_POR_VENCER = 7;
const LIMITE_LISTA = 10;

dashboardRouter.get(
  "/",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const solicitado = typeof req.query.periodo === "string" ? req.query.periodo : "mes";
    if (!(PERIODOS as string[]).includes(solicitado)) {
      throw new HttpError(400, "periodo_invalido", "El periodo debe ser mes, trimestre o anio");
    }
    const periodo = solicitado as Periodo;
    const ahora = new Date();
    const desde = inicioPeriodo(periodo, ahora);
    const meses = mesesTendencia(ahora);
    const inicioTendencia = meses[0]!.inicio;

    const puedeVerCotizaciones = sesion.rol !== "TECNICO";
    const soloMias = sesion.rol === "VENDEDOR";
    const alcance = soloMias ? { creadoPorId: sesion.usuarioId } : {};
    const ahoraMas = new Date(ahora.getTime() + DIAS_POR_VENCER * 24 * 60 * 60 * 1000);
    const base = { eliminadoEn: null, ...alcance };

    // Clientes: iguales para todos los roles.
    const [clientesPorEstado, clientesNuevos, fiscalesPendientes] = await Promise.all([
      prisma.cliente.groupBy({ by: ["estado"], where: { eliminadoEn: null }, _count: { _all: true } }),
      prisma.cliente.count({ where: { eliminadoEn: null, creadoEn: { gte: desde } } }),
      prisma.cliente.count({ where: { eliminadoEn: null, datosFiscalesPendientes: true } }),
    ]);
    const clientes = {
      total: clientesPorEstado.reduce((n, g) => n + g._count._all, 0),
      nuevosEnPeriodo: clientesNuevos,
      datosFiscalesPendientes: fiscalesPendientes,
      porEstado: Object.fromEntries(clientesPorEstado.map((g) => [g.estado, g._count._all])),
    };

    if (!puedeVerCotizaciones) {
      res.json({ periodo: { tipo: periodo, desde, hasta: ahora }, clientes });
      return;
    }

    // Cotizaciones del periodo: pipeline por estado (según cuándo se crearon).
    const delPeriodo = await prisma.cotizacion.findMany({
      where: { ...base, creadoEn: { gte: desde } },
      select: { estado: true, totalCentavos: true, vigenciaHasta: true },
    });
    const pipeline = Object.fromEntries(ESTADOS.map((e) => [e, { cantidad: 0, montoCentavos: 0 }]));
    let vencidasPeriodo = 0;
    for (const c of delPeriodo) {
      const vencida = c.estado === "ENVIADA" && c.vigenciaHasta < ahora;
      if (vencida) vencidasPeriodo++;
      const clave = c.estado as (typeof ESTADOS)[number];
      if (pipeline[clave]) {
        pipeline[clave].cantidad++;
        pipeline[clave].montoCentavos += c.totalCentavos;
      }
    }

    // Aprobado y tasa de decisión: según cuándo se autorizaron en el periodo.
    const decididas = await prisma.cotizacion.findMany({
      where: { ...base, autorizadaEn: { gte: desde } },
      select: { estado: true, totalCentavos: true },
    });
    const aprobadas = decididas.filter((c) => c.estado === "APROBADA");
    const rechazadas = decididas.filter((c) => c.estado === "RECHAZADA");
    const aprobadoCentavos = aprobadas.reduce((n, c) => n + c.totalCentavos, 0);
    const tasaAprobacion = aprobadas.length + rechazadas.length
      ? Math.round((aprobadas.length / (aprobadas.length + rechazadas.length)) * 100)
      : null;

    // Estado actual: enviadas vigentes (esperan respuesta) y por vencer.
    const enviadasVigentes = await prisma.cotizacion.findMany({
      where: { ...base, estado: "ENVIADA", vigenciaHasta: { gte: ahora } },
      select: { id: true, folio: true, totalCentavos: true, vigenciaHasta: true, cliente: { select: { id: true, nombre: true } } },
      orderBy: { vigenciaHasta: "asc" },
    });
    const pendientesMonto = enviadasVigentes.reduce((n, c) => n + c.totalCentavos, 0);
    const porVencer = enviadasVigentes.filter((c) => c.vigenciaHasta <= ahoraMas).slice(0, LIMITE_LISTA);

    // Tendencia de seis meses: enviadas por mes de envío y aprobadas por mes de autorización.
    const movimientos = await prisma.cotizacion.findMany({
      where: {
        ...base,
        OR: [{ enviadaEn: { gte: inicioTendencia } }, { autorizadaEn: { gte: inicioTendencia } }],
      },
      select: { estado: true, totalCentavos: true, enviadaEn: true, autorizadaEn: true },
    });
    const tendencia = meses.map((m) => {
      const enviado = movimientos.filter((c) => claveMes(c.enviadaEn) === m.clave);
      const aprobado = movimientos.filter((c) => c.estado === "APROBADA" && claveMes(c.autorizadaEn) === m.clave);
      return {
        mes: m.clave,
        enviadas: enviado.length,
        enviadoCentavos: enviado.reduce((n, c) => n + c.totalCentavos, 0),
        aprobadas: aprobado.length,
        aprobadoCentavos: aprobado.reduce((n, c) => n + c.totalCentavos, 0),
      };
    });

    // Autorizar: solo DIRECCION y ADMIN ven la cola pendiente.
    const pendientesAutorizar =
      sesion.rol === "ADMIN" || sesion.rol === "DIRECCION"
        ? enviadasVigentes.slice(0, LIMITE_LISTA)
        : [];

    res.json({
      periodo: { tipo: periodo, desde, hasta: ahora },
      clientes,
      cotizaciones: {
        alcance: soloMias ? "propias" : "empresa",
        pipeline: { ...pipeline, VENCIDA: { cantidad: vencidasPeriodo, montoCentavos: 0 } },
        creadasEnPeriodo: delPeriodo.length,
        aprobadoCentavos,
        aprobadasEnPeriodo: aprobadas.length,
        rechazadasEnPeriodo: rechazadas.length,
        tasaAprobacion,
        pendienteCentavos: pendientesMonto,
        pendientesVigentes: enviadasVigentes.length,
        porVencer,
        pendientesAutorizar,
      },
      tendencia,
    });
  }),
);
