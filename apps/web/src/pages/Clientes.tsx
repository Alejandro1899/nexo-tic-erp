import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, mensajeError } from "../api";
import { esAdminODireccion, useAuth } from "../auth";
import { Badge, type Tono } from "../components/Badge";

// Valores según docs/ALCANCE-NEXOTIC-ERP.md, secciones 4.1, 4.12 y 5.
export type Tipo = "PERSONA_FISICA" | "PERSONA_MORAL" | "NEGOCIO_SIN_CONSTITUCION";
export type Estado = "EN_REVISION" | "EN_PROCESO" | "ACTIVO" | "SUSPENDIDO" | "FINALIZADO";

export interface Cliente {
  id: string;
  folio: string;
  nombre: string;
  tipo: Tipo;
  estado: Estado;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscal: string | null;
  codigoPostal: string | null;
  datosFiscalesPendientes: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export const ETIQUETA_TIPO: Record<Tipo, string> = {
  PERSONA_FISICA: "Persona física",
  PERSONA_MORAL: "Persona moral",
  NEGOCIO_SIN_CONSTITUCION: "Negocio sin constitución",
};

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  EN_REVISION: "En revisión",
  EN_PROCESO: "En proceso",
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
  FINALIZADO: "Finalizado",
};

export const TONO_ESTADO: Record<Estado, Tono> = {
  EN_REVISION: "amarillo",
  EN_PROCESO: "azul",
  ACTIVO: "verde",
  SUSPENDIDO: "rojo",
  FINALIZADO: "gris",
};

export function EstadoCliente({ estado }: { estado: Estado }) {
  return <Badge tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

export function Clientes() {
  const { sesion } = useAuth();
  // El frontend solo oculta opciones; el backend es quien rechaza.
  const puedeAgregar = esAdminODireccion(sesion?.usuario.rol);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q, estado });
      const data = await api<{ clientes: Cliente[] }>(`/api/clientes?${params.toString()}`);
      setClientes(data.clientes);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [q, estado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <section>
      <div className="barra">
        <h2>Clientes</h2>
        <input placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_ESTADO[s]}
            </option>
          ))}
        </select>
        {puedeAgregar && !creando && <button onClick={() => setCreando(true)}>Nuevo cliente</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {creando && puedeAgregar && (
        <ClienteFormulario
          inicial={null}
          onCancelar={() => setCreando(false)}
          onGuardado={async () => {
            setCreando(false);
            await cargar();
          }}
        />
      )}

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>RFC</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id} className="fila">
              <td>{c.folio}</td>
              <td>
                <Link to={`/clientes/${c.id}`}>{c.nombre}</Link>
                {c.datosFiscalesPendientes && <small> · datos fiscales pendientes</small>}
              </td>
              <td>{ETIQUETA_TIPO[c.tipo]}</td>
              <td>{c.rfc ?? "—"}</td>
              <td>
                <EstadoCliente estado={c.estado} />
              </td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr>
              <td colSpan={5}>Sin clientes</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

/** Formulario de alta (inicial = null) y de edición (inicial = cliente). Lo usan la lista y la ficha. */
export function ClienteFormulario({
  inicial,
  onGuardado,
  onCancelar,
}: {
  inicial: Cliente | null;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [tipo, setTipo] = useState<Tipo>(inicial?.tipo ?? "PERSONA_MORAL");
  const [estado, setEstado] = useState<Estado>(inicial?.estado ?? "EN_REVISION");
  const [rfc, setRfc] = useState(inicial?.rfc ?? "");
  const [razonSocial, setRazonSocial] = useState(inicial?.razonSocial ?? "");
  const [regimenFiscal, setRegimenFiscal] = useState(inicial?.regimenFiscal ?? "");
  const [codigoPostal, setCodigoPostal] = useState(inicial?.codigoPostal ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const vacioANull = (v: string) => (v.trim() === "" ? null : v.trim());
    const cuerpo = {
      nombre: nombre.trim(),
      tipo,
      rfc: vacioANull(rfc)?.toUpperCase() ?? null,
      razonSocial: vacioANull(razonSocial),
      regimenFiscal: vacioANull(regimenFiscal),
      codigoPostal: vacioANull(codigoPostal),
      ...(inicial ? { estado } : {}),
    };
    try {
      if (inicial) await api(`/api/clientes/${inicial.id}`, { method: "PATCH", body: cuerpo });
      else await api("/api/clientes", { body: cuerpo });
      await onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={onSubmit}>
      <h3>{inicial ? "Editar cliente" : "Nuevo cliente"}</h3>
      <div className="grid">
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            {(Object.keys(ETIQUETA_TIPO) as Tipo[]).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        {inicial && (
          <label>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
              {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_ESTADO[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          RFC (opcional al alta)
          <input value={rfc} onChange={(e) => setRfc(e.target.value)} />
        </label>
        <label>
          Razón social
          <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
        </label>
        <label>
          Régimen fiscal
          <input value={regimenFiscal} onChange={(e) => setRegimenFiscal(e.target.value)} />
        </label>
        <label>
          Código postal
          <input inputMode="numeric" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="submit" disabled={enviando}>
          Guardar
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
