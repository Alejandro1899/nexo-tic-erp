import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

/**
 * Bitácora de actividad (ALCANCE 4.13). Solo se agrega: este módulo no edita ni borra registros.
 * La purga y la importación viven en las rutas de /api/actividad, solo para ADMIN.
 */

export type ValorCambio = { antes: unknown; despues: unknown };
export type Cambios = Record<string, ValorCambio>;

export interface EventoBitacora {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  resumen: string;
  cambios?: Cambios | null;
}

/** Campos que se comparan al editar. Solo estos llegan a la bitácora: nunca contraseñas ni copias completas. */
export const CAMPOS_CLAVE = {
  cliente: ["nombre", "tipo", "estado", "rfc", "razonSocial", "regimenFiscal", "codigoPostal"],
  cotizacion: ["estado", "vigenciaHasta", "anticipoPb", "totalCentavos", "notas"],
  usuario: ["nombre", "username", "email", "rol", "activo"],
  servicio: ["nombre", "unidad", "tarifaCentavos", "activo", "categoriaId"],
  configuracion: ["nombreComercial", "razonSocial", "rfc", "condicionesCotizacion", "vigenciaDiasDefault", "prefijoFolioCotizacion", "correo", "telefono"],
} as const;

/** Devuelve solo los campos clave que cambiaron, con su valor anterior y el nuevo. */
export function diferencias(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  campos: readonly string[],
): Cambios | null {
  const cambios: Cambios = {};
  for (const campo of campos) {
    const a = antes[campo] instanceof Date ? (antes[campo] as Date).toISOString() : antes[campo] ?? null;
    const d = despues[campo] instanceof Date ? (despues[campo] as Date).toISOString() : despues[campo] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(d)) cambios[campo] = { antes: a, despues: d };
  }
  return Object.keys(cambios).length ? cambios : null;
}

/** Registra un evento. Si la acción falla, el error se propaga: nada se pierde en silencio. */
export async function registrarActividad(evento: EventoBitacora, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  let usuarioNombre = "Sistema";
  if (evento.usuarioId) {
    const u = await db.usuario.findUnique({ where: { id: evento.usuarioId }, select: { nombre: true } });
    usuarioNombre = u?.nombre ?? "Usuario eliminado";
  }
  await db.registroActividad.create({
    data: {
      usuarioId: evento.usuarioId,
      usuarioNombre,
      accion: evento.accion,
      entidad: evento.entidad,
      entidadId: evento.entidadId ?? null,
      resumen: evento.resumen,
      cambios: (evento.cambios ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
