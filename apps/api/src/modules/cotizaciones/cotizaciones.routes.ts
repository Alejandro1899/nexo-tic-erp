import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
  CotizacionActualizarSchema,
  CotizacionCambiarEstadoSchema,
  CotizacionCrearSchema,
  TRANSICIONES_MANUALES,
  type CotizacionPartida,
} from "@nexo/shared";
import { aplicarTasaPb, calcularAnticipo, calcularTotales, importeLinea } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { CAMPOS_CLAVE, diferencias, registrarActividad } from "../../lib/bitacora.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe, type SesionAutenticada } from "../../middleware/roles.js";

/**
 * Cotizaciones (ALCANCE 4.3).
 *  - Crean y consultan: ADMIN, DIRECCION y VENDEDOR. TECNICO no ve cotizaciones.
 *  - Editan, envían y eliminan: quien la creó (mientras sea borrador), ADMIN y DIRECCION.
 *  - Aprueban o rechazan: ADMIN y DIRECCION, solo las enviadas y vigentes.
 *  - El precio de un servicio del catálogo sale del servidor (tarifa del cliente o del catálogo),
 *    nunca del cuerpo de la petición. Solo las partidas libres llevan precio.
 *  - Costos, utilidad y margen: solo ADMIN y DIRECCION. Las demás respuestas no los incluyen.
 *  - Anticipo: porcentaje sobre el total con IVA, visible para todos los que ven la cotización.
 */
export const cotizacionesRouter = Router();

cotizacionesRouter.use(requireAuth, requireRole("ADMIN", "DIRECCION", "VENDEDOR"));

type Lineas = Awaited<ReturnType<typeof calcularPartidas>>;

function puedeVerCostos(rol: SesionAutenticada["rol"]): boolean {
  return rol === "ADMIN" || rol === "DIRECCION";
}

/** Llave para reconocer una partida entre versiones de la misma cotización. */
function claveLinea(p: { servicioId?: string | null; descripcion?: string | null }): string {
  return `${p.servicioId ?? ""}|${p.servicioId ? "" : (p.descripcion ?? "")}`;
}

/**
 * Calcula cada partida con precios del servidor. El costo viene de `costos` (ya filtrado por rol).
 * Un servicio del catálogo sale del catálogo o de la tarifa del cliente; una libre usa su precio.
 */
async function calcularPartidas(partidas: CotizacionPartida[], clienteId: string, costos: Array<number | null>) {
  const ids = partidas.map((p) => p.servicioId).filter((id): id is string => Boolean(id));
  const servicios = ids.length
    ? await prisma.servicio.findMany({ where: { id: { in: ids }, eliminadoEn: null, activo: true } })
    : [];
  const asignaciones = ids.length
    ? await prisma.clienteServicio.findMany({ where: { clienteId, servicioId: { in: ids }, eliminadoEn: null } })
    : [];
  const porServicio = new Map(servicios.map((s) => [s.id, s]));
  const tarifaDeCliente = new Map(asignaciones.map((a) => [a.servicioId, a.tarifaCentavos]));

  return partidas.map((p, i) => {
    let descripcion: string;
    let precio: number;
    if (p.servicioId) {
      const servicio = porServicio.get(p.servicioId);
      if (!servicio) {
        throw new HttpError(400, "servicio_invalido", `La partida ${i + 1} usa un servicio que no existe o está inactivo`);
      }
      descripcion = servicio.nombre;
      precio = tarifaDeCliente.get(servicio.id) ?? servicio.tarifaCentavos;
    } else {
      descripcion = p.descripcion ?? "";
      precio = p.precioUnitarioCentavos ?? 0;
    }
    const importe = importeLinea(precio, p.cantidadMilesimas);
    return {
      orden: i + 1,
      servicioId: p.servicioId ?? null,
      descripcion,
      cantidadMilesimas: p.cantidadMilesimas,
      precioUnitarioCentavos: precio,
      descuentoPb: p.descuentoPb,
      importeCentavos: importe,
      descuentoCentavos: aplicarTasaPb(importe, p.descuentoPb),
      costoUnitarioCentavos: costos[i] ?? null,
    };
  });
}

