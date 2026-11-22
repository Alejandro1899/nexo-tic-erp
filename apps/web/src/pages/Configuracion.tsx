import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LOGO_MAX_BYTES } from "@nexo/shared";
import { api, ApiError, BASE_API, mensajeError } from "../api";

/** Datos de la empresa. Solo ADMIN los cambia; el resto de la app los usa en cotizaciones y PDF. */
interface Configuracion {
  nombreComercial: string;
  razonSocial: string | null;
  rfc: string | null;
  regimenFiscal: string | null;
  codigoPostal: string | null;
  correo: string | null;
  telefono: string | null;
  sitioWeb: string | null;
  condicionesCotizacion: string;
  vigenciaDiasDefault: number;
  prefijoFolioCotizacion: string;
  tieneLogo: boolean;
}

type Formulario = Omit<Configuracion, "tieneLogo">;

/** Campos de texto opcionales: vacío se guarda como null. */
const OPCIONALES = ["razonSocial", "rfc", "regimenFiscal", "codigoPostal", "correo", "telefono", "sitioWeb"] as const;

export function Configuracion() {
  const [original, setOriginal] = useState<Configuracion | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ configuracion: Configuracion }>("/api/configuracion");
      setOriginal(data.configuracion);
      const { tieneLogo: _tieneLogo, ...resto } = data.configuracion;
      setForm(resto);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => (f ? { ...f, [campo]: valor } : f));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    setMensaje(null);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = { ...form, vigenciaDiasDefault: Number(form.vigenciaDiasDefault) };
      for (const campo of OPCIONALES) {
        const valor = form[campo];
        cuerpo[campo] = valor && valor.trim() ? valor.trim() : null;
      }
      const data = await api<{ configuracion: Configuracion }>("/api/configuracion", { method: "PATCH", body: cuerpo });
      setOriginal(data.configuracion);
      setMensaje("Cambios guardados.");
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function subirLogo(archivo: File) {
    setMensaje(null);
    setError(null);
    if (archivo.type !== "image/png") {
      setError("El logo debe ser un archivo PNG.");
      return;
    }
    if (archivo.size > LOGO_MAX_BYTES) {
      setError("El logo no puede pesar más de 500 KB.");
      return;
    }
    try {
      const res = await fetch(`${BASE_API}/api/configuracion/logo`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "image/png" },
        body: archivo,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error ?? "error", data.mensaje ?? "No se pudo subir el logo");
      }
      setLogoVersion((v) => v + 1);
      await cargar();
      setMensaje("Logo actualizado.");
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function quitarLogo() {
    if (!window.confirm("¿Quitar el logo de la empresa?")) return;
    try {
      await api("/api/configuracion/logo", { method: "DELETE" });
      setLogoVersion((v) => v + 1);
      await cargar();
      setMensaje("Logo quitado.");
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  if (!form || !original) return error ? <p className="error">{error}</p> : <p>Cargando…</p>;

  return (
    <section>
      <div className="barra">
        <h2>Empresa</h2>
      </div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p>{mensaje}</p>}

      <div className="tarjeta">
        <h3>Logo</h3>
        <div className="acciones" style={{ alignItems: "center" }}>
          {original.tieneLogo ? (
            <img
              src={`${BASE_API}/api/configuracion/logo?v=${logoVersion}`}
              alt="Logo de la empresa"
              style={{ maxHeight: 80, maxWidth: 240, background: "#fff", border: "1px solid #e3e8ef", padding: 8 }}
            />
          ) : (
            <p>Sin logo.</p>
          )}
        </div>
        <div className="acciones">
          <label>
            Subir PNG (máx. 500 KB)
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subirLogo(archivo);
                e.target.value = "";
              }}
            />
          </label>
          {original.tieneLogo && <button type="button" onClick={() => void quitarLogo()}>Quitar logo</button>}
        </div>
      </div>

      <form className="tarjeta" onSubmit={guardar}>
        <h3>Datos de la empresa</h3>
        <div className="grid">
          <label>
            Nombre comercial
            <input value={form.nombreComercial} onChange={(e) => cambiar("nombreComercial", e.target.value)} required maxLength={200} />
          </label>
          <label>
            Razón social
            <input value={form.razonSocial ?? ""} onChange={(e) => cambiar("razonSocial", e.target.value)} maxLength={200} />
          </label>
          <label>
            RFC
            <input value={form.rfc ?? ""} onChange={(e) => cambiar("rfc", e.target.value.toUpperCase())} maxLength={13} />
          </label>
          <label>
            Régimen fiscal
            <input value={form.regimenFiscal ?? ""} onChange={(e) => cambiar("regimenFiscal", e.target.value)} maxLength={100} />
          </label>
          <label>
            Código postal
            <input value={form.codigoPostal ?? ""} onChange={(e) => cambiar("codigoPostal", e.target.value)} maxLength={5} inputMode="numeric" />
          </label>
          <label>
            Correo de contacto
            <input type="email" value={form.correo ?? ""} onChange={(e) => cambiar("correo", e.target.value)} maxLength={200} />
          </label>
          <label>
            Teléfono
            <input value={form.telefono ?? ""} onChange={(e) => cambiar("telefono", e.target.value)} maxLength={20} />
          </label>
          <label>
            Sitio web
            <input value={form.sitioWeb ?? ""} onChange={(e) => cambiar("sitioWeb", e.target.value)} maxLength={200} />
          </label>
        </div>

        <h3 style={{ marginTop: "1.25rem" }}>Cotizaciones</h3>
        <div className="grid">
          <label>
            Vigencia por defecto (días)
            <input
              type="number"
              min={1}
              max={90}
              value={form.vigenciaDiasDefault}
              onChange={(e) => cambiar("vigenciaDiasDefault", Number(e.target.value))}
              required
            />
          </label>
          <label>
            Prefijo del folio
            <input
              value={form.prefijoFolioCotizacion}
              onChange={(e) => cambiar("prefijoFolioCotizacion", e.target.value.toUpperCase())}
              maxLength={4}
              required
            />
            <small>Por ejemplo COT o NX. Solo afecta cotizaciones nuevas.</small>
          </label>
        </div>
        <label style={{ marginTop: "0.75rem" }}>
          Condiciones de la cotización
          <textarea
            value={form.condicionesCotizacion}
            onChange={(e) => cambiar("condicionesCotizacion", e.target.value)}
            rows={6}
            required
            style={{ font: "inherit", padding: "0.45rem", border: "1px solid #c5ced9", borderRadius: 6 }}
          />
        </label>

        <div className="acciones">
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}
