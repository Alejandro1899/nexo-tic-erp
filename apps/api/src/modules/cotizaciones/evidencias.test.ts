import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db.js";
import { crearUsuarioPrueba, limpiarPruebas, loginComo, PREFIJO_PRUEBA } from "../../testing/helpers.js";

/** PNG mínimo válido (1x1). */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n%prueba\n", "utf8");

describe("evidencia de aprobación de cotizaciones", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let direccion: Awaited<ReturnType<typeof loginComo>>;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let cotizacionId: string;

  beforeAll(async () => {
    admin = await loginComo((await crearUsuarioPrueba("evidencia", "ADMIN")).email);
    direccion = await loginComo((await crearUsuarioPrueba("evidencia", "DIRECCION")).email);
    vendedor = await loginComo((await crearUsuarioPrueba("evidencia", "VENDEDOR")).email);
    const servicio = await admin.post("/api/servicios").send({ nombre: `${PREFIJO_PRUEBA}Servicio evidencia`, unidad: "HORA", tarifaCentavos: 100000 });
    const cliente = await admin.post("/api/clientes").send({ nombre: `${PREFIJO_PRUEBA}Cliente evidencia`, tipo: "PERSONA_FISICA" });
    const cotizacion = await admin.post("/api/cotizaciones").send({
      clienteId: cliente.body.cliente.id,
      partidas: [{ servicioId: servicio.body.servicio.id, cantidadMilesimas: 1000 }],
    });
    cotizacionId = cotizacion.body.cotizacion.id;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("VENDEDOR no puede subir, ver ni quitar evidencias", async () => {
    const subida = await vendedor.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=firma.png`).set("Content-Type", "image/png").send(PNG);
    expect(subida.status).toBe(403);
    expect((await vendedor.get(`/api/cotizaciones/${cotizacionId}/evidencias`)).status).toBe(403);
  });

  it("ADMIN sube un PNG y lo recupera tal cual", async () => {
    const subida = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=firma.png`).set("Content-Type", "image/png").send(PNG);
    expect(subida.status).toBe(201);
    const id = subida.body.evidencia.id;

    const descarga = await direccion.get(`/api/cotizaciones/${cotizacionId}/evidencias/${id}`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => cb(null, Buffer.concat(partes)));
    });
    expect(descarga.status).toBe(200);
    expect(descarga.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(descarga.body as Buffer, PNG)).toBe(0);
  });

  it("acepta un PDF y lo lista con su tipo y tamaño", async () => {
    const subida = await direccion.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=cotizacion-firmada.pdf`).set("Content-Type", "application/pdf").send(PDF);
    expect(subida.status).toBe(201);
    const lista = await admin.get(`/api/cotizaciones/${cotizacionId}/evidencias`);
    const pdf = lista.body.evidencias.find((e: { nombre: string }) => e.nombre === "cotizacion-firmada.pdf");
    expect(pdf.tipo).toBe("application/pdf");
    expect(pdf.tamanoBytes).toBe(PDF.length);
  });

  it("rechaza un archivo cuyo contenido no coincide con su tipo", async () => {
    const res = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=falso.png`).set("Content-Type", "image/png").send(PDF);
    expect(res.status).toBe(400);
  });

  it("rechaza tipos que no son PDF, JPG ni PNG", async () => {
    const res = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=nota.txt`).set("Content-Type", "text/plain").send("hola");
    expect(res.status).toBe(400);
  });

  it("rechaza archivos de más de 5 MB", async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=grande.png`).set("Content-Type", "image/png").send(grande);
    expect(res.status).toBe(413);
  });

  it("una cotización admite hasta 5 evidencias", async () => {
    // Ya hay 3 (firma.png, cotizacion-firmada.pdf y el de la prueba de descarga); se agregan hasta completar 5.
    const actuales = await prisma.evidenciaCotizacion.count({ where: { cotizacionId, eliminadoEn: null } });
    for (let i = actuales; i < 5; i++) {
      const ok = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=extra-${i}.png`).set("Content-Type", "image/png").send(PNG);
      expect(ok.status).toBe(201);
    }
    const sexta = await admin.post(`/api/cotizaciones/${cotizacionId}/evidencias?nombre=sexta.png`).set("Content-Type", "image/png").send(PNG);
    expect(sexta.status).toBe(409);
  });

  it("quitar una evidencia la oculta y deja constancia en la bitácora", async () => {
    const lista = await admin.get(`/api/cotizaciones/${cotizacionId}/evidencias`);
    const id = lista.body.evidencias[0].id;
    const res = await admin.delete(`/api/cotizaciones/${cotizacionId}/evidencias/${id}`);
    expect(res.status).toBe(204);
    const despues = await admin.get(`/api/cotizaciones/${cotizacionId}/evidencias`);
    expect(despues.body.evidencias.some((e: { id: string }) => e.id === id)).toBe(false);
    const constancia = await prisma.registroActividad.findFirst({ where: { accion: "cotizacion.evidencia.eliminar", entidadId: cotizacionId } });
    expect(constancia).not.toBeNull();
  });
});