function totalesDe(lineas: Lineas) {
  return calcularTotales(
    lineas.map((l) => ({
      precioUnitarioCentavos: l.precioUnitarioCentavos,
      cantidadMilesimas: l.cantidadMilesimas,
      descuentoPb: l.descuentoPb,
    })),
  );
}

/** Fecha de vencimiento de una cotización a partir de hoy. */
function vencimientoEn(dias: number): Date {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
}

/**
 * Folio consecutivo por año: COT-2026-0001 (el prefijo lo define la configuración de la empresa).
 * El contador es el mismo aunque cambie el prefijo. Se llama dentro de una transacción.
 */
async function siguienteFolio(tx: Prisma.TransactionClient): Promise<string> {
  const anio = new Date().getFullYear();
  const consecutivo = await tx.consecutivo.upsert({
    where: { tipo_anio: { tipo: "COT", anio } },
    create: { tipo: "COT", anio, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const config = await tx.configuracionEmpresa.findUnique({ where: { id: "empresa" }, select: { prefijoFolioCotizacion: true } });
  const prefijo = config?.prefijoFolioCotizacion ?? "COT";
  return `${prefijo}-${anio}-${String(consecutivo.valor).padStart(4, "0")}`;
}

/** Estado que se muestra: una enviada cuya vigencia ya pasó se muestra como vencida. */
function estadoMostrado(c: { estado: string; vigenciaHasta: Date }): string {
  return c.estado === "ENVIADA" && c.vigenciaHasta < new Date() ? "VENCIDA" : c.estado;
}

/** Puede gestionar la cotización: quien la creó, o ADMIN y DIRECCION. */
function puedeGestionar(sesion: SesionAutenticada, creadoPorId: string | null): boolean {
  return sesion.rol === "ADMIN" || sesion.rol === "DIRECCION" || creadoPorId === sesion.usuarioId;
}

async function cotizacionVigente(id: string) {
  const cotizacion = await prisma.cotizacion.findFirst({ where: { id, eliminadoEn: null } });
  if (!cotizacion) throw new HttpError(404, "no_encontrado", "Cotización no encontrada");
  return cotizacion;
}

const incluirDetalle = {
  cliente: { select: { id: true, nombre: true } },
  partidas: { orderBy: { orden: "asc" as const } },
};

type CotizacionConDetalle = Prisma.CotizacionGetPayload<{ include: typeof incluirDetalle }>;

/**
 * Vista de una cotización para quien la pide. El anticipo se calcula aquí sobre el total con IVA.
 * Los costos, la utilidad y el margen solo se agregan para ADMIN y DIRECCION.
 */
function vistaCotizacion(c: CotizacionConDetalle, rol: SesionAutenticada["rol"]) {
  const { anticipoCentavos, saldoCentavos } = calcularAnticipo(c.totalCentavos, c.anticipoPb);
  const comun = { ...c, estadoMostrado: estadoMostrado(c), anticipoCentavos, saldoCentavos };
  if (!puedeVerCostos(rol)) {
    return { ...comun, partidas: c.partidas.map(({ costoUnitarioCentavos: _costo, ...p }) => p) };
  }
  const conCosto = c.partidas.every((p) => p.costoUnitarioCentavos !== null);
  const costoTotal = conCosto
    ? c.partidas.reduce((suma, p) => suma + importeLinea(p.costoUnitarioCentavos ?? 0, p.cantidadMilesimas), 0)
    : null;
  const baseSinIva = c.subtotalCentavos - c.descuentoCentavos;
  const utilidad = costoTotal === null ? null : baseSinIva - costoTotal;
  const margenPb = utilidad === null || baseSinIva <= 0 ? null : Math.round((utilidad * 10000) / baseSinIva);
  return { ...comun, costoTotalCentavos: costoTotal, utilidadCentavos: utilidad, margenPb };
}

/** Costos de cada partida según el rol: ADMIN y DIRECCION los envían; los demás no pueden enviarlos. */
function costosDeEntrada(partidas: CotizacionPartida[], rol: SesionAutenticada["rol"]): Array<number | null> {
  return partidas.map((p) => p.costoUnitarioCentavos ?? null).map((c) => (puedeVerCostos(rol) ? c : null));
}

function rechazarCostosDeNoAdmin(partidas: CotizacionPartida[], rol: SesionAutenticada["rol"]) {
  if (!puedeVerCostos(rol) && partidas.some((p) => p.costoUnitarioCentavos !== undefined && p.costoUnitarioCentavos !== null)) {
    throw new HttpError(403, "prohibido", "Solo ADMIN o DIRECCION pueden registrar costos");
  }
}

cotizacionesRouter.get(
  "/",
  ruta(async (req, res) => {
    sesionDe(res);
    const estado = typeof req.query.estado === "string" ? req.query.estado : "";
    const clienteId = typeof req.query.clienteId === "string" ? req.query.clienteId : "";
    const cotizaciones = await prisma.cotizacion.findMany({
      where: {
        eliminadoEn: null,
        ...(estado ? { estado: estado as "BORRADOR" | "ENVIADA" | "APROBADA" | "RECHAZADA" } : {}),
        ...(clienteId ? { clienteId } : {}),
      },
      include: { cliente: { select: { id: true, nombre: true } } },
      orderBy: { creadoEn: "desc" },
      take: 200,
    });
    res.json({
      cotizaciones: cotizaciones.map((c) => {
        const { anticipoCentavos, saldoCentavos } = calcularAnticipo(c.totalCentavos, c.anticipoPb);
        return { ...c, estadoMostrado: estadoMostrado(c), anticipoCentavos, saldoCentavos };
      }),
    });
  }),
);

cotizacionesRouter.get(
  "/:id",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const cotizacion = await prisma.cotizacion.findFirst({
      where: { id: String(req.params.id), eliminadoEn: null },
      include: incluirDetalle,
    });
    if (!cotizacion) throw new HttpError(404, "no_encontrado", "Cotización no encontrada");
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

cotizacionesRouter.post(
  "/",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const parsed = CotizacionCrearSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    rechazarCostosDeNoAdmin(parsed.data.partidas, sesion.rol);
    const { clienteId, vigenciaDias, notas, anticipoPb, partidas } = parsed.data;
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, eliminadoEn: null } });
    if (!cliente) throw new HttpError(400, "cliente_invalido", "El cliente no existe");

    const lineas = await calcularPartidas(partidas, clienteId, costosDeEntrada(partidas, sesion.rol));
    const totales = totalesDe(lineas);
    const vigenciaHasta = vencimientoEn(vigenciaDias);

    const cotizacion = await prisma.$transaction(async (tx) => {
      const folio = await siguienteFolio(tx);
      return tx.cotizacion.create({
        data: {
          folio,
          clienteId,
          estado: "BORRADOR",
          vigenciaHasta,
          notas: notas ?? null,
          anticipoPb,
          subtotalCentavos: totales.subtotalCentavos,
          descuentoCentavos: totales.descuentoCentavos,
          ivaCentavos: totales.ivaCentavos,
          totalCentavos: totales.totalCentavos,
          creadoPorId: sesion.usuarioId,
          partidas: { create: lineas },
        },
        include: incluirDetalle,
      });
    });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "cotizacion.crear",
      entidad: "cotizacion",
      entidadId: cotizacion.id,
      resumen: `Creó la cotización ${cotizacion.folio} para ${cotizacion.cliente.nombre}`,
    });
    res.status(201).json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

