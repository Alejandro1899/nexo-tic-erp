/** Clientes, contactos y servicios asignados. Borrado lógico (eliminadoEn); el folio del cliente se genera aquí, en el servidor. */
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
  ClienteActualizarSchema,
  ClienteCrearSchema,
  ClienteServicioSchema,
  ContactoActualizarSchema,
  ContactoCrearSchema,
  datosFiscalesPendientes,
} from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { CAMPOS_CLAVE, diferencias, registrarActividad } from "../../lib/bitacora.js";
import { prisma } from "../../lib/db.js";
import { HttpError, traducirErrorPrisma } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const clientesRouter = Router();

// Lectura: cualquier rol. Alta y edición y estado: ADMIN y DIRECCION. Eliminar: solo ADMIN.
clientesRouter.use(requireAuth);

const ESTADOS = ["EN_REVISION", "EN_PROCESO", "ACTIVO", "SUSPENDIDO", "FINALIZADO"] as const;

/** Folio de cliente: CLI-0001. Consecutivo global (se guarda con año 0 para no depender del año). */
export async function siguienteFolioCliente(tx: Prisma.TransactionClient): Promise<string> {
  const consecutivo = await tx.consecutivo.upsert({
    where: { tipo_anio: { tipo: "CLI", anio: 0 } },
    create: { tipo: "CLI", anio: 0, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return `CLI-${String(consecutivo.valor).padStart(4, "0")}`;
}

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
      // El folio y el alta van en la misma transacción para que no se repita un número.
      const cliente = await prisma.$transaction(async (tx) => {
        const folio = await siguienteFolioCliente(tx);
        return tx.cliente.create({
          data: {
            ...datos,
            folio,
            estado: "EN_REVISION",
            datosFiscalesPendientes: datosFiscalesPendientes(datos),
            creadoPorId: usuarioId,
          },
        });
      });
      await registrarActividad({
        usuarioId,
        accion: "cliente.crear",
        entidad: "cliente",
        entidadId: cliente.id,
        resumen: `Creó al cliente ${cliente.nombre}`,
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
    const { usuarioId } = sesionDe(res);
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
      const cambios = diferencias(actual, cliente, CAMPOS_CLAVE.cliente);
      if (cambios) {
        await registrarActividad({
          usuarioId,
          accion: "cliente.editar",
          entidad: "cliente",
          entidadId: cliente.id,
          resumen: `Editó al cliente ${cliente.nombre}`,
          cambios,
        });
      }
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
    const { usuarioId } = sesionDe(res);
    const actual = await prisma.cliente.findFirst({ where: { id: String(req.params.id), eliminadoEn: null } });
    if (!actual) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
    await prisma.cliente.update({ where: { id: actual.id }, data: { eliminadoEn: new Date() } });
    await registrarActividad({
      usuarioId,
      accion: "cliente.eliminar",
      entidad: "cliente",
      entidadId: actual.id,
      resumen: `Eliminó (lógicamente) al cliente ${actual.nombre}`,
    });
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
    await registrarActividad({
      usuarioId,
      accion: "cliente.servicio.asignar",
      entidad: "cliente",
      entidadId: clienteId,
      resumen: `Asignó "${servicio.nombre}" a ${cliente.nombre}${tarifaCentavos === null ? "" : " con tarifa propia"}`,
    });
    res.status(201).json({ servicioId: servicio.id });
  }),
);

/** Quita un servicio del cliente (borrado lógico). */
clientesRouter.delete(
  "/:id/servicios/:servicioId",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const asignacion = await prisma.clienteServicio.findFirst({
      where: { clienteId: String(req.params.id), servicioId: String(req.params.servicioId), eliminadoEn: null },
      include: { servicio: { select: { nombre: true } }, cliente: { select: { nombre: true } } },
    });
    if (!asignacion) throw new HttpError(404, "no_encontrado", "El servicio no está asignado a este cliente");
    await prisma.clienteServicio.update({ where: { id: asignacion.id }, data: { eliminadoEn: new Date() } });
    await registrarActividad({
      usuarioId,
      accion: "cliente.servicio.quitar",
      entidad: "cliente",
      entidadId: asignacion.clienteId,
      resumen: `Quitó "${asignacion.servicio.nombre}" de ${asignacion.cliente.nombre}`,
    });
    res.status(204).end();
  }),
);

