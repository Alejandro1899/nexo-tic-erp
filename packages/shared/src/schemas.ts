import { z } from "zod";

// Valores según docs/ALCANCE-NEXOTIC-ERP.md (secciones 4.1, 4.2 y 5).
export const RolUsuario = z.enum(["ADMIN", "VENDEDOR", "TECNICO", "DIRECCION"]);

export const TipoCliente =z.enum(["PERSONA_FISICA", "PERSONA_MORAL", "NEGOCIO_SIN_CONSTITUCION"]);
export const EstadoCliente = z.enum(["EN_REVISION", "EN_PROCESO", "ACTIVO", "SUSPENDIDO", "FINALIZADO"]);
export const UnidadCobro = z.enum(["HORA", "PROYECTO", "MENSUALIDAD"]);

export const rfcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/, "RFC con formato inválido");

const camposCliente = {
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  tipo: TipoCliente,
  rfc: rfcSchema.nullable().optional(),
  razonSocial: z.string().trim().min(1).max(200).nullable().optional(),
  regimenFiscal: z.string().trim().min(1).max(100).nullable().optional(),
  codigoPostal: z.string().trim().regex(/^\d{5}$/, "Código postal de 5 dígitos").nullable().optional(),
};

/**
 * Alta de cliente. No acepta estado: todo cliente nuevo entra "en revisión".
 * No acepta datosFiscalesPendientes: el servidor lo calcula.
 */
export const ClienteCrearSchema = z.object(camposCliente).strict();

/** Actualización parcial. Aquí sí se puede cambiar el estado. */
export const ClienteActualizarSchema = z
  .object({ ...camposCliente, estado: EstadoCliente })
  .partial()
  .strict();

/** Teléfono: dígitos con espacios, guiones, paréntesis o "+" inicial; de 7 a 20 caracteres. */
const telefonoSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{7,20}$/, "Teléfono con formato inválido")
  .refine((t) => t.replace(/\D/g, "").length >= 7, "El teléfono debe tener al menos 7 dígitos");

/** Contacto de un cliente. Todos los campos de contacto son opcionales, pero el nombre es obligatorio. */
const camposContacto = {
  nombre: z.string().trim().min(1, "El nombre del contacto es obligatorio").max(200),
  puesto: z.string().trim().min(1).max(100).nullable().optional(),
  telefono: telefonoSchema.nullable().optional(),
  correo: z.string().trim().toLowerCase().email("Correo de contacto inválido").max(200).nullable().optional(),
  esPrincipal: z.boolean().optional(),
};

export const ContactoCrearSchema = z.object(camposContacto).strict();

export const ContactoActualizarSchema = z.object(camposContacto).partial().strict();

export const ServicioCrearSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
    categoriaId: z.string().min(1).nullable().optional(),
    unidad: UnidadCobro,
    tarifaCentavos: z.number().int().nonnegative().max(2_000_000_000),
    activo: z.boolean().default(true),
  })
  .strict();

export const ServicioActualizarSchema = ServicioCrearSchema.partial().strict();

/** Usuario de acceso: minúsculas, números, punto, guion o guion bajo; 3 a 30 caracteres. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "El usuario tiene 3 a 30 caracteres: letras, números, punto, guion o guion bajo");

/** Alta de usuario por ADMIN. La contraseña inicial la conoce el ADMIN; el usuario la cambia al entrar. */
export const UsuarioCrearSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email("Correo inválido"),
    rol: RolUsuario,
    passwordInicial: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres").max(200),
  })
  .strict();

/** Cambios de ADMIN sobre un usuario. La contraseña no cambia aquí: se restablece con su propia acción. */
export const UsuarioActualizarSchema = z
  .object({
    nombre: z.string().trim().min(1).max(200),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email("Correo inválido"),
    rol: RolUsuario,
    activo: z.boolean(),
  })
  .partial()
  .strict();

/** Cambio de contraseña hecho por el propio usuario. */
export const CambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1),
    passwordNueva: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres").max(200),
  })
  .strict();

/** Categoría del catálogo (Soporte, Redes, Desarrollo…). Solo DIRECCION y ADMIN la administran. */
export const CategoriaCrearSchema = z
  .object({ nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100) })
  .strict();

