import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db.js";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo, PASS_PRUEBA, PREFIJO_PRUEBA } from "../../testing/helpers.js";

describe("bitácora de actividad", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let adminEmail: string;

  beforeAll(async () => {
    const usuarioAdmin = await crearUsuarioPrueba("bitacora", "ADMIN");
    adminEmail = usuarioAdmin.email;
    admin = await loginComo(usuarioAdmin.email);
    direccion = await loginComo((await crearUsuarioPrueba("bitacora", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("bitacora", "VENDEDOR")).email);
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("registra el inicio de sesión y los intentos fallidos, sin guardar contraseñas", async () => {
    await request(app).post("/api/auth/login").send({ usuario: adminEmail, password: "incorrecta-123" });
    const fallidos = await prisma.registroActividad.findMany({ where: { accion: "sesion.fallida", resumen: { contains: adminEmail } } });
    expect(fallidos.length).toBeGreaterThan(0);

    const exitosos = await prisma.registroActividad.findMany({ where: { accion: "sesion.iniciar", usuarioId: { not: null } } });
    expect(exitosos.some((r) => r.resumen.includes("inició sesión"))).toBe(true);
    expect(JSON.stringify(exitosos)).not.toContain(PASS_PRUEBA);
  });

  it("registra altas y solo los campos clave que cambian al editar", async () => {
    const creado = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Cliente bitacora`, tipo: "PERSONA_FISICA" });
    const id = creado.body.cliente.id;
    const alta = await prisma.registroActividad.findFirst({ where: { accion: "cliente.crear", entidadId: id } });
    expect(alta?.usuarioNombre).toBeTruthy();

    await admin.patch(`/api/clientes/${id}`).send({ telefono: "5555555555" });
    const edicion = await prisma.registroActividad.findFirst({ where: { accion: "cliente.editar", entidadId: id } });
    // telefono no es campo clave: no debe generar una edición con cambios.
    expect(edicion).toBeNull();

    await admin.patch(`/api/clientes/${id}`).send({ nombre: `${PREFIJO_PRUEBA}Cliente bitacora editado` });
    const cambio = await prisma.registroActividad.findFirst({ where: { accion: "cliente.editar", entidadId: id } });
    expect(cambio?.cambios).toEqual({ nombre: { antes: `${PREFIJO_PRUEBA}Cliente bitacora`, despues: `${PREFIJO_PRUEBA}Cliente bitacora editado` } });
  });

  it("DIRECCION puede consultar la bitácora; VENDEDOR no", async () => {
    expect((await direccion.get("/api/actividad")).status).toBe(200);
    expect((await vendedor.get("/api/actividad")).status).toBe(403);
  });

  it("solo ADMIN puede exportar, purgar o importar", async () => {
    expect((await direccion.get("/api/actividad/exportar")).status).toBe(403);
    expect((await direccion.post("/api/actividad/purgar").send({ hasta: new Date().toISOString(), confirmacion: "BORRAR" })).status).toBe(403);
    expect((await direccion.post("/api/actividad/importar").send({})).status).toBe(403);
  });

  it("la exportación trae el formato fijo y la versión", async () => {
    const res = await admin.get("/api/actividad/exportar");
    expect(res.status).toBe(200);
    expect(res.body.formato).toBe("nexo-bitacora");
    expect(res.body.version).toBe(1);
    expect(Array.isArray(res.body.registros)).toBe(true);
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("la purga exige escribir BORRAR y no acepta fechas futuras", async () => {
    const pasado = new Date(Date.now() - 1000).toISOString();
    expect((await admin.post("/api/actividad/purgar").send({ hasta: pasado, confirmacion: "borrar" })).status).toBe(400);
    const futura = new Date(Date.now() + 86_400_000).toISOString();
    expect((await admin.post("/api/actividad/purgar").send({ hasta: futura, confirmacion: "BORRAR" })).status).toBe(400);
  });

  it("importar un archivo exportado no duplica registros y deja su propia constancia", async () => {
    const exportado = (await admin.get("/api/actividad/exportar")).body;
    const antes = await prisma.registroActividad.count();
    const res = await admin.post("/api/actividad/importar").send(exportado);
    expect(res.status).toBe(200);
    expect(res.body.importados).toBe(0);
    expect(res.body.omitidos).toBe(exportado.registros.length);
    expect(await prisma.registroActividad.count()).toBe(antes + 1); // solo la constancia de la importación
  });

  it("rechaza un archivo que no tiene el formato de la bitácora", async () => {
    const res = await admin.post("/api/actividad/importar").send({ formato: "otro", version: 1 });
    expect(res.status).toBe(400);
  });
});