async function clienteActivoOFallar(id: string): Promise<void> {
  const cliente = await prisma.cliente.findFirst({ where: { id, eliminadoEn: null }, select: { id: true } });
  if (!cliente) throw new HttpError(404, "no_encontrado", "Cliente no encontrado");
}

async function contactoDelClienteOFallar(clienteId: string, contactoId: string) {
  const contacto = await prisma.contacto.findFirst({ where: { id: contactoId, clienteId, eliminadoEn: null } });
  if (!contacto) throw new HttpError(404, "no_encontrado", "Contacto no encontrado");
  return contacto;
}

/** Contactos de un cliente, principal primero. Lectura: todos los roles. */
clientesRouter.get(
  "/:id/contactos",
  ruta(async (req, res) => {
    sesionDe(res);
    const clienteId = String(req.params.id);
    await clienteActivoOFallar(clienteId);
    const contactos = await prisma.contacto.findMany({
      where: { clienteId, eliminadoEn: null },
      orderBy: [{ esPrincipal: "desc" }, { nombre: "asc" }],
    });
    res.json({ contactos });
  }),
);

/** Alta de contacto. El primero del cliente es principal automáticamente; si se marca principal, el anterior deja de serlo. */
clientesRouter.post(
  "/:id/contactos",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const clienteId = String(req.params.id);
    const parsed = ContactoCrearSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    await clienteActivoOFallar(clienteId);
    const contacto = await prisma.$transaction(async (tx) => {
      const existentes = await tx.contacto.count({ where: { clienteId, eliminadoEn: null } });
      const seraPrincipal = parsed.data.esPrincipal === true || existentes === 0;
      if (seraPrincipal) {
        await tx.contacto.updateMany({ where: { clienteId, eliminadoEn: null, esPrincipal: true }, data: { esPrincipal: false } });
      }
      return tx.contacto.create({
        data: { ...parsed.data, clienteId, esPrincipal: seraPrincipal, creadoPorId: usuarioId },
      });
    });
    res.status(201).json({ contacto });
  }),
);

/** Edición de contacto. No se puede quitar el principal directamente: se marca otro como principal. */
clientesRouter.patch(
  "/:id/contactos/:contactoId",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const clienteId = String(req.params.id);
    const contactoId = String(req.params.contactoId);
    const parsed = ContactoActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const actual = await contactoDelClienteOFallar(clienteId, contactoId);
    if (parsed.data.esPrincipal === false && actual.esPrincipal) {
      throw new HttpError(400, "principal_requerido", "Marca otro contacto como principal antes de quitar este");
    }
    const contacto = await prisma.$transaction(async (tx) => {
      if (parsed.data.esPrincipal === true) {
        await tx.contacto.updateMany({
          where: { clienteId, eliminadoEn: null, esPrincipal: true, NOT: { id: contactoId } },
          data: { esPrincipal: false },
        });
      }
      return tx.contacto.update({ where: { id: contactoId }, data: parsed.data });
    });
    res.json({ contacto });
  }),
);

/** Borrado lógico de contacto. Si era el principal, el contacto más antiguo pasa a ser principal. */
clientesRouter.delete(
  "/:id/contactos/:contactoId",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const clienteId = String(req.params.id);
    const contactoId = String(req.params.contactoId);
    const actual = await contactoDelClienteOFallar(clienteId, contactoId);
    await prisma.$transaction(async (tx) => {
      await tx.contacto.update({ where: { id: contactoId }, data: { eliminadoEn: new Date(), esPrincipal: false } });
      if (actual.esPrincipal) {
        const siguiente = await tx.contacto.findFirst({
          where: { clienteId, eliminadoEn: null },
          orderBy: { creadoEn: "asc" },
        });
        if (siguiente) await tx.contacto.update({ where: { id: siguiente.id }, data: { esPrincipal: true } });
      }
    });
    res.status(204).end();
  }),
);