/** Servicio asignado a un cliente. Sin tarifa propia se usa la del catálogo. */
export const ClienteServicioSchema = z
  .object({
    servicioId: z.string().min(1, "Elige un servicio"),
    tarifaCentavos: z.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
  })
  .strict();

/** Partida de cotización: un servicio del catálogo (precio del servidor) o una línea libre (precio obligatorio). */
export const CotizacionPartidaSchema = z
  .object({
    servicioId: z.string().min(1).nullable().optional(),
    descripcion: z.string().trim().min(1).max(300).optional(),
    cantidadMilesimas: z.number().int().positive("La cantidad debe ser mayor a cero").max(1_000_000_000),
    precioUnitarioCentavos: z.number().int().nonnegative().max(2_000_000_000).optional(),
    descuentoPb: z.number().int().min(0).max(10_000).default(0),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.servicioId && !p.descripcion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La partida libre necesita descripción", path: ["descripcion"] });
    }
    if (!p.servicioId && p.precioUnitarioCentavos === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La partida libre necesita precio", path: ["precioUnitarioCentavos"] });
    }
  });

export const CotizacionCrearSchema = z
  .object({
    clienteId: z.string().min(1),
    vigenciaDias: z.number().int().min(1).max(365).default(15),
    notas: z.string().trim().max(2000).nullable().optional(),
    partidas: z.array(CotizacionPartidaSchema).min(1, "La cotización necesita al menos una partida").max(100),
  })
  .strict();

/** Edición: solo en borrador. Reemplaza las partidas completas. */
export const CotizacionActualizarSchema = z
  .object({
    vigenciaDias: z.number().int().min(1).max(365).optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    partidas: z.array(CotizacionPartidaSchema).min(1, "La cotización necesita al menos una partida").max(100).optional(),
  })
  .strict();

export type CotizacionCrear = z.infer<typeof CotizacionCrearSchema>;
export type CotizacionPartida = z.infer<typeof CotizacionPartidaSchema>;

export type ClienteCrear = z.infer<typeof ClienteCrearSchema>;
export type ClienteActualizar = z.infer<typeof ClienteActualizarSchema>;
export type ServicioCrear = z.infer<typeof ServicioCrearSchema>;
export type ServicioActualizar = z.infer<typeof ServicioActualizarSchema>;

/**
 * Datos fiscales pendientes (ALCANCE 4.1): persona física requiere RFC;
 * persona moral requiere RFC y razón social; el negocio sin constitución no exige datos fiscales.
 * Esta marca solo bloquea la exportación para facturación; no bloquea cotizaciones ni proyectos.
 */
export function datosFiscalesPendientes(c: {
  tipo: z.infer<typeof TipoCliente>;
  rfc?: string | null;
  razonSocial?: string | null;
}): boolean {
  if (c.tipo === "PERSONA_FISICA") return !c.rfc;
  if (c.tipo === "PERSONA_MORAL") return !c.rfc || !c.razonSocial;
  return false;
}

/** Límite del logo en la base: 500 KB. */
export const LOGO_MAX_BYTES = 500 * 1024;

/**
 * Datos de la empresa (solo ADMIN los cambia). Todos opcionales en la actualización.
 * El IVA y el redondeo no aparecen aquí: son reglas fijas definidas una sola vez.
 */
export const ConfiguracionActualizarSchema = z
  .object({
    nombreComercial: z.string().trim().min(1, "El nombre comercial es obligatorio").max(200),
    razonSocial: z.string().trim().max(200).nullable(),
    rfc: rfcSchema.nullable(),
    regimenFiscal: z.string().trim().max(100).nullable(),
    codigoPostal: z.string().trim().regex(/^\d{5}$/, "Código postal de 5 dígitos").nullable(),
    correo: z.string().trim().toLowerCase().email("Correo inválido").max(200).nullable(),
    telefono: telefonoSchema.nullable(),
    sitioWeb: z.string().trim().max(200).nullable(),
    condicionesCotizacion: z.string().trim().min(1, "Las condiciones no pueden estar vacías").max(4000),
    vigenciaDiasDefault: z.number().int().min(1, "Mínimo 1 día").max(90, "Máximo 90 días"),
    prefijoFolioCotizacion: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "El prefijo tiene de 2 a 4 letras"),
  })
  .partial()
  .strict();
