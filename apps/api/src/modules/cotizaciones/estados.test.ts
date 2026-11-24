import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

/** Cambio manual de estado de cotizaciones (solo ADMIN y DIRECCION). */
describe("cambio manual de estado de cotizaciones", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let clienteId: string;
  let servicioId: string;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("estados", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("estados", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("estados", "VENDEDOR")).email);
    const servicio = await admin.post("/api/servicios").send({ nombre: `${PREFIJO_PRUEBA}Servicio estados`, unidad: "HORA", tarifaCentavos: 100000 });
    servicioId = servicio.body.servicio.id;
    const cliente = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Cliente estados`, tipo: "PERSONA_FISICA" });
    clienteId = cliente.body.cliente.id;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  /** Crea una cotización, la envía y la aprueba (o rechaza) para tener el estado de partida. */
  async function cotizacionEn(estado: "BORRADOR" | "APROBADA" | "RECHAZADA") {
    const creada = await admin.post("/api/cotizaciones").send({ clienteId, partidas: [{ servicioId, cantidadMilesimas: 1000 }] });
    const id: string = creada.body.cotizacion.id;
    if (estado === "BORRADOR") return id;
    await admin.post(`/api/cotizaciones/${id}/enviar`);
    await admin.post(`/api/cotizaciones/${id}/${estado === "APROBADA" ? "aprobar" : "rechazar"}`);
    return id;
  }

  it("VENDEDOR no puede cambiar el estado: responde 403", async () => {
    const id = await cotizacionEn("APROBADA");
    const res = await vendedor.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "RECHAZADA" });
    expect(res.status).toBe(403);
  });

  it("aprobada pasa a rechazada, registrando quién lo decidió", async () => {
    const id = await cotizacionEn("APROBADA");
    const res = await direccion.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "RECHAZADA" });
    expect(res.status).toBe(200);
    expect(res.body.cotizacion.estado).toBe("RECHAZADA");
    expect(res.body.cotizacion.autorizadaPorId).not.toBeNull();
  });

  it("aprobada regresa a borrador y se limpian la envío y la autorización", async () => {
    const id = await cotizacionEn("APROBADA");
    const res = await admin.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "BORRADOR" });
    expect(res.status).toBe(200);
    expect(res.body.cotizacion.estado).toBe("BORRADOR");
    expect(res.body.cotizacion.autorizadaPorId).toBeNull();
    expect(res.body.cotizacion.enviadaEn).toBeNull();
    // Como borrador vuelve a poder editarse.
    const editada = await admin.patch(`/api/cotizaciones/${id}`).send({ notas: "revisada" });
    expect(editada.status).toBe(200);
  });

  it("rechazada regresa a borrador", async () => {
    const id = await cotizacionEn("RECHAZADA");
    const res = await admin.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "BORRADOR" });
    expect(res.status).toBe(200);
    expect(res.body.cotizacion.estado).toBe("BORRADOR");
  });

  it("no se salta el flujo: un borrador no pasa a rechazada con este cambio", async () => {
    const id = await cotizacionEn("BORRADOR");
    const res = await admin.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "RECHAZADA" });
    expect(res.status).toBe(409);
  });

  it("una rechazada no vuelve a rechazarse con este cambio", async () => {
    const id = await cotizacionEn("RECHAZADA");
    const res = await admin.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "RECHAZADA" });
    expect(res.status).toBe(409);
  });

  it("rechaza estados fuera de la lista permitida", async () => {
    const id = await cotizacionEn("APROBADA");
    const res = await admin.post(`/api/cotizaciones/${id}/cambiar-estado`).send({ estado: "APROBADA" });
    expect(res.status).toBe(400);
  });
});
