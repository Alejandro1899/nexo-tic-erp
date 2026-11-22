import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

// Catálogo (ALCANCE 4.2): todos leen; DIRECCION y ADMIN crean y editan; eliminar solo ADMIN.
describe("permisos por rol en el catálogo de servicios", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let tecnico: Awaited<ReturnType<typeof loginComo>>;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("serv", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("serv", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("serv", "VENDEDOR")).email);
    tecnico = await loginComo((await crearUsuarioPrueba("serv", "TECNICO")).email);
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("cualquier rol autenticado puede consultar el catálogo", async () => {
    for (const agente of [admin, direccion, vendedor, tecnico]) {
      expect((await agente.get("/api/servicios")).status).toBe(200);
    }
  });

  it("solo ADMIN y DIRECCION agregan servicios", async () => {
    const datos = { nombre: `${PREFIJO_PRUEBA}Soporte`, unidad: "MENSUALIDAD", tarifaCentavos: 250000 };
    expect((await vendedor.post("/api/servicios").send(datos)).status).toBe(403);
    expect((await tecnico.post("/api/servicios").send(datos)).status).toBe(403);
    expect((await direccion.post("/api/servicios").send(datos)).status).toBe(201);
    expect((await admin.post("/api/servicios").send({ ...datos, unidad: "PIEZA" })).status).toBe(400);
  });

  it("eliminar es lógico y solo lo hace ADMIN", async () => {
    const creado = await direccion.post("/api/servicios").send({ nombre: `${PREFIJO_PRUEBA}Borrar`, unidad: "HORA", tarifaCentavos: 1000 });
    const id = creado.body.servicio.id;
    expect((await direccion.delete(`/api/servicios/${id}`)).status).toBe(403);
    expect((await admin.delete(`/api/servicios/${id}`)).status).toBe(204);
    const catalogo = await admin.get("/api/servicios");
    expect(catalogo.body.servicios.map((s: { id: string }) => s.id)).not.toContain(id);
  });
});
