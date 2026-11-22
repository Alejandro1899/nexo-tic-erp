import { Router } from "express";
import { ClienteActualizarSchema, ClienteCrearSchema, ClienteServicioSchema, datosFiscalesPendientes } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { prisma } from "../../lib/db.js";
import { HttpError, traducirErrorPrisma } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const clientesRouter = Router();

// Lectura: cualquier rol. Alta y edición y estado: ADMIN y DIRECCION. Eliminar: solo ADMIN.
clientesRouter.use(requireAuth);

const ESTADOS = ["EN_REVISION", "EN_PROCESO", "ACTIVO", "SUSPENDIDO", "FINALIZADO"] as const;

clientesRouter.get(
  "/",
  ruta(async (req, res) => {
    sesionDe(res);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const estado = typeof req.query.estado === "string" ? req.query.estado : "";
    const clientes = await prisma.cliente.findMany({
      where: {
        eliminadoEn: null,
        ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
        ...((ESTADOS as readonly string[]).includes(estado) ? { estado: estado as (typeof ESTADOS)[number] } : {}),
      },
      orderBy: { nombre: "asc" },
      take: 200,
    });
    res.json({ clientes });
  }),
);

clientesRouter.get(
  "/:id",
  ruta(async (req, res) => {
    sesionDe(res);
    const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, eliminadoEn: null } });
    if (!cliente) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    res.json({ cliente });
  }),
);

clientesRouter.post(
  "/",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = ClienteCrearSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const datos = parsed.data;
    try {
      const cliente = await prisma.cliente.create({
        data: {
          ...datos,
          estado: "EN_REVISION",
          datosFiscalesPendientes: datosFiscalesPendientes(datos),
          creadoPorId: usuarioId,
        },
      });
      res.status(201).json({ cliente });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

clientesRouter.patch(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const parsed = ClienteActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const actual = await prisma.cliente.findFirst({ where: { id: req.params.id, eliminadoEn: null } });
    if (!actual) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    try {
      const cliente = await prisma.cliente.update({
        where: { id: actual.id },
        data: {
          ...parsed.data,
          datosFiscalesPendientes: datosFiscalesPendientes({ ...actual, ...parsed.data }),
        },
      });
      res.json({ cliente });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

/** Borrado lógico: el cliente deja de aparecer, pero se conserva el historial. */
clientesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    sesionDe(res);
    const { count } = await prisma.cliente.updateMany({
      where: { id: req.params.id, eliminadoEn: null },
      data: { eliminadoEn: new Date() },
    });
    if (count === 0) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    res.status(204).end();
  }),
);

/** Servicios asignados a un cliente, con su tarifa propia o la del catálogo. Lectura: todos los roles. */
clientesRouter.get(
  "/:id/servicios",
  ruta(async (req, res) => {
    sesionDe(res);
    const id = String(req.params.id);
    const cliente = await prisma.cliente.findFirst({ where: { id, eliminadoEn: null } });
    if (!cliente) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    const asignaciones = await prisma.clienteServicio.findMany({
      where: { clienteId: id, eliminadoEn: null, servicio: { eliminadoEn: null } },
      include: { servicio: { include: { categoria: { select: { id: true, nombre: true } } } } },
      orderBy: { servicio: { nombre: "asc" } },
    });
    res.json({
      servicios: asignaciones.map((a) => ({
        id: a.servicio.id,
        nombre: a.servicio.nombre,
        categoria: a.servicio.categoria,
        unidad: a.servicio.unidad,
        tarifaCatalogoCentavos: a.servicio.tarifaCentavos,
        tarifaCentavos: a.tarifaCentavos,
        tarifaEfectivaCentavos: a.tarifaCentavos ?? a.servicio.tarifaCentavos,
      })),
    });
  }),
);

/** Asigna un servicio al cliente. Si ya estaba asignado (aunque se haya quitado), lo reactiva y actualiza la tarifa. */
clientesRouter.post(
  "/:id/servicios",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const clienteId = String(req.params.id);
    const parsed = ClienteServicioSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, eliminadoEn: null } });
    if (!cliente) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    const servicio = await prisma.servicio.findFirst({ where: { id: parsed.data.servicioId, eliminadoEn: null, activo: true } });
    if (!servicio) throw new HttpError(400, "servicio_invalido", "El servicio no existe o está inactivo");

    const tarifaCentavos = parsed.data.tarifaCentavos ?? null;
    await prisma.clienteServicio.upsert({
      where: { clienteId_servicioId: { clienteId, servicioId: servicio.id } },
      create: { clienteId, servicioId: servicio.id, tarifaCentavos, creadoPorId: usuarioId },
      update: { tarifaCentavos, eliminadoEn: null },
    });
    res.status(201).json({ servicioId: servicio.id });
  }),
);

/** Quita un servicio del cliente (borrado lógico). */
clientesRouter.delete(
  "/:id/servicios/:servicioId",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const { count } = await prisma.clienteServicio.updateMany({
      where: { clienteId: String(req.params.id), servicioId: String(req.params.servicioId), eliminadoEn: null },
      data: { eliminadoEn: new Date() },
    });
    if (count === 0) throw new HttpError(404, "no_encontrado", "El servicio no está asignado a este cliente");
    res.status(204).end();
  }),
);
