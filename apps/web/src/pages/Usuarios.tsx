import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, mensajeError } from "../api";
import { useAuth, type Rol } from "../auth";
import { Badge, type Tono } from "../components/Badge";

export interface Usuario {
  id: string;
  nombre: string;
  username: string;
  email: string;
  rol: Rol;
  activo: boolean;
  esSuperAdmin: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  TECNICO: "Técnico",
  DIRECCION: "Dirección",
};

/** Estado del usuario con color (ALCANCE 4.12). Prioridad: inactivo, luego contraseña temporal. */
function estadoUsuario(u: Usuario): { tono: Tono; texto: string } {
  if (!u.activo) return { tono: "gris", texto: "Inactivo" };
  if (u.debeCambiarPassword) return { tono: "ambar", texto: "Debe cambiar contraseña" };
  return { tono: "verde", texto: "Activo" };
}

export function EstadoUsuario({ usuario }: { usuario: Usuario }) {
  const { tono, texto } = estadoUsuario(usuario);
  return <Badge tono={tono}>{texto}</Badge>;
}

/** Gestión de usuarios: solo ADMIN (ALCANCE 4.11). El backend también lo exige. */
export function Usuarios() {
  const { sesion } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q, estado });
      const data = await api<{ usuarios: Usuario[] }>(`/api/usuarios?${params.toString()}`);
      setUsuarios(data.usuarios);
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
        <h2>Usuarios</h2>
        <input placeholder="Buscar por nombre, usuario o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
        {!creando && <button onClick={() => setCreando(true)}>Nuevo usuario</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {creando && (
        <UsuarioFormulario
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
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="fila">
              <td>
                <Link to={`/usuarios/${u.id}`}>{u.nombre}</Link>
                {u.esSuperAdmin && <small> · super administrador</small>}
                {u.id === sesion?.usuario.id && <small> · tú</small>}
              </td>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{ETIQUETA_ROL[u.rol]}</td>
              <td>
                <EstadoUsuario usuario={u} />
              </td>
            </tr>
          ))}
          {usuarios.length === 0 && (
            <tr>
              <td colSpan={5}>Sin usuarios</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function UsuarioFormulario({ onGuardado, onCancelar }: { onGuardado: () => Promise<void>; onCancelar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("VENDEDOR");
  const [passwordInicial, setPasswordInicial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api("/api/usuarios", {
        body: { nombre: nombre.trim(), username: username.trim().toLowerCase(), email: email.trim(), rol, passwordInicial },
      });
      await onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={onSubmit}>
      <h3>Nuevo usuario</h3>
      <div className="grid">
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Usuario de acceso
          <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={30} />
        </label>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {(Object.keys(ETIQUETA_ROL) as Rol[]).map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Contraseña temporal (mínimo 8)
          <input type="password" value={passwordInicial} onChange={(e) => setPasswordInicial(e.target.value)} required minLength={8} />
        </label>
      </div>
      <p>El usuario tendrá que cambiar la contraseña temporal al entrar.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="submit" disabled={enviando}>
          Crear usuario
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
