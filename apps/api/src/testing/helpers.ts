import request from "supertest";
import type { Rol } from "@prisma/client";
import { createApp } from "../app.js";
import { prisma } from "../lib/db.js";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/password.js";

export const PASS_PRUEBA = "clave-de-prueba-123";
export const DOMINIO_PRUEBA = "@prueba.test";
export const PREFIJO_PRUEBA = "[prueba] ";
export const app = createApp();

/** Crea un usuario de prueba. Su correo termina en DOMINIO_PRUEBA para poder limpiarlo. */
export async function crearUsuarioPrueba(prefijo: string, rol: Rol) {
  const sufijo = randomBytes(4).toString("hex");
  const username = `${prefijo.toLowerCase()}${sufijo}`;
  const email = `${username}${DOMINIO_PRUEBA}`;
  return prisma.usuario.create({
    data: { email, username, nombre: `Prueba ${rol}`, passwordHash: await hashPassword(PASS_PRUEBA), rol },
  });
}

/** Entra con el correo o el usuario de acceso. */
export async function loginComo(identificador: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ usuario: identificador, password: PASS_PRUEBA });
  if (res.status !== 200) throw new Error(`Login de prueba falló con ${res.status}`);
  return agent;
}

/** Borra usuarios de prueba (y sus sesiones) y los clientes/servicios creados por las pruebas. */
export async function limpiarPruebas() {
  // Primero las cotizaciones de clientes de prueba (sus partidas se borran en cascada).
  await prisma.cotizacion.deleteMany({ where: { cliente: { nombre: { startsWith: PREFIJO_PRUEBA } } } });
  await prisma.contacto.deleteMany({ where: { cliente: { nombre: { startsWith: PREFIJO_PRUEBA } } } });
  await prisma.cliente.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRUEBA } } });
  await prisma.servicio.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRUEBA } } });
  await prisma.categoriaServicio.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRUEBA } } });
  await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO_PRUEBA } } });
}
