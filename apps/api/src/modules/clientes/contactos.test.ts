import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

// Contactos del cliente y folio CLI-0001 (docs/PLAN-FALTANTES-V1.md, fase 1).
describe("contactos y folio de cliente", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let clienteId: string;
  let folioPrimero: string;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("ctc", "ADMIN")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("ctc", "VENDEDOR")).email);
    const res = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Contactos SA`, tipo: "PERSONA_MORAL" });
    expect(res.status).toBe(201);
    clienteId = res.body.cliente.id;
    folioPrimero = res.body.cliente.folio;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("el alta asigna un folio CLI-NNNN consecutivo y único", async () => {
    expect(folioPrimero).toMatch(/^CLI-\d{4}$/);
    const otro = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Folio dos`, tipo: "PERSONA_FISICA" });
    expect(otro.status).toBe(201);
    expect(otro.body.cliente.folio).toMatch(/^CLI-\d{4}$/);
    expect(otro.body.cliente.folio).not.toBe(folioPrimero);
  });

  it("el primer contacto es principal y el segundo no, salvo que se marque", async () => {
    const primero = await admin.post(`/api/clientes/${clienteId}/contactos`).send({ nombre: "Ana", telefono: "55 1234 5678" });
    expect(primero.status).toBe(201);
    expect(primero.body.contacto.esPrincipal).toBe(true);

    const segundo = await admin.post(`/api/clientes/${clienteId}/contactos`).send({ nombre: "Luis", correo: "luis@ejemplo.mx" });
    expect(segundo.body.contacto.esPrincipal).toBe(false);

    const cambio = await admin.patch(`/api/clientes/${clienteId}/contactos/${segundo.body.contacto.id}`).send({ esPrincipal: true });
    expect(cambio.status).toBe(200);
    const lista = await admin.get(`/api/clientes/${clienteId}/contactos`);
    const principales = lista.body.contactos.filter((c: { esPrincipal: boolean }) => c.esPrincipal);
    expect(principales).toHaveLength(1);
    expect(principales[0].nombre).toBe("Luis");
  });

  it("no se puede quitar el principal directamente", async () => {
    const lista = await admin.get(`/api/clientes/${clienteId}/contactos`);
    const principal = lista.body.contactos.find((c: { esPrincipal: boolean }) => c.esPrincipal);
    const res2 = await admin.patch(`/api/clientes/${clienteId}/contactos/${principal.id}`).send({ esPrincipal: false });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe("principal_requerido");
  });

  it("al eliminar el principal, el contacto más antiguo pasa a serlo", async () => {
    const lista = await admin.get(`/api/clientes/${clienteId}/contactos`);
    const principal = lista.body.contactos.find((c: { esPrincipal: boolean }) => c.esPrincipal);
    const borrado = await admin.delete(`/api/clientes/${clienteId}/contactos/${principal.id}`);
    expect(borrado.status).toBe(204);
    const despues = await admin.get(`/api/clientes/${clienteId}/contactos`);
    expect(despues.body.contactos).toHaveLength(1);
    expect(despues.body.contactos[0].esPrincipal).toBe(true);
  });

  it("VENDEDOR consulta contactos pero no los crea", async () => {
    expect((await vendedor.get(`/api/clientes/${clienteId}/contactos`)).status).toBe(200);
    expect((await vendedor.post(`/api/clientes/${clienteId}/contactos`).send({ nombre: "No debe" })).status).toBe(403);
  });

  it("valida teléfono y correo en el servidor", async () => {
    const malTelefono = await admin.post(`/api/clientes/${clienteId}/contactos`).send({ nombre: "X", telefono: "abc" });
    expect(malTelefono.status).toBe(400);
    const malCorreo = await admin.post(`/api/clientes/${clienteId}/contactos`).send({ nombre: "X", correo: "no-es-correo" });
    expect(malCorreo.status).toBe(400);
  });
});
