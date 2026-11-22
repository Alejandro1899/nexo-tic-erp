import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/errors.js";
import { requireRole } from "./roles.js";

const resConSesion = (rol: string) => ({ locals: { sesion: { usuarioId: "u", rol } } }) as any;

describe("requireRole", () => {
  it("deja pasar al rol permitido", () => {
    const next = vi.fn();
    requireRole("ADMIN")({} as any, resConSesion("ADMIN"), next);
    expect(next).toHaveBeenCalledOnce();
  });
  it("rechaza con 403 a un rol no permitido", () => {
    const next = vi.fn();
    let error: unknown;
    try {
      requireRole("ADMIN")({} as any, resConSesion("DIRECCION"), next);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
