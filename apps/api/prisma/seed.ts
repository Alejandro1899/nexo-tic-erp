import { PrismaClient, Rol } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

// Datos de prueba para desarrollo local. NEXOTIC es una sola empresa.
// Cada corrida reemplaza clientes, servicios y sesiones, y crea/actualiza los usuarios demo.
const prisma = new PrismaClient();
const PASSWORD_DEMO = "demo1234";

const usuariosDemo: Array<{ username: string; email: string; nombre: string; rol: Rol; esSuperAdmin?: boolean }> = [
  { username: "superadmin", email: "superadmin@nexotic.mx", nombre: "Super Administrador", rol: Rol.ADMIN, esSuperAdmin: true },
  { username: "admin", email: "admin@nexotic.mx", nombre: "Ana Administradora", rol: Rol.ADMIN },
  { username: "direccion", email: "direccion@nexotic.mx", nombre: "Diana Dirección", rol: Rol.DIRECCION },
  { username: "vendedor", email: "vendedor@nexotic.mx", nombre: "Luis Vendedor", rol: Rol.VENDEDOR },
  { username: "tecnico", email: "tecnico@nexotic.mx", nombre: "Tomás Técnico", rol: Rol.TECNICO },
];

async function main() {
  await prisma.sesion.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.servicio.deleteMany({});

  const passwordHash = await hashPassword(PASSWORD_DEMO);
  for (const u of usuariosDemo) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: { nombre: u.nombre, username: u.username, rol: u.rol, passwordHash, activo: true, eliminadoEn: null, esSuperAdmin: u.esSuperAdmin ?? false },
      create: { email: u.email, username: u.username, nombre: u.nombre, rol: u.rol, passwordHash, esSuperAdmin: u.esSuperAdmin ?? false },
    });
  }

  await prisma.cliente.createMany({
    data: [
      { nombre: "Constructora Norte SA de CV", tipo: "PERSONA_MORAL", estado: "ACTIVO", rfc: "CNO010101AB1", razonSocial: "Constructora Norte SA de CV", codigoPostal: "03100", datosFiscalesPendientes: false },
      { nombre: "María López Hernández", tipo: "PERSONA_FISICA", estado: "EN_REVISION", codigoPostal: "06600", datosFiscalesPendientes: true },
      { nombre: "Taller Independiente", tipo: "NEGOCIO_SIN_CONSTITUCION", estado: "EN_PROCESO", datosFiscalesPendientes: false },
      { nombre: "Proveedor Suspendido SA", tipo: "PERSONA_MORAL", estado: "SUSPENDIDO", rfc: "PSU050505AB2", razonSocial: "Proveedor Suspendido SA", datosFiscalesPendientes: false },
    ],
  });

  await prisma.servicio.createMany({
    data: [
      { nombre: "Soporte técnico", unidad: "HORA", tarifaCentavos: 45000 },
      { nombre: "Mantenimiento mensual de equipos", unidad: "MENSUALIDAD", tarifaCentavos: 250000 },
      { nombre: "Instalación de red", unidad: "PROYECTO", tarifaCentavos: 180000 },
    ],
  });

  console.log("Seed listo. NEXOTIC (una sola empresa).");
  console.log(`Usuarios: ${usuariosDemo.map((u) => u.username).join(", ")} (también pueden entrar con su correo)`);
  console.log(`Contraseña de desarrollo: ${PASSWORD_DEMO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