cotizacionesRouter.patch(
  "/:id",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const actual = await cotizacionVigente(String(req.params.id));
    if (!puedeGestionar(sesion, actual.creadoPorId)) {
      throw new HttpError(403, "prohibido", "Solo quien creó la cotización o un administrador puede editarla");
    }
    if (actual.estado !== "BORRADOR") {
      throw new HttpError(409, "no_editable", "Solo se pueden editar cotizaciones en borrador");
    }
    const parsed = CotizacionActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const { vigenciaDias, notas, anticipoPb, partidas } = parsed.data;
    if (partidas) rechazarCostosDeNoAdmin(partidas, sesion.rol);

    // Quien no es ADMIN ni DIRECCION no ve los costos, así que al editar conserva los de cada partida.
    let costos: Array<number | null> = [];
    if (partidas) {
      if (puedeVerCostos(sesion.rol)) {
        costos = costosDeEntrada(partidas, sesion.rol);
      } else {
        const previas = await prisma.cotizacionPartida.findMany({ where: { cotizacionId: actual.id } });
        const costoPorClave = new Map(previas.map((p) => [claveLinea(p), p.costoUnitarioCentavos]));
        costos = partidas.map((p) => costoPorClave.get(claveLinea(p)) ?? null);
      }
    }
    const lineas = partidas ? await calcularPartidas(partidas, actual.clienteId, costos) : null;
    const totales = lineas ? totalesDe(lineas) : null;

    const cotizacion = await prisma.$transaction(async (tx) => {
      if (lineas) await tx.cotizacionPartida.deleteMany({ where: { cotizacionId: actual.id } });
      return tx.cotizacion.update({
        where: { id: actual.id },
        data: {
          ...(vigenciaDias ? { vigenciaHasta: vencimientoEn(vigenciaDias) } : {}),
          ...(notas !== undefined ? { notas } : {}),
          ...(anticipoPb !== undefined ? { anticipoPb } : {}),
          ...(lineas && totales
            ? {
                subtotalCentavos: totales.subtotalCentavos,
                descuentoCentavos: totales.descuentoCentavos,
                ivaCentavos: totales.ivaCentavos,
                totalCentavos: totales.totalCentavos,
                partidas: { create: lineas },
              }
            : {}),
        },
        include: incluirDetalle,
      });
    });
    const cambios = diferencias(actual, cotizacion, CAMPOS_CLAVE.cotizacion);
    if (cambios) {
      await registrarActividad({
        usuarioId: sesion.usuarioId,
        accion: "cotizacion.editar",
        entidad: "cotizacion",
        entidadId: cotizacion.id,
        resumen: `Editó la cotización ${cotizacion.folio}`,
        cambios,
      });
    }
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

cotizacionesRouter.post(
  "/:id/enviar",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const actual = await cotizacionVigente(String(req.params.id));
    if (!puedeGestionar(sesion, actual.creadoPorId)) {
      throw new HttpError(403, "prohibido", "Solo quien creó la cotización o un administrador puede enviarla");
    }
    if (actual.estado !== "BORRADOR") {
      throw new HttpError(409, "transicion_invalida", "Solo un borrador se puede enviar a autorización");
    }
    const cotizacion = await prisma.cotizacion.update({
      where: { id: actual.id },
      data: { estado: "ENVIADA", enviadaEn: new Date() },
      include: incluirDetalle,
    });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "cotizacion.enviar",
      entidad: "cotizacion",
      entidadId: cotizacion.id,
      resumen: `Envió a autorización la cotización ${cotizacion.folio}`,
      cambios: { estado: { antes: actual.estado, despues: "ENVIADA" } },
    });
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

