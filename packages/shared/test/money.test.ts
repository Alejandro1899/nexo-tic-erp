import { describe, expect, it } from "vitest";
import { aplicarTasaPb, calcularTotales, formatearMXN, importeLinea, pesosACentavos } from "../src/money.js";

describe("aplicarTasaPb", () => {
  it("calcula IVA 16% sobre 100.00 MXN", () => {
    expect(aplicarTasaPb(10000, 1600)).toBe(1600);
  });
  it("redondea mitad hacia arriba", () => {
    // 0.5 centavos -> 1
    expect(aplicarTasaPb(5, 1000)).toBe(1);
    // 0.4 centavos -> 0
    expect(aplicarTasaPb(4, 1000)).toBe(0);
  });
  it("rechaza decimales", () => {
    expect(() => aplicarTasaPb(10.5, 1600)).toThrow(RangeError);
  });
});

describe("importeLinea", () => {
  it("multiplica precio por cantidad en milésimas", () => {
    // 2.5 horas a $300.00
    expect(importeLinea(30000, 2500)).toBe(75000);
  });
});

describe("calcularTotales", () => {
  it("suma líneas, aplica descuento antes de IVA", () => {
    const t = calcularTotales([
      { precioUnitarioCentavos: 30000, cantidadMilesimas: 2500, descuentoPb: 1000 }, // 750.00 - 10%
      { precioUnitarioCentavos: 10000, cantidadMilesimas: 1000 }, // 100.00
    ]);
    expect(t.subtotalCentavos).toBe(85000);
    expect(t.descuentoCentavos).toBe(7500);
    expect(t.baseGravableCentavos).toBe(77500);
    expect(t.ivaCentavos).toBe(12400);
    expect(t.totalCentavos).toBe(89900);
  });
  it("lista vacía da ceros", () => {
    expect(calcularTotales([]).totalCentavos).toBe(0);
  });
});

describe("formatearMXN", () => {
  it("formatea centavos para vista", () => {
    expect(formatearMXN(123456)).toBe("$1,234.56");
    expect(formatearMXN(5)).toBe("$0.05");
  });
});

describe("pesosACentavos", () => {
  it("convierte texto de pesos sin floats", () => {
    expect(pesosACentavos("1234")).toBe(123400);
    expect(pesosACentavos("1,234.5")).toBe(123450);
    expect(pesosACentavos("0.05")).toBe(5);
  });
  it("rechaza montos inválidos", () => {
    expect(() => pesosACentavos("12.345")).toThrow(RangeError);
    expect(() => pesosACentavos("abc")).toThrow(RangeError);
  });
});

describe("calcularAnticipo", () => {
  it("calcula el anticipo sobre el total y el saldo con la diferencia", async () => {
    const { calcularAnticipo } = await import("../src/money.js");
    expect(calcularAnticipo(313200, 5000)).toEqual({ anticipoCentavos: 156600, saldoCentavos: 156600 });
  });

  it("con 0 % no hay anticipo y todo es saldo", async () => {
    const { calcularAnticipo } = await import("../src/money.js");
    expect(calcularAnticipo(313200, 0)).toEqual({ anticipoCentavos: 0, saldoCentavos: 313200 });
  });

  it("anticipo más saldo siempre suma el total, aunque redondee", async () => {
    const { calcularAnticipo } = await import("../src/money.js");
    const r = calcularAnticipo(100001, 3333);
    expect(r.anticipoCentavos + r.saldoCentavos).toBe(100001);
  });
});
