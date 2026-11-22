import { PrismaClient, Rol } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

// Crea (o actualiza) el primer administrador real en la base indicada por DATABASE_URL.
// No carga datos de demo. La contraseña se pasa por variable de entorno y no queda guardada en el repo.
//
//   ADMIN_USERNAME=... ADMIN_EMAIL=... ADMIN_NOMBRE="..." ADMIN_PASSWORD=... pnpm --filter @nexo/api db:crear-admin

const prisma = new PrismaClient();

function requerido(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable ${nombre}`);
  return valor;
}

async function main() {
  const username = requerido("ADMIN_USERNAME").toLowerCase();
  const email = requerido("ADMIN_EMAIL").toLowerCase();
  const nombre = requerido("ADMIN_NOMBRE");
  const password = requerido("ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres");

  const passwordHash = await hashPassword(password);
  const admin = await prisma.usuario.upsert({
    where: { email },
    update: { username, nombre, rol: Rol.ADMIN, passwordHash, activo: true, eliminadoEn: null, debeCambiarPassword: false },
    create: { username, email, nombre, rol: Rol.ADMIN, passwordHash, esSuperAdmin: true },
  });

  console.log(`Administrador listo: ${admin.username} (${admin.email}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
