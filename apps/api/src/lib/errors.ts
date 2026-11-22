import { Prisma } from "@prisma/client";

/** Error con código HTTP y código de negocio. El manejador global lo convierte en JSON. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Traduce errores de Prisma conocidos a errores HTTP. Lo demás se re-lanza tal cual. */
export function traducirErrorPrisma(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return new HttpError(409, "duplicado", "Ya existe un registro con esos datos únicos (por ejemplo, el correo, el usuario o el RFC)");
  }
  return e;
}
