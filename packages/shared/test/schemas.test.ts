import { describe, expect, it } from "vitest";
import { CategoriaCrearSchema, ClienteActualizarSchema, ClienteCrearSchema, CotizacionCrearSchema, CotizacionPartidaSchema, datosFiscalesPendientes, UsuarioCrearSchema, usernameSchema } from "../src/schemas.js";

describe("ClienteCrearSchema", () => {
  it("rechaza campos extra como estado o id de empresa en el cuerpo", () => {
    expect(ClienteCrearSchema.safeParse({ nombre: "X", tipo: "PERSONA_MORAL", estado: "ACTIVO" }).success).toBe(false);
    expect(ClienteCrearSchema.safeParse({ nombre: "X", tipo: "PERSONA_MORAL", tenantId: "otro" }).success).toBe(false);
  });
  it("normaliza el RFC a mayúsculas", () => {
    const r = ClienteCrearSchema.safeParse({ nombre: "X", tipo: "PERSONA_MORAL", rfc: "cno010101ab1" });
    expect(r.success && r.data.rfc).toBe("CNO010101AB1");
  });
  it("rechaza un RFC inválido", () => {
    expect(ClienteCrearSchema.safeParse({ nombre: "X", tipo: "PERSONA_MORAL", rfc: "123" }).success).toBe(false);
  });
  it("acepta los tres tipos de cliente de la v1", () => {
    for (const tipo of ["PERSONA_FISICA", "PERSONA_MORAL", "NEGOCIO_SIN_CONSTITUCION"]) {
      expect(ClienteCrearSchema.safeParse({ nombre: "X", tipo }).success).toBe(true);
    }
  });
  it("rechaza tipos que no están en el alcance", () => {
    expect(ClienteCrearSchema.safeParse({ nombre: "X", tipo: "GOBIERNO" }).success).toBe(false);
  });
});

describe("ClienteActualizarSchema", () => {
  it("no aplica estado por defecto en actualizaciones parciales", () => {
    const r = ClienteActualizarSchema.safeParse({ nombre: "Nuevo nombre" });
    expect(r.success && r.data.estado).toBeUndefined();
  });
  it("permite cambiar el estado a cualquiera de los de la v1", () => {
    expect(ClienteActualizarSchema.safeParse({ estado: "SUSPENDIDO" }).success).toBe(true);
    expect(ClienteActualizarSchema.safeParse({ estado: "INACTIVO" }).success).toBe(false);
  });
});

describe("datosFiscalesPendientes", () => {
  it("persona física necesita RFC", () => {
    expect(datosFiscalesPendientes({ tipo: "PERSONA_FISICA", rfc: null })).toBe(true);
    expect(datosFiscalesPendientes({ tipo: "PERSONA_FISICA", rfc: "AAA010101AB1" })).toBe(false);
  });
  it("persona moral necesita RFC y razón social", () => {
    expect(datosFiscalesPendientes({ tipo: "PERSONA_MORAL", rfc: "AAA010101AB1", razonSocial: null })).toBe(true);
    expect(datosFiscalesPendientes({ tipo: "PERSONA_MORAL", rfc: "AAA010101AB1", razonSocial: "X SA" })).toBe(false);
  });
  it("negocio sin constitución no exige datos fiscales", () => {
    expect(datosFiscalesPendientes({ tipo: "NEGOCIO_SIN_CONSTITUCION" })).toBe(false);
  });
});

describe("usuario de acceso", () => {
  it("se normaliza a minúsculas y acepta punto, guion y guion bajo", () => {
    expect(usernameSchema.parse("Ana.Lopez_2-x")).toBe("ana.lopez_2-x");
  });
  it("rechaza espacios, acentos y menos de 3 caracteres", () => {
    expect(usernameSchema.safeParse("ana lopez").success).toBe(false);
    expect(usernameSchema.safeParse("ñandú").success).toBe(false);
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });
  it("el alta de usuario exige usuario, correo, rol y contraseña temporal", () => {
    const ok = UsuarioCrearSchema.safeParse({ nombre: "Ana", username: "ana", email: "ana@x.mx", rol: "VENDEDOR", passwordInicial: "clave-temporal" });
    expect(ok.success).toBe(true);
    expect(UsuarioCrearSchema.safeParse({ nombre: "Ana", email: "ana@x.mx", rol: "VENDEDOR", passwordInicial: "clave-temporal" }).success).toBe(false);
  });
});

describe("categorías, asignaciones y cotizaciones", () => {
  it("una partida libre exige descripción y precio", () => {
    expect(CotizacionPartidaSchema.safeParse({ cantidadMilesimas: 1000 }).success).toBe(false);
    expect(CotizacionPartidaSchema.safeParse({ descripcion: "Cable", cantidadMilesimas: 1000 }).success).toBe(false);
    expect(CotizacionPartidaSchema.safeParse({ descripcion: "Cable", cantidadMilesimas: 1000, precioUnitarioCentavos: 5000 }).success).toBe(true);
  });
  it("una partida de catálogo no necesita precio ni descripción", () => {
    expect(CotizacionPartidaSchema.safeParse({ servicioId: "srv1", cantidadMilesimas: 2500 }).success).toBe(true);
  });
  it("la cantidad debe ser positiva y el descuento máximo 100 %", () => {
    expect(CotizacionPartidaSchema.safeParse({ servicioId: "s", cantidadMilesimas: 0 }).success).toBe(false);
    expect(CotizacionPartidaSchema.safeParse({ servicioId: "s", cantidadMilesimas: 1000, descuentoPb: 10001 }).success).toBe(false);
  });
  it("una cotización necesita partidas y usa 15 días de vigencia por defecto", () => {
    expect(CotizacionCrearSchema.safeParse({ clienteId: "c", partidas: [] }).success).toBe(false);
    const r = CotizacionCrearSchema.safeParse({ clienteId: "c", partidas: [{ servicioId: "s", cantidadMilesimas: 1000 }] });
    expect(r.success && r.data.vigenciaDias).toBe(15);
  });
  it("la categoría no admite nombre vacío", () => {
    expect(CategoriaCrearSchema.safeParse({ nombre: "  " }).success).toBe(false);
  });
});
