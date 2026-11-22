import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db.js";
import { crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

// Cálculo de referencia (packages/shared): 2.5 h a $1,000 = $2,500.00; IVA 16 % = $400.00; total $2,900.00.
const SUBTOTAL = 250000;
const IVA = 40000;
const TOTAL = 290000;

describe("cotizaciones, categorías y servicios por cliente", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let otroVendedor: Awaited<ReturnType<typeof loginComo>>;
  let tecnico: Awaited<ReturnType<typeof loginComo>>;
  let servicioId: string;
  let clienteId: string;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("cot", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("cot", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("cot", "VENDEDOR")).email);
    otroVendedor = await loginComo((await crearUsuarioPrueba("cot", "VENDEDOR")).email);
    tecnico = await loginComo((await crearUsuarioPrueba("cot", "TECNICO")).email);

    const servicio = await direccion.post("/api/servicios").send({
      nombre: `${PREFIJO_PRUEBA}Soporte cotizable`,
      unidad: "HORA",
      tarifaCentavos: 100000,
    });
    servicioId = servicio.body.servicio.id;

    const cliente = await direccion.post("/api/clientes").send({
      nombre: `${PREFIJO_PRUEBA}Cliente cotizable`,
      tipo: "PERSONA_FISICA",
    });
    clienteId = cliente.body.cliente.id;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  const partidaCatalogo = () => ({ servicioId, cantidadMilesimas: 2500 });

  describe("categorías", () => {
    it("solo ADMIN y DIRECCION crean categorías; el VENDEDOR no", async () => {
      const nombre = `${PREFIJO_PRUEBA}Redes`;
      expect((await vendedor.post("/api/categorias").send({ nombre })).status).toBe(403);
      expect((await direccion.post("/api/categorias").send({ nombre })).status).toBe(201);
      expect((await direccion.post("/api/categorias").send({ nombre })).status).toBe(409);
    });

    it("un servicio puede tener categoría y la categoría debe existir", async () => {
      const cat = await direccion.post("/api/categorias").send({ nombre: `${PREFIJO_PRUEBA}Cableado` });
      const ok = await direccion.post("/api/servicios").send({
        nombre: `${PREFIJO_PRUEBA}Cableado nuevo`,
        categoriaId: cat.body.categoria.id,
        unidad: "PROYECTO",
        tarifaCentavos: 500000,
      });
      expect(ok.status).toBe(201);
      expect(ok.body.servicio.categoriaId).toBe(cat.body.categoria.id);

      const invalida = await direccion.post("/api/servicios").send({
        nombre: `${PREFIJO_PRUEBA}Sin categoría real`,
        categoriaId: "no-existe",
        unidad: "HORA",
        tarifaCentavos: 1000,
      });
      expect(invalida.status).toBe(400);
    });
  });

  describe("servicios asignados al cliente", () => {
    it("el VENDEDOR no asigna servicios; DIRECCION sí", async () => {
      expect((await vendedor.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId })).status).toBe(403);
      expect((await direccion.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId })).status).toBe(201);
    });

    it("muestra la tarifa efectiva: la propia del cliente si existe, si no la del catálogo", async () => {
      const lista = await vendedor.get(`/api/clientes/${clienteId}/servicios`);
      const s = lista.body.servicios.find((x: { id: string }) => x.id === servicioId);
      expect(s.tarifaCatalogoCentavos).toBe(100000);
      expect(s.tarifaEfectivaCentavos).toBe(100000);

      await direccion.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId, tarifaCentavos: 80000 });
      const conTarifa = await vendedor.get(`/api/clientes/${clienteId}/servicios`);
      const s2 = conTarifa.body.servicios.find((x: { id: string }) => x.id === servicioId);
      expect(s2.tarifaEfectivaCentavos).toBe(80000);
    });

    it("quitar un servicio es lógico y volver a asignarlo lo reactiva", async () => {
      expect((await direccion.delete(`/api/clientes/${clienteId}/servicios/${servicioId}`)).status).toBe(204);
      const tras = await vendedor.get(`/api/clientes/${clienteId}/servicios`);
      expect(tras.body.servicios.map((x: { id: string }) => x.id)).not.toContain(servicioId);

      expect((await direccion.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId })).status).toBe(201);
      const otra = await vendedor.get(`/api/clientes/${clienteId}/servicios`);
      expect(otra.body.servicios.map((x: { id: string }) => x.id)).toContain(servicioId);
    });
  });

  describe("cotizaciones", () => {
    it("TECNICO no ve ni crea cotizaciones", async () => {
      expect((await tecnico.get("/api/cotizaciones")).status).toBe(403);
      expect((await tecnico.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] })).status).toBe(403);
    });

    it("ADMIN, DIRECCION y VENDEDOR pueden crear; el total lo calcula el servidor", async () => {
      const res = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      expect(res.status).toBe(201);
      expect(res.body.cotizacion.estado).toBe("BORRADOR");
      expect(res.body.cotizacion.subtotalCentavos).toBe(SUBTOTAL);
      expect(res.body.cotizacion.ivaCentavos).toBe(IVA);
      expect(res.body.cotizacion.totalCentavos).toBe(TOTAL);
      expect((await admin.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] })).status).toBe(201);
      expect((await direccion.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] })).status).toBe(201);
    });

    it("el precio de un servicio del catálogo no se toma del cuerpo de la petición", async () => {
      const res = await vendedor
        .post("/api/cotizaciones")
        .send({ clienteId, partidas: [{ servicioId, cantidadMilesimas: 2500, precioUnitarioCentavos: 1 }] });
      expect(res.body.cotizacion.totalCentavos).toBe(TOTAL);
    });

    it("usa la tarifa propia del cliente al cotizar", async () => {
      await direccion.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId, tarifaCentavos: 50000 });
      const res = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      // 2.5 h a $500 = $1,250.00; IVA $200.00; total $1,450.00.
      expect(res.body.cotizacion.subtotalCentavos).toBe(125000);
      expect(res.body.cotizacion.totalCentavos).toBe(145000);
      await direccion.post(`/api/clientes/${clienteId}/servicios`).send({ servicioId, tarifaCentavos: 100000 });
    });

    it("una partida libre necesita descripción y precio", async () => {
      expect((await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [{ cantidadMilesimas: 1000 }] })).status).toBe(400);
      const ok = await vendedor.post("/api/cotizaciones").send({
        clienteId,
        partidas: [{ descripcion: "Cable UTP", cantidadMilesimas: 1000, precioUnitarioCentavos: 1000 }],
      });
      expect(ok.status).toBe(201);
    });

    it("el folio sigue el formato COT-AAAA-NNNN y es consecutivo", async () => {
      const a = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      const b = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      expect(a.body.cotizacion.folio).toMatch(/^COT-\d{4}-\d{4}$/);
      const na = Number(a.body.cotizacion.folio.slice(-4));
      const nb = Number(b.body.cotizacion.folio.slice(-4));
      expect(nb).toBe(na + 1);
    });

    it("el creador edita su borrador; otro vendedor no", async () => {
      const creada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      const id = creada.body.cotizacion.id;
      expect((await otroVendedor.patch(`/api/cotizaciones/${id}`).send({ notas: "no" })).status).toBe(403);
      const ok = await vendedor.patch(`/api/cotizaciones/${id}`).send({
        partidas: [{ servicioId, cantidadMilesimas: 1000 }],
        notas: "Incluye visita",
      });
      expect(ok.status).toBe(200);
      expect(ok.body.cotizacion.totalCentavos).toBe(116000);
      expect(ok.body.cotizacion.notas).toBe("Incluye visita");
    });

    it("el flujo es borrador, enviada y aprobada, y solo DIRECCION o ADMIN autorizan", async () => {
      const creada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      const id = creada.body.cotizacion.id;

      expect((await vendedor.post(`/api/cotizaciones/${id}/aprobar`)).status).toBe(403);
      expect((await direccion.post(`/api/cotizaciones/${id}/aprobar`)).status).toBe(409); // aún es borrador

      expect((await vendedor.post(`/api/cotizaciones/${id}/enviar`)).body.cotizacion.estado).toBe("ENVIADA");
      expect((await vendedor.patch(`/api/cotizaciones/${id}`).send({ notas: "tarde" })).status).toBe(409);

      const aprobada = await direccion.post(`/api/cotizaciones/${id}/aprobar`);
      expect(aprobada.status).toBe(200);
      expect(aprobada.body.cotizacion.estado).toBe("APROBADA");
      expect(aprobada.body.cotizacion.autorizadaPorId).toBeTruthy();
      expect((await direccion.post(`/api/cotizaciones/${id}/rechazar`)).status).toBe(409);
    });

    it("una cotización rechazada queda registrada como rechazada", async () => {
      const creada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      const id = creada.body.cotizacion.id;
      await vendedor.post(`/api/cotizaciones/${id}/enviar`);
      const rechazada = await admin.post(`/api/cotizaciones/${id}/rechazar`);
      expect(rechazada.body.cotizacion.estado).toBe("RECHAZADA");
    });

    it("una enviada con vigencia vencida no se puede autorizar y se muestra como vencida", async () => {
      const creada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()], vigenciaDias: 1 });
      const id = creada.body.cotizacion.id;
      await vendedor.post(`/api/cotizaciones/${id}/enviar`);
      await prisma.cotizacion.update({ where: { id }, data: { vigenciaHasta: new Date(Date.now() - 1000) } });

      const intento = await direccion.post(`/api/cotizaciones/${id}/aprobar`);
      expect(intento.status).toBe(409);
      expect(intento.body.error).toBe("vencida");

      const detalle = await direccion.get(`/api/cotizaciones/${id}`);
      expect(detalle.body.cotizacion.estadoMostrado).toBe("VENCIDA");
    });

    it("solo se eliminan borradores y lo hace quien la creó o un administrador", async () => {
      const creada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      const id = creada.body.cotizacion.id;
      expect((await otroVendedor.delete(`/api/cotizaciones/${id}`)).status).toBe(403);
      expect((await vendedor.delete(`/api/cotizaciones/${id}`)).status).toBe(204);
      expect((await vendedor.get(`/api/cotizaciones/${id}`)).status).toBe(404);

      const enviada = await vendedor.post("/api/cotizaciones").send({ clienteId, partidas: [partidaCatalogo()] });
      await vendedor.post(`/api/cotizaciones/${enviada.body.cotizacion.id}/enviar`);
      expect((await admin.delete(`/api/cotizaciones/${enviada.body.cotizacion.id}`)).status).toBe(409);
    });

    it("el listado filtra por estado", async () => {
      const res = await direccion.get("/api/cotizaciones?estado=APROBADA");
      expect(res.status).toBe(200);
      expect(res.body.cotizaciones.every((c: { estado: string }) => c.estado === "APROBADA")).toBe(true);
    });
  });
});
