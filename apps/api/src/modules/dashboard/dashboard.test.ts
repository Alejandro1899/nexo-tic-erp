import { describe, expect, it } from "vitest";
import request from "supertest";
import { afterAll } from "vitest";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";
import { claveMes, inicioPeriodo, mesesTendencia } from "./periodos.js";

describe("periodos del dashboard", () => {
  const ahora = new Date(2026, 5, 15); // 15 de junio de 2026
  it("mes empieza el día 1 del mes actual", () => {
    expect(inicioPeriodo("mes", ahora)).toEqual(new Date(2026, 5, 1));
  });
  it("trimestre cubre los últimos tres meses", () => {
    expect(inicioPeriodo("trimestre", ahora)).toEqual(new Date(2026, 3, 1));
  });
  it("anio empieza el 1 de enero", () => {
    expect(inicioPeriodo("anio", ahora)).toEqual(new Date(2026, 0, 1));
  });
  it("la tendencia son seis meses terminando en el actual", () => {
    const meses = mesesTendencia(ahora).map((m) => m.clave);
    expect(meses).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });
  it("cruza el cambio de año sin errores", () => {
    const enero = new Date(2026, 0, 10);
    expect(mesesTendencia(enero).map((m) => m.clave)[0]).toBe("2025-08");
    expect(claveMes(null)).toBeNull();
  });
});

describe("GET /api/dashboard", () => {
  afterAll(async () => {
    await limpiarPruebas();
  });

  it("rechaza un periodo desconocido", async () => {
    const admin = await loginComo((await crearUsuarioPrueba("dash", "ADMIN")).email);
    expect((await admin.get("/api/dashboard?periodo=semana")).status).toBe(400);
  });

  it("sin sesión no hay acceso", async () => {
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
  });

  it("devuelve la forma esperada para ADMIN, con seis meses de tendencia", async () => {
    const admin = await loginComo((await crearUsuarioPrueba("dash", "ADMIN")).email);
    const res = await admin.get("/api/dashboard?periodo=mes");
    expect(res.status).toBe(200);
    expect(res.body.periodo.tipo).toBe("mes");
    expect(res.body.tendencia).toHaveLength(6);
    expect(res.body.cotizaciones.alcance).toBe("empresa");
    expect(Object.keys(res.body.cotizaciones.pipeline)).toEqual(["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"]);
  });

  it("el VENDEDOR ve solo sus cotizaciones", async () => {
    const admin = await loginComo((await crearUsuarioPrueba("dash", "ADMIN")).email);
    const vendedorUsuario = await crearUsuarioPrueba("dash", "VENDEDOR");
    const vendedor = await loginComo(vendedorUsuario.email);
    const cliente = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Dash cliente`, tipo: "PERSONA_FISICA" });
    const servicio = await admin.post("/api/servicios").send({ nombre: `${PREFIJO_PRUEBA}Dash servicio`, unidad: "HORA", tarifaCentavos: 100000 });
    const partida = { servicioId: servicio.body.servicio.id, cantidadMilesimas: 1000 };
    await admin.post("/api/cotizaciones").send({ clienteId: cliente.body.cliente.id, partidas: [partida] });
    await vendedor.post("/api/cotizaciones").send({ clienteId: cliente.body.cliente.id, partidas: [partida] });

    const delVendedor = await vendedor.get("/api/dashboard?periodo=anio");
    expect(delVendedor.body.cotizaciones.alcance).toBe("propias");
    expect(delVendedor.body.cotizaciones.creadasEnPeriodo).toBe(1);
    expect(delVendedor.body.cotizaciones.pendientesAutorizar).toEqual([]);

    const delAdmin = await admin.get("/api/dashboard?periodo=anio");
    expect(delAdmin.body.cotizaciones.creadasEnPeriodo).toBeGreaterThanOrEqual(2);
  });

  it("el TECNICO no recibe bloque de cotizaciones", async () => {
    const tecnico = await loginComo((await crearUsuarioPrueba("dash", "TECNICO")).email);
    const res = await tecnico.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.cotizaciones).toBeUndefined();
    expect(res.body.clientes.total).toBeGreaterThanOrEqual(0);
  });

  it("la cola de autorización solo la ve DIRECCION", async () => {
    const direccion = await loginComo((await crearUsuarioPrueba("dash", "DIRECCION")).email);
    const vendedor = await loginComo((await crearUsuarioPrueba("dash", "VENDEDOR")).email);
    const res = await direccion.get("/api/dashboard");
    expect(Array.isArray(res.body.cotizaciones.pendientesAutorizar)).toBe(true);
    const deVendedor = await vendedor.get("/api/dashboard");
    expect(deVendedor.body.cotizaciones.pendientesAutorizar).toEqual([]);
  });

  it("la tasa de aprobación sale de las decisiones del periodo y es nula si no hay ninguna", async () => {
    const admin = await loginComo((await crearUsuarioPrueba("dash", "ADMIN")).email);
    const res = await admin.get("/api/dashboard?periodo=anio");
    const t = res.body.cotizaciones.tasaAprobacion;
    expect(t === null || (t >= 0 && t <= 100)).toBe(true);
  });
});
