import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, mensajeError } from "../api";
import { useAuth, type Rol } from "../auth";
import { ETIQUETA_ROL, EstadoUsuario, type Usuario } from "./Usuarios";

/** Ficha de usuario: editar, restablecer contraseña y eliminar lógicamente. Solo ADMIN. */
export function UsuarioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [editando, setEditando] = useState(false);
  const [temporal, setTemporal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ usuario: Usuario }>(`/api/usuarios/${id}`);
      setUsuario(data.usuario);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Este usuario no existe o fue eliminado." : mensajeError(e));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/usuarios">Volver a usuarios</Link>
      </section>
    );
  }
  if (!usuario) return <p>Cargando…</p>;

  const esYo = usuario.id === sesion?.usuario.id;
  // El super administrador solo lo modifica él mismo; nadie lo elimina ni le cambia la contraseña.
  const protegido = usuario.esSuperAdmin && !esYo;

  async function restablecer() {
    if (!usuario) return;
    if (!window.confirm(`¿Restablecer la contraseña de ${usuario.nombre}? La anterior dejará de servir.`)) return;
    try {
      const data = await api<{ passwordTemporal: string }>(`/api/usuarios/${usuario.id}/restablecer-password`, { method: "POST" });
      setTemporal(data.passwordTemporal);
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function eliminar() {
    if (!usuario) return;
    if (!window.confirm(`¿Eliminar a ${usuario.nombre}? No podrá entrar, pero su historial se conserva.`)) return;
    try {
      await api(`/api/usuarios/${usuario.id}`, { method: "DELETE" });
      navigate("/usuarios", { replace: true });
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  return (
    <section>
      <div className="barra">
        <h2>{usuario.nombre}</h2>
        <EstadoUsuario usuario={usuario} />
        {usuario.esSuperAdmin && <span className="badge badge-azul">Super administrador</span>}
        {!protegido && !editando && <button onClick={() => setEditando(true)}>Editar</button>}
        {!protegido && !esYo && <button onClick={() => void restablecer()}>Restablecer contraseña</button>}
        {!protegido && !esYo && <button onClick={() => void eliminar()}>Eliminar</button>}
      </div>

      {protegido && <p>Esta cuenta está protegida: solo el super administrador puede modificarla.</p>}
      {esYo && <p>Esta es tu cuenta. Para cambiar tu contraseña usa la opción de tu sesión.</p>}

      {temporal && (
        <div className="tarjeta">
          <p>
            <strong>Contraseña temporal:</strong> <code>{temporal}</code>
          </p>
          <p>Cópiala ahora: no se volverá a mostrar. El usuario la cambiará al entrar.</p>
          <button onClick={() => setTemporal(null)}>Entendido</button>
        </div>
      )}

      {editando ? (
        <UsuarioEdicion
          usuario={usuario}
          esYo={esYo}
          onCancelar={() => setEditando(false)}
          onGuardado={async () => {
            setEditando(false);
            await cargar();
          }}
        />
      ) : (
        <dl className="detalle">
          <dt>Usuario de acceso</dt>
          <dd>{usuario.username}</dd>
          <dt>Correo</dt>
          <dd>{usuario.email}</dd>
          <dt>Rol</dt>
          <dd>{ETIQUETA_ROL[usuario.rol]}</dd>
          <dt>Último acceso</dt>
          <dd>{usuario.ultimoAcceso ? new Date(usuario.ultimoAcceso).toLocaleString("es-MX") : "Nunca"}</dd>
          <dt>Creado</dt>
          <dd>{new Date(usuario.creadoEn).toLocaleDateString("es-MX")}</dd>
        </dl>
      )}

      <p>
        <Link to="/usuarios">← Volver a usuarios</Link>
      </p>
    </section>
  );
}

function UsuarioEdicion({
  usuario,
  esYo,
  onGuardado,
  onCancelar,
}: {
  usuario: Usuario;
  esYo: boolean;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [username, setUsername] = useState(usuario.username);
  const [email, setEmail] = useState(usuario.email);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        body: { nombre: nombre.trim(), username: username.trim().toLowerCase(), email: email.trim(), rol, activo },
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
      <h3>Editar usuario</h3>
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
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={esYo}>
            {(Object.keys(ETIQUETA_ROL) as Rol[]).map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={esYo} />
          Activo
        </label>
      </div>
      {esYo && <p>No puedes cambiar tu propio rol ni desactivarte.</p>}
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
