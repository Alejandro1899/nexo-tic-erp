import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, crearUsuarioPrueba, limpiarPruebas, loginComo, PASS_PRUEBA } from "../../testing/helpers.js";

describe("autenticación", () => {
  let email: string;
  let username: string;

  beforeAll(async () => {
    const usuario = await crearUsuarioPrueba("auth", "ADMIN");
    email = usuario.email;
    username = usuario.username;
  });

  afterAll(async () => {
    await limpiarPruebas();
  });

  it("se puede entrar con el correo o con el usuario de acceso", async () => {
    const porCorreo = await request(app).post("/api/auth/login").send({ usuario: email, password: PASS_PRUEBA });
    const porUsuario = await request(app).post("/api/auth/login").send({ usuario: username, password: PASS_PRUEBA });
    expect(porCorreo.status).toBe(200);
    expect(porUsuario.status).toBe(200);
    expect(porUsuario.body.usuario.username).toBe(username);
  });

  it("login correcto devuelve usuario y cookie httpOnly, sin pedir empresa", async () => {
    const res = await request(app).post("/api/auth/login").send({ usuario: email, password: PASS_PRUEBA });
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe("ADMIN");
    expect(res.body.tenant).toBeUndefined();
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("nexo_sesion=");
  });

  it("contraseña incorrecta responde 401 sin distinguir el motivo", async () => {
    const res = await request(app).post("/api/auth/login").send({ usuario: email, password: "otra-clave" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("credenciales_invalidas");
  });

  it("correo inexistente responde igual que contraseña incorrecta", async () => {
    const res = await request(app).post("/api/auth/login").send({ usuario: "no-existe@prueba.test", password: PASS_PRUEBA });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("credenciales_invalidas");
  });

  it("/me requiere sesión y logout la revoca", async () => {
    const agent = await loginComo(email);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    await agent.post("/api/auth/logout").expect(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("sin cookie no hay acceso", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });
});