/** Autorizar o rechazar: solo ADMIN y DIRECCION, sobre cotizaciones enviadas y vigentes. */
async function decidir(id: string, sesion: SesionAutenticada, nuevoEstado: "APROBADA" | "RECHAZADA") {
  if (sesion.rol !== "ADMIN" && sesion.rol !== "DIRECCION") {
    throw new HttpError(403, "prohibido", "Solo ADMIN o DIRECCION pueden autorizar o rechazar cotizaciones");
  }
  const actual = await cotizacionVigente(id);
  if (actual.estado !== "ENVIADA") {
    throw new HttpError(409, "transicion_invalida", "Solo una cotización enviada se puede autorizar o rechazar");
  }
  if (estadoMostrado(actual) === "VENCIDA") {
    throw new HttpError(409, "vencida", "La vigencia de la cotización ya venció; hay que crear una nueva");
  }
  const decidida = await prisma.cotizacion.update({
    where: { id: actual.id },
    data: { estado: nuevoEstado, autorizadaPorId: sesion.usuarioId, autorizadaEn: new Date() },
    include: incluirDetalle,
  });
  await registrarActividad({
    usuarioId: sesion.usuarioId,
    accion: nuevoEstado === "APROBADA" ? "cotizacion.aprobar" : "cotizacion.rechazar",
    entidad: "cotizacion",
    entidadId: decidida.id,
    resumen: `${nuevoEstado === "APROBADA" ? "Aprobó" : "Rechazó"} la cotización ${decidida.folio}`,
    cambios: { estado: { antes: actual.estado, despues: nuevoEstado } },
  });
  return decidida;
}

