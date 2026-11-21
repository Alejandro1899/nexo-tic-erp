import { z } from "zod";

/** Tipos de cliente acordados en el plan: los tres tipos se completan en la historia "clientes-tipos". */
export const TipoCliente = z.enum(["EMPRESA", "PERSONA_FISICA", "GOBIERNO"]);
export const EstadoCliente = z.enum(["ACTIVO", "INACTIVO"]);

export const DatosFiscalesSchema = z
  .object({
    rfc: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/, "RFC con formato inválido").optional(),
    razonSocial: z.string().min(1).max(200).optional(),
    codigoPostal: z.string().regex(/^\d{5}$/, "Código postal de 5 dígitos").optional(),
  })
  .strict();

export const ClienteCrearSchema = z
  .object({
    nombre: z.string().trim().min(1).max(200),
    tipo: TipoCliente,
    estado: EstadoCliente.default("ACTIVO"),
    datosFiscales: DatosFiscalesSchema.optional(),
  })
  .strict();

/** Nota: tenantId NUNCA aparece en el cuerpo de la petición; sale del token de sesión. */
export type ClienteCrear = z.infer<typeof ClienteCrearSchema>;
