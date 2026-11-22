import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../lib/db.js";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

// Permisos de clientes (docs/ALCANCE-NEXOTIC-ERP.md, secciones 3 y 4.1).
describe("permisos por rol en clientes", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let tecnico: Awaited<ReturnType<typeof loginComo>>;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("cli", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("cli", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("cli", "VENDEDOR")).email);
    tecnico = await loginComo((await crearUsuarioPrueba("cli", "TECNICO")).email);
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("sin sesión no hay acceso a clientes", async () => {
    expect((await request(app).get("/api/clientes")).status).toBe(401);
  });

  it("todos los roles pueden consultar clientes", async () => {
    for (const agente of [admin, direccion, vendedor, tecnico]) {
      expect((await agente.get("/api/clientes")).status).toBe(200);
    }
  });

  it("solo ADMIN y DIRECCION agregan clientes; el VENDEDOR y el TECNICO no", async () => {
    const datos = { nombre: `${PREFIJO_PRUEBA}Alta`, tipo: "PERSONA_FISICA" };
    expect((await admin.post("/api/clientes").send(datos)).status).toBe(201);
    expect((await direccion.post("/api/clientes").send(datos)).status).toBe(201);
    expect((await vendedor.post("/api/clientes").send(datos)).status).toBe(403);
    expect((await tecnico.post("/api/clientes").send(datos)).status).toBe(403);
  });

  it("un nuevo cliente entra en EN_REVISION y no acepta estado en el alta", async () => {
    const conEstado = await direccion
      .post("/api/clientes")
      .send({ nombre: `${PREFIJO_PRUEBA}Estado`, tipo: "PERSONA_MORAL", estado: "ACTIVO" });
    expect(conEstado.status).toBe(400);

    const ok = await direccion.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Revision`, tipo: "PERSONA_MORAL" });
    expect(ok.status).toBe(201);
    expect(ok.body.cliente.estado).toBe("EN_REVISION");
  });

  it("calcula datosFiscalesPendientes al crear y al completar datos", async () => {
    const creado = await direccion.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Sin RFC`, tipo: "PERSONA_FISICA" });
    expect(creado.body.cliente.datosFiscalesPendientes).toBe(true);

    const completado = await direccion.patch(`/api/clientes/${creado.body.cliente.id}`).send({ rfc: "AAA010101AB1" });
    expect(completado.body.cliente.datosFiscalesPendientes).toBe(false);
  });

  it("el RFC es único en todo el sistema: un duplicado responde 409", async () => {
    const rfc = "BBB010101AB1";
    const primero = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Uno`, tipo: "PERSONA_MORAL", rfc });
    const segundo = await direccion.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Dos`, tipo: "PERSONA_MORAL", rfc });
    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(409);
  });

  it("el estado lo cambian ADMIN y DIRECCION; el VENDEDOR y el TECNICO no", async () => {
    const creado = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Estado PATCH`, tipo: "NEGOCIO_SIN_CONSTITUCION" });
    const id = creado.body.cliente.id;
    expect((await vendedor.patch(`/api/clientes/${id}`).send({ estado: "ACTIVO" })).status).toBe(403);
    expect((await tecnico.patch(`/api/clientes/${id}`).send({ estado: "ACTIVO" })).status).toBe(403);
    const cambio = await direccion.patch(`/api/clientes/${id}`).send({ estado: "ACTIVO" });
    expect(cambio.body.cliente.estado).toBe("ACTIVO");
  });

  it("el filtro por estado devuelve solo clientes de ese estado", async () => {
    const creado = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Suspendido`, tipo: "PERSONA_MORAL" });
    await admin.patch(`/api/clientes/${creado.body.cliente.id}`).send({ estado: "SUSPENDIDO" });
    const res = await vendedor.get("/api/clientes?estado=SUSPENDIDO");
    const estados = res.body.clientes.map((c: { estado: string }) => c.estado);
    expect(estados.length).toBeGreaterThan(0);
    expect(estados.every((e: string) => e === "SUSPENDIDO")).toBe(true);
  });

  it("eliminar es lógico y solo lo hace ADMIN: el cliente deja de aparecer", async () => {
    const creado = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Por borrar`, tipo: "PERSONA_FISICA" });
    const id = creado.body.cliente.id;

    expect((await direccion.delete(`/api/clientes/${id}`)).status).toBe(403);
    expect((await admin.delete(`/api/clientes/${id}`)).status).toBe(204);

    expect((await admin.get(`/api/clientes/${id}`)).status).toBe(404);
    const lista = await admin.get(`/api/clientes?q=${encodeURIComponent("Por borrar")}`);
    expect(lista.body.clientes.map((c: { id: string }) => c.id)).not.toContain(id);
    // El registro sigue en la base (borrado lógico).
    const fila = await prisma.cliente.findUnique({ where: { id } });
    expect(fila?.eliminadoEn).not.toBeNull();
  });
});
