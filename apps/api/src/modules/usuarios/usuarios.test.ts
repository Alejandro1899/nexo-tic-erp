import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../lib/db.js";
import { app, DOMINIO_PRUEBA, crearUsuarioPrueba, limpiarPruebas, loginComo, PASS_PRUEBA } from "../../testing/helpers.js";

const nuevoEmail = () => `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${DOMINIO_PRUEBA}`;
const nuevoUsername = () => `u${Math.random().toString(36).slice(2, 10)}`;

describe("gestión de usuarios (solo ADMIN)", () => {
  let admin: Awaited<ReturnType<typeof loginComo>>;
  let adminId: string;
  let vendedor: Awaited<ReturnType<typeof loginComo>>;
  let superAdmin: Awaited<ReturnType<typeof loginComo>>;
  let superAdminId: string;
  let otroAdmin: Awaited<ReturnType<typeof loginComo>>;
  let otroAdminId: string;

  beforeAll(async () => {
    const a = await crearUsuarioPrueba("usradm", "ADMIN");
    adminId = a.id;
    admin = await loginComo(a.email);

    vendedor = await loginComo((await crearUsuarioPrueba("usrven", "VENDEDOR")).email);

    const s = await crearUsuarioPrueba("usrsuper", "ADMIN");
    superAdminId = s.id;
    await prisma.usuario.update({ where: { id: s.id }, data: { esSuperAdmin: true } });
    superAdmin = await loginComo(s.email);

    const o = await crearUsuarioPrueba("usrotro", "ADMIN");
    otroAdminId = o.id;
    otroAdmin = await loginComo(o.email);
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("sin sesión no hay acceso", async () => {
    expect((await request(app).get("/api/usuarios")).status).toBe(401);
  });

  it("un VENDEDOR no puede ver ni gestionar usuarios", async () => {
    expect((await vendedor.get("/api/usuarios")).status).toBe(403);
    const res = await vendedor.post("/api/usuarios").send({
      nombre: "X",
      username: nuevoUsername(),
      email: nuevoEmail(),
      rol: "TECNICO",
      passwordInicial: "clave-temporal-1",
    });
    expect(res.status).toBe(403);
  });

  it("el ADMIN crea un usuario con usuario de acceso, rol y contraseña temporal, sin devolver el hash", async () => {
    const res = await admin.post("/api/usuarios").send({
      nombre: "Técnico Nuevo",
      username: "TecNuevo.01",
      email: nuevoEmail(),
      rol: "TECNICO",
      passwordInicial: "clave-temporal-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.usuario.username).toBe("tecnuevo.01");
    expect(res.body.usuario.debeCambiarPassword).toBe(true);
    expect(res.body.usuario.passwordHash).toBeUndefined();
  });

  it("el usuario de acceso no puede repetirse: responde 409", async () => {
    const username = nuevoUsername();
    const primero = await admin.post("/api/usuarios").send({ nombre: "A", username, email: nuevoEmail(), rol: "VENDEDOR", passwordInicial: "clave-temporal-1" });
    const segundo = await admin.post("/api/usuarios").send({ nombre: "B", username, email: nuevoEmail(), rol: "VENDEDOR", passwordInicial: "clave-temporal-1" });
    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(409);
  });

  it("el usuario de acceso no admite espacios ni caracteres raros", async () => {
    const res = await admin.post("/api/usuarios").send({
      nombre: "Mal",
      username: "mal usuario",
      email: nuevoEmail(),
      rol: "VENDEDOR",
      passwordInicial: "clave-temporal-1",
    });
    expect(res.status).toBe(400);
  });

  it("el listado filtra por búsqueda y por estado, y excluye a los eliminados", async () => {
    const username = nuevoUsername();
    const creado = await admin.post("/api/usuarios").send({ nombre: "Buscable Zeta", username, email: nuevoEmail(), rol: "TECNICO", passwordInicial: "clave-temporal-1" });
    const id = creado.body.usuario.id;

    const porNombre = await admin.get(`/api/usuarios?q=${encodeURIComponent("buscable zeta")}`);
    expect(porNombre.body.usuarios.map((u: { id: string }) => u.id)).toContain(id);

    await admin.patch(`/api/usuarios/${id}`).send({ activo: false });
    const inactivos = await admin.get("/api/usuarios?estado=inactivo");
    expect(inactivos.body.usuarios.map((u: { id: string }) => u.id)).toContain(id);

    await admin.delete(`/api/usuarios/${id}`).expect(204);
    const tras = await admin.get(`/api/usuarios?q=${encodeURIComponent("buscable zeta")}`);
    expect(tras.body.usuarios.map((u: { id: string }) => u.id)).not.toContain(id);
  });

  it("el detalle devuelve un usuario vigente y 404 para uno eliminado", async () => {
    const creado = await admin.post("/api/usuarios").send({ nombre: "Detalle", username: nuevoUsername(), email: nuevoEmail(), rol: "DIRECCION", passwordInicial: "clave-temporal-1" });
    const id = creado.body.usuario.id;
    expect((await admin.get(`/api/usuarios/${id}`)).body.usuario.rol).toBe("DIRECCION");
    await admin.delete(`/api/usuarios/${id}`).expect(204);
    expect((await admin.get(`/api/usuarios/${id}`)).status).toBe(404);
  });

  it("el ADMIN no puede quitarse su propio rol ni desactivarse ni eliminarse", async () => {
    expect((await admin.patch(`/api/usuarios/${adminId}`).send({ rol: "VENDEDOR" })).status).toBe(400);
    expect((await admin.patch(`/api/usuarios/${adminId}`).send({ activo: false })).status).toBe(400);
    expect((await admin.delete(`/api/usuarios/${adminId}`)).status).toBe(400);
  });

  it("un usuario eliminado lógicamente ya no puede entrar y sus sesiones dejan de servir", async () => {
    const email = nuevoEmail();
    const creado = await admin.post("/api/usuarios").send({ nombre: "Por eliminar", username: nuevoUsername(), email, rol: "VENDEDOR", passwordInicial: "clave-temporal-1" });
    const sesionPrevia = await request(app).post("/api/auth/login").send({ usuario: email, password: "clave-temporal-1" });
    expect(sesionPrevia.status).toBe(200);
    const cookie = sesionPrevia.headers["set-cookie"]?.[0] ?? "";

    await admin.delete(`/api/usuarios/${creado.body.usuario.id}`).expect(204);

    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ usuario: email, password: "clave-temporal-1" })).status).toBe(401);
  });

  describe("super administrador", () => {
    it("otro ADMIN no puede modificarlo, eliminarlo ni restablecer su contraseña", async () => {
      expect((await otroAdmin.patch(`/api/usuarios/${superAdminId}`).send({ nombre: "Cambio" })).status).toBe(403);
      expect((await otroAdmin.delete(`/api/usuarios/${superAdminId}`)).status).toBe(403);
      expect((await otroAdmin.post(`/api/usuarios/${superAdminId}/restablecer-password`)).status).toBe(403);
    });

    it("el ADMIN normal tampoco puede hacerlo", async () => {
      expect((await admin.delete(`/api/usuarios/${superAdminId}`)).status).toBe(403);
      expect((await admin.post(`/api/usuarios/${superAdminId}/restablecer-password`)).status).toBe(403);
    });

    it("el super administrador sí puede modificar su propia cuenta", async () => {
      const res = await superAdmin.patch(`/api/usuarios/${superAdminId}`).send({ nombre: "Super Admin Renombrado" });
      expect(res.status).toBe(200);
      expect(res.body.usuario.esSuperAdmin).toBe(true);
    });
  });

  describe("restablecer contraseña", () => {
    it("genera una temporal que sirve para entrar y obliga a cambiarla", async () => {
      const email = nuevoEmail();
      const creado = await admin.post("/api/usuarios").send({ nombre: "Olvidó", username: nuevoUsername(), email, rol: "VENDEDOR", passwordInicial: "clave-temporal-1" });
      const reset = await admin.post(`/api/usuarios/${creado.body.usuario.id}/restablecer-password`);
      expect(reset.status).toBe(200);
      const temporal = reset.body.passwordTemporal as string;
      expect(temporal.length).toBeGreaterThanOrEqual(12);

      const viejaYa = await request(app).post("/api/auth/login").send({ usuario: email, password: "clave-temporal-1" });
      expect(viejaYa.status).toBe(401);

      const entra = await request(app).post("/api/auth/login").send({ usuario: email, password: temporal });
      expect(entra.status).toBe(200);
      expect(entra.body.usuario.debeCambiarPassword).toBe(true);
    });

    it("el ADMIN no se restablece la contraseña a sí mismo desde aquí", async () => {
      expect((await admin.post(`/api/usuarios/${adminId}/restablecer-password`)).status).toBe(400);
    });
  });

  it("un ADMIN normal sí puede eliminar a otro ADMIN que no es super administrador", async () => {
    await admin.delete(`/api/usuarios/${otroAdminId}`).expect(204);
  });
});

describe("cambio de contraseña por el propio usuario", () => {
  it("con la contraseña actual correcta cambia la clave y limpia la marca de obligatorio", async () => {
    const usuario = await crearUsuarioPrueba("cambio", "VENDEDOR");
    await prisma.usuario.update({ where: { id: usuario.id }, data: { debeCambiarPassword: true } });
    const agente = await loginComo(usuario.email);

    const malo = await agente.post("/api/auth/cambiar-password").send({ passwordActual: "otra", passwordNueva: "nueva-clave-1" });
    expect(malo.status).toBe(400);

    const ok = await agente.post("/api/auth/cambiar-password").send({ passwordActual: PASS_PRUEBA, passwordNueva: "nueva-clave-1" });
    expect(ok.status).toBe(200);
    expect(ok.body.usuario.debeCambiarPassword).toBe(false);
    expect((await agente.get("/api/auth/me")).status).toBe(200);
  });
});
