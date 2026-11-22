import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../lib/db.js";
import { DURACION_SESION_SEG } from "../../lib/http.js";
import type { SesionAutenticada } from "../../middleware/roles.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function crearSesion(usuario: { id: string }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.sesion.create({
    data: {
      id: hashToken(token),
      usuarioId: usuario.id,
      expiraEn: new Date(Date.now() + DURACION_SESION_SEG * 1000),
    },
  });
  return token;
}

export async function buscarSesion(token: string): Promise<SesionAutenticada | null> {
  const sesion = await prisma.sesion.findUnique({
    where: { id: hashToken(token) },
    include: { usuario: true },
  });
  if (!sesion || sesion.expiraEn <= new Date() || !sesion.usuario.activo || sesion.usuario.eliminadoEn) return null;
  return { usuarioId: sesion.usuarioId, rol: sesion.usuario.rol };
}

export async function revocarSesion(token: string): Promise<void> {
  await prisma.sesion.deleteMany({ where: { id: hashToken(token) } });
}
