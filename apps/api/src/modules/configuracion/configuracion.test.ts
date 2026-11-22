import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { LOGO_MAX_BYTES } from "@nexo/shared";
import { prisma } from "../../lib/db.js";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo } from "../../testing/helpers.js";

// Configuración de la empresa: solo ADMIN cambia datos y logo (docs/PLAN-FALTANTES-V1.md, fase previa).
const PNG_MINIMO = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

describe("configuración de la empresa", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  // Valores originales, para restaurar la fila al terminar las pruebas.
  let original: Awaited<ReturnType<typeof prisma.configuracionEmpresa.findUnique>>;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("cfg", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("cfg", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("cfg", "VENDEDOR")).email);
    original = await prisma.configuracionEmpresa.findUnique({ where: { id: "empresa" } });
  });

  afterAll(async () => {
    if (original) {
      await prisma.configuracionEmpresa.update({ where: { id: "empresa" }, data: original });
    }
    await limpiarPruebas();
  });

  it("sin sesión no hay acceso", async () => {
    expect((await request(app).get("/api/configuracion")).status).toBe(401);
  });

  it("cualquier usuario con sesión lee la configuración, sin los bytes del logo", async () => {
    const res = await vendedor.get("/api/configuracion");
    expect(res.status).toBe(200);
    expect(res.body.configuracion.nombreComercial).toBeTruthy();
    expect(res.body.configuracion).not.toHaveProperty("logoPng");
    expect(typeof res.body.configuracion.tieneLogo).toBe("boolean");
  });

  it("solo ADMIN puede cambiar datos", async () => {
    expect((await vendedor.patch("/api/configuracion").send({ telefono: "55 0000 0000" })).status).toBe(403);
    expect((await direccion.patch("/api/configuracion").send({ telefono: "55 0000 0000" })).status).toBe(403);
    expect((await admin.patch("/api/configuracion").send({ telefono: "55 0000 0000" })).status).toBe(200);
  });

  it("rechaza un RFC y un correo con formato inválido", async () => {
    const rfc = await admin.patch("/api/configuracion").send({ rfc: "NO-ES-RFC" });
    expect(rfc.status).toBe(400);
    const correo = await admin.patch("/api/configuracion").send({ correo: "sin-arroba" });
    expect(correo.status).toBe(400);
  });

  it("acepta un RFC válido y lo guarda en mayúsculas", async () => {
    const res = await admin.patch("/api/configuracion").send({ rfc: "nex010101ab1" });
    expect(res.status).toBe(200);
    expect(res.body.configuracion.rfc).toBe("NEX010101AB1");
  });

  it("el IVA no es editable: un campo desconocido se rechaza", async () => {
    const res = await admin.patch("/api/configuracion").send({ ivaPorcentaje: 8 });
    expect(res.status).toBe(400);
  });

  it("el prefijo de folio solo admite de 2 a 4 letras", async () => {
    // Solo se prueba el rechazo: cambiar el prefijo real afectaría a otras pruebas que corren en paralelo.
    expect((await admin.patch("/api/configuracion").send({ prefijoFolioCotizacion: "N1" })).status).toBe(400);
    expect((await admin.patch("/api/configuracion").send({ prefijoFolioCotizacion: "ABCDE" })).status).toBe(400);
  });

  it("sube un logo PNG válido y lo sirve como imagen", async () => {
    const subida = await admin.put("/api/configuracion/logo").set("Content-Type", "image/png").send(PNG_MINIMO);
    expect(subida.status).toBe(200);
    expect(subida.body.configuracion.tieneLogo).toBe(true);

    const lectura = await vendedor.get("/api/configuracion/logo").buffer(true).parse(binaryParser);
    expect(lectura.status).toBe(200);
    expect(lectura.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(lectura.body, PNG_MINIMO)).toBe(0);
  });

  it("rechaza un archivo que no es PNG", async () => {
    const res = await admin.put("/api/configuracion/logo").set("Content-Type", "image/png").send(Buffer.from("texto plano"));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("logo_invalido");
  });

  it("rechaza un logo más grande que el límite", async () => {
    const grande = Buffer.concat([PNG_MINIMO, Buffer.alloc(LOGO_MAX_BYTES, 0)]);
    const res = await admin.put("/api/configuracion/logo").set("Content-Type", "image/png").send(grande);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("logo_muy_grande");
  });

  it("solo ADMIN sube o quita el logo", async () => {
    expect((await vendedor.put("/api/configuracion/logo").set("Content-Type", "image/png").send(PNG_MINIMO)).status).toBe(403);
    expect((await direccion.delete("/api/configuracion/logo")).status).toBe(403);
  });

  it("quitar el logo deja la configuración sin logo", async () => {
    const res = await admin.delete("/api/configuracion/logo");
    expect(res.status).toBe(200);
    expect(res.body.configuracion.tieneLogo).toBe(false);
    expect((await vendedor.get("/api/configuracion/logo")).status).toBe(404);
  });
});

/** Lee la respuesta binaria completa (las imágenes no se parsean como texto). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma que exige supertest para .parse()
function binaryParser(res: any, callback: (err: Error | null, body: Buffer) => void) {
  const trozos: Buffer[] = [];
  res.on("data", (c: Buffer) => trozos.push(c));
  res.on("end", () => callback(null, Buffer.concat(trozos)));
}
