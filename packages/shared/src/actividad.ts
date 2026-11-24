import { z } from "zod";

/**
 * Bitácora de actividad (ALCANCE 4.13). Formato del archivo de exportación/importación.
 * La versión permite leer archivos antiguos cuando el formato cambie.
 */
export const FORMATO_BITACORA = "nexo-bitacora" as const;
export const VERSION_BITACORA = 1 as const;

/** Acciones que se registran. Cada una se describe en lenguaje claro en la interfaz. */
export const ACCIONES_BITACORA = [
  "sesion.iniciar",
  "sesion.fallida",
  "sesion.cerrar",
  "cliente.crear",
  "cliente.editar",
  "cliente.eliminar",
  "cliente.servicio.asignar",
  "cliente.servicio.quitar",
  "cotizacion.crear",
  "cotizacion.editar",
  "cotizacion.enviar",
  "cotizacion.aprobar",
  "cotizacion.rechazar",
  "cotizacion.cambiar_estado",
  "cotizacion.eliminar",
  "cotizacion.evidencia.subir",
  "cotizacion.evidencia.eliminar",
  "usuario.crear",
  "usuario.editar",
  "usuario.eliminar",
  "usuario.restablecer_password",
  "servicio.crear",
  "servicio.editar",
  "servicio.eliminar",
  "configuracion.editar",
  "bitacora.exportar",
  "bitacora.purgar",
  "bitacora.importar",
] as const;

export const RegistroBitacoraSchema = z
  .object({
    id: z.string().min(1).max(100),
    creadoEn: z.string().datetime(),
    usuarioId: z.string().max(100).nullable(),
    usuarioNombre: z.string().max(200),
    accion: z.string().max(100),
    entidad: z.string().max(50),
    entidadId: z.string().max(100).nullable(),
    resumen: z.string().max(1000),
    cambios: z.unknown().nullable(),
  })
  .strict();

export const ExportacionBitacoraSchema = z
  .object({
    formato: z.literal(FORMATO_BITACORA),
    version: z.literal(VERSION_BITACORA),
    exportadoEn: z.string().datetime(),
    hasta: z.string().datetime(),
    registros: z.array(RegistroBitacoraSchema).max(200_000),
  })
  .strict();

/** Purga: borra los registros hasta la fecha indicada. Exige escribir la palabra BORRAR. */
export const PurgarBitacoraSchema = z
  .object({
    hasta: z.string().datetime(),
    confirmacion: z.literal("BORRAR"),
  })
  .strict();

export type RegistroBitacora = z.infer<typeof RegistroBitacoraSchema>;
export type ExportacionBitacora = z.infer<typeof ExportacionBitacoraSchema>;
