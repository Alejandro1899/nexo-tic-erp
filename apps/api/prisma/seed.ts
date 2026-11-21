import { PrismaClient } from "@prisma/client";

// Datos de prueba: clientes de los tres tipos, cotizaciones y proyectos.
// Se completan junto con las historias de clientes, cotizaciones y proyectos.
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "tenant-demo" },
    update: {},
    create: { id: "tenant-demo", nombre: "Empresa demo" },
  });
  console.log(`Seed listo para tenant ${tenant.nombre}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
