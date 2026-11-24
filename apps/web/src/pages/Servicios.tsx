import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatearMXN, pesosACentavos } from "@nexo/shared";
import { api, mensajeError } from "../api";
import { esAdminODireccion, useAuth } from "../auth";
import { Badge } from "../components/Badge";

type Unidad = "HORA" | "PROYECTO" | "MENSUALIDAD";

interface Categoria {
  id: string;
  nombre: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  unidad: Unidad;
  tarifaCentavos: number;
  activo: boolean;
  categoria: Categoria | null;
}

export const ETIQUETA_UNIDAD: Record<Unidad, string> = {
  HORA: "Por hora",
  PROYECTO: "Por proyecto",
  MENSUALIDAD: "Mensualidad",
};

/** Catálogo de servicios. Lectura: todos. Alta y edición: DIRECCION y ADMIN. Eliminar: ADMIN. */
export function Servicios() {
  const { sesion } = useAuth();
  const puedeEditar = esAdminODireccion(sesion?.usuario.rol);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [editando, setEditando] = useState<Servicio | "nuevo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ servicios: Servicio[] }>("/api/servicios");
      setServicios(data.servicios);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <section>
      <div className="barra">
        <h2>Catálogo de servicios</h2>
        {puedeEditar && <button onClick={() => setEditando("nuevo")}>Nuevo servicio</button>}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="contador">{servicios.length} servicio{servicios.length === 1 ? "" : "s"} en el catálogo</p>

      {editando && puedeEditar && (
        <ServicioForm
          key={editando === "nuevo" ? "nuevo" : editando.id}
          inicial={editando === "nuevo" ? null : editando}
          onCancelar={() => setEditando(null)}
          onGuardado={async () => {
            setEditando(null);
            await cargar();
          }}
        />
      )}

      <table>
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Categoría</th>
            <th>Cobro</th>
            <th>Tarifa</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {servicios.map((s) => (
            <tr key={s.id} onClick={puedeEditar ? () => setEditando(s) : undefined} className={puedeEditar ? "fila" : undefined}>
              <td>
                <strong>{s.nombre}</strong>
              </td>
              <td>{s.categoria?.nombre ?? "—"}</td>
              <td>{ETIQUETA_UNIDAD[s.unidad]}</td>
              <td className="num">{formatearMXN(s.tarifaCentavos)}</td>
              <td>
                <Badge tono={s.activo ? "verde" : "gris"}>{s.activo ? "Activo" : "Inactivo"}</Badge>
              </td>
            </tr>
          ))}
          {servicios.length === 0 && (
            <tr>
              <td colSpan={5}>Todavía no hay servicios en el catálogo.{puedeEditar ? " Agrega el primero con «Nuevo servicio»." : ""}</td>
            </tr>
          )}
        </tbody>
      </table>

      <CategoriasPanel puedeEditar={puedeEditar} onCambio={cargar} />
    </section>
  );
}

/** Administra las categorías del catálogo: crear, renombrar y eliminar (lógico). */
function CategoriasPanel({ puedeEditar, onCambio }: { puedeEditar: boolean; onCambio: () => Promise<void> }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ categorias: Categoria[] }>("/api/categorias");
      setCategorias(data.categorias);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/categorias", { body: { nombre: nueva.trim() } });
      setNueva("");
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function renombrar(c: Categoria) {
    const nombre = window.prompt("Nuevo nombre de la categoría", c.nombre);
    if (!nombre || nombre.trim() === c.nombre) return;
    try {
      await api(`/api/categorias/${c.id}`, { method: "PATCH", body: { nombre: nombre.trim() } });
      await cargar();
      await onCambio();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function eliminar(c: Categoria) {
    if (!window.confirm(`¿Eliminar la categoría ${c.nombre}? Sus servicios quedan sin categoría.`)) return;
    try {
      await api(`/api/categorias/${c.id}`, { method: "DELETE" });
      await cargar();
      await onCambio();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="tarjeta">
      <h3>Categorías</h3>
      {error && <p className="error">{error}</p>}
      <ul className="lista-simple">
        {categorias.map((c) => (
          <li key={c.id}>
            {c.nombre}
            {puedeEditar && (
              <>
                {" "}
                <button type="button" onClick={() => void renombrar(c)}>
                  Renombrar
                </button>{" "}
                <button type="button" onClick={() => void eliminar(c)}>
                  Eliminar
                </button>
              </>
            )}
          </li>
        ))}
        {categorias.length === 0 && <li>Sin categorías todavía.</li>}
      </ul>
      {puedeEditar && (
        <form className="barra" onSubmit={crear}>
          <input placeholder="Nueva categoría (por ejemplo Redes)" value={nueva} onChange={(e) => setNueva(e.target.value)} required maxLength={100} />
          <button type="submit">Agregar categoría</button>
        </form>
      )}
    </div>
  );
}

function ServicioForm({
  inicial,
  onGuardado,
  onCancelar,
}: {
  inicial: Servicio | null;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const { sesion } = useAuth();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria?.id ?? "");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [unidad, setUnidad] = useState<Unidad>(inicial?.unidad ?? "HORA");
  const [tarifa, setTarifa] = useState(inicial ? (inicial.tarifaCentavos / 100).toFixed(2) : "");
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ categorias: Categoria[] }>("/api/categorias")
      .then((d) => setCategorias(d.categorias))
      .catch(() => setCategorias([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const cuerpo = {
        nombre: nombre.trim(),
        categoriaId: categoriaId || null,
        unidad,
        tarifaCentavos: pesosACentavos(tarifa),
        ...(inicial ? { activo } : {}),
      };
      if (inicial) await api(`/api/servicios/${inicial.id}`, { method: "PATCH", body: cuerpo });
      else await api("/api/servicios", { body: cuerpo });
      await onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar() {
    if (!inicial) return;
    if (!window.confirm(`¿Eliminar el servicio ${inicial.nombre}? Dejará de aparecer, pero su historial se conserva.`)) return;
    try {
      await api(`/api/servicios/${inicial.id}`, { method: "DELETE" });
      await onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <form className="tarjeta" onSubmit={onSubmit}>
      <h3>{inicial ? "Editar servicio" : "Nuevo servicio"}</h3>
      <div className="grid">
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Categoría
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidad de cobro
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            {(Object.keys(ETIQUETA_UNIDAD) as Unidad[]).map((u) => (
              <option key={u} value={u}>
                {ETIQUETA_UNIDAD[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tarifa en pesos (MXN)
          <input inputMode="decimal" placeholder="450.00" value={tarifa} onChange={(e) => setTarifa(e.target.value)} required />
        </label>
        {inicial && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="submit" disabled={enviando}>
          Guardar
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
        {inicial && sesion?.usuario.rol === "ADMIN" && (
          <button type="button" onClick={() => void eliminar()}>
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}
