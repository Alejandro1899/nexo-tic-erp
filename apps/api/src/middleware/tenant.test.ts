import { describe, expect, it } from "vitest";
import { requireTenant } from "./tenant.js";

function run(locals: Record<string, unknown>) {
  let status = 200;
  let called = false;
  const res = {
    locals,
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as any;
  requireTenant({} as any, res, () => {
    called = true;
  });
  return { status, called };
}

describe("requireTenant", () => {
  it("rechaza sin sesión", () => {
    expect(run({})).toEqual({ status: 401, called: false });
  });
  it("deja pasar con tenant en la sesión", () => {
    expect(run({ sesion: { usuarioId: "u1", tenantId: "t1", roles: [] } })).toEqual({
      status: 200,
      called: true,
    });
  });
});
