import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

/**
 * Anticipo, costos internos, utilidad y margen (ALCANCE 4.3).
 * Referencia: 2.5 h a $1,000 = $2,500 de subtotal; IVA 16 % = $400; total $2,900 (290000 centavos).
 */
describe("anticipo y costos internos de cotizaciones", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let clienteId: string;
  let servicioId: string;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("costos", "ADMIN")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("costos", "VENDEDOR")).email);
    const servicio = await admin.post("/api/servicios").send({
      nombre: `${PREFIJO_PRUEBA}Servicio con costo`,
      unidad: "HORA",
      tarifaCentavos: 100000,
    });
    servicioId = servicio.body.servicio.id;
    const cliente = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Cliente costos`, tipo: "PERSONA_FISICA" });
    clienteId = cliente.body.cliente.id;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("el anticipo se calcula sobre el total con IVA y el saldo completa el total", async () => {
    const res = await admin.post("/api/cotizaciones").send({
      clienteId,
      anticipoPb: 5000,
      partidas: [{ servicioId, cantidadMilesimas: 2500 }],
    });
    expect(res.status).toBe(201);
    const c = res.body.cotizacion;
    expect(c.totalCentavos).toBe(290000);
    expect(c.anticipoCentavos).toBe(145000);
    expect(c.saldoCentavos).toBe(145000);
  });

  it("sin anticipo, todo el total es saldo", async () => {
    const res = await admin.post("/api/cotizaciones").send({ clienteId, partidas: [{ servicioId, cantidadMilesimas: 1000 }] });
    expect(res.body.cotizacion.anticipoCentavos).toBe(0);
    expect(res.body.cotizacion.saldoCentavos).toBe(res.body.cotizacion.totalCentavos);
  });

  it("ADMIN ve costo, utilidad y margen; la utilidad es base sin IVA menos costo", async () => {
    const res = await admin.post("/api/cotizaciones").send({
      clienteId,
      partidas: [{ servicioId, cantidadMilesimas: 2000, costoUnitarioCentavos: 40000 }],
    });
    const c = res.body.cotizacion;
    // Base sin IVA: 2 h a $1,000 = $2,000. Costo: 2 h a $400 = $800. Utilidad $1,200 = 60 %.
    expect(c.costoTotalCentavos).toBe(80000);
    expect(c.utilidadCentavos).toBe(120000);
    expect(c.margenPb).toBe(6000);
  });

  it("si una partida no tiene costo, el costo total y la utilidad quedan en null", async () => {
    const res = await admin.post("/api/cotizaciones").send({
      clienteId,
      partidas: [
        { servicioId, cantidadMilesimas: 1000, costoUnitarioCentavos: 30000 },
        { servicioId, cantidadMilesimas: 1000 },
      ],
    });
    expect(res.body.cotizacion.costoTotalCentavos).toBeNull();
    expect(res.body.cotizacion.utilidadCentavos).toBeNull();
    expect(res.body.cotizacion.margenPb).toBeNull();
  });

  it("VENDEDOR no recibe costos ni utilidad, ni en partidas ni en totales", async () => {
    const creada = await vendedor.post("/api/cotizaciones").send({
      clienteId,
      partidas: [{ servicioId, cantidadMilesimas: 1000 }],
    });
    expect(creada.status).toBe(201);
    const c = creada.body.cotizacion;
    expect(c).not.toHaveProperty("costoTotalCentavos");
    expect(c).not.toHaveProperty("utilidadCentavos");
    expect(c).not.toHaveProperty("margenPb");
    expect(c.partidas[0]).not.toHaveProperty("costoUnitarioCentavos");

    const consulta = await vendedor.get(`/api/cotizaciones/${c.id}`);
    expect(consulta.body.cotizacion.partidas[0]).not.toHaveProperty("costoUnitarioCentavos");
  });

  it("VENDEDOR no puede enviar costos: responde 403", async () => {
    const res = await vendedor.post("/api/cotizaciones").send({
      clienteId,
      partidas: [{ servicioId, cantidadMilesimas: 1000, costoUnitarioCentavos: 1000 }],
    });
    expect(res.status).toBe(403);
  });

  it("al editar, VENDEDOR conserva el costo que ADMIN capturó en la misma partida", async () => {
    // El VENDEDOR crea el borrador; el ADMIN le asigna el costo de la línea libre.
    const original = await vendedor.post("/api/cotizaciones").send({
      clienteId,
      partidas: [{ descripcion: `${PREFIJO_PRUEBA}Equipo`, precioUnitarioCentavos: 500000, cantidadMilesimas: 1000 }],
    });
    const id = original.body.cotizacion.id;
    const conCosto = await admin.patch(`/api/cotizaciones/${id}`).send({
      partidas: [{ descripcion: `${PREFIJO_PRUEBA}Equipo`, precioUnitarioCentavos: 500000, cantidadMilesimas: 1000, costoUnitarioCentavos: 300000 }],
    });
    expect(conCosto.status).toBe(200);
    // Un VENDEDOR cambia la cantidad de la misma línea libre; el costo no debe perderse.
    const editada = await vendedor.patch(`/api/cotizaciones/${id}`).send({
      partidas: [{ descripcion: `${PREFIJO_PRUEBA}Equipo`, precioUnitarioCentavos: 500000, cantidadMilesimas: 2000 }],
    });
    expect(editada.status).toBe(200);
    const despues = await admin.get(`/api/cotizaciones/${id}`);
    expect(despues.body.cotizacion.partidas[0].costoUnitarioCentavos).toBe(300000);
    expect(despues.body.cotizacion.costoTotalCentavos).toBe(600000);
  });

  it("el anticipo se puede cambiar mientras la cotización es borrador", async () => {
    const creada = await admin.post("/api/cotizaciones").send({ clienteId, partidas: [{ servicioId, cantidadMilesimas: 1000 }] });
    const id = creada.body.cotizacion.id;
    const editada = await admin.patch(`/api/cotizaciones/${id}`).send({ anticipoPb: 3000 });
    expect(editada.status).toBe(200);
    expect(editada.body.cotizacion.anticipoCentavos).toBe(Math.round(editada.body.cotizacion.totalCentavos * 0.3));
  });
});