cotizacionesRouter.post(
  "/:id/aprobar",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const cotizacion = await decidir(String(req.params.id), sesion, "APROBADA");
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

cotizacionesRouter.post(
  "/:id/rechazar",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const cotizacion = await decidir(String(req.params.id), sesion, "RECHAZADA");
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

/**
 * Cambio manual de estado: solo ADMIN y DIRECCION. Permite revertir una aprobada a rechazada o a borrador,
 * y una rechazada a borrador. Al volver a borrador se limpian la fecha de envío y la autorización.
 */
cotizacionesRouter.post(
  "/:id/cambiar-estado",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    if (sesion.rol !== "ADMIN" && sesion.rol !== "DIRECCION") {
      throw new HttpError(403, "prohibido", "Solo ADMIN o DIRECCION pueden cambiar el estado de una cotización");
    }
    const parsed = CotizacionCambiarEstadoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const actual = await cotizacionVigente(String(req.params.id));
    const permitidos = TRANSICIONES_MANUALES[actual.estado] ?? [];
    if (!permitidos.includes(parsed.data.estado)) {
      throw new HttpError(409, "transicion_invalida", `No se puede pasar de ${actual.estado} a ${parsed.data.estado} con este cambio`);
    }
    const nuevo = parsed.data.estado;
    const cotizacion = await prisma.cotizacion.update({
      where: { id: actual.id },
      data:
        nuevo === "BORRADOR"
          ? { estado: "BORRADOR", enviadaEn: null, autorizadaPorId: null, autorizadaEn: null }
          : { estado: "RECHAZADA", autorizadaPorId: sesion.usuarioId, autorizadaEn: new Date() },
      include: incluirDetalle,
    });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "cotizacion.cambiar_estado",
      entidad: "cotizacion",
      entidadId: cotizacion.id,
      resumen: `Cambió el estado de la cotización ${cotizacion.folio} de ${actual.estado} a ${nuevo}`,
      cambios: { estado: { antes: actual.estado, despues: nuevo } },
    });
    res.json({ cotizacion: vistaCotizacion(cotizacion, sesion.rol) });
  }),
);

/** Borrado lógico de borradores. Una cotización ya enviada o decidida se conserva. */
cotizacionesRouter.delete(
  "/:id",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const actual = await cotizacionVigente(String(req.params.id));
    if (!puedeGestionar(sesion, actual.creadoPorId)) {
      throw new HttpError(403, "prohibido", "Solo quien creó la cotización o un administrador puede eliminarla");
    }
    if (actual.estado !== "BORRADOR") {
      throw new HttpError(409, "no_eliminable", "Solo se pueden eliminar borradores");
    }
    await prisma.cotizacion.update({ where: { id: actual.id }, data: { eliminadoEn: new Date() } });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "cotizacion.eliminar",
      entidad: "cotizacion",
      entidadId: actual.id,
      resumen: `Eliminó el borrador ${actual.folio}`,
    });
    res.status(204).end();
  }),
);
