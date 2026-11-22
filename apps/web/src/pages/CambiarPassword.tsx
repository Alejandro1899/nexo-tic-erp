import { useState, type FormEvent } from "react";
import { mensajeError } from "../api";
import { useAuth } from "../auth";

/** Pantalla obligatoria cuando el ADMIN asignó una contraseña inicial. */
export function CambiarPassword() {
  const { cambiarPassword, logout } = useAuth();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva !== confirmacion) {
      setError("La confirmación no coincide con la nueva contraseña");
      return;
    }
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <h1>Cambia tu contraseña</h1>
      <p>Tu administrador te asignó una contraseña inicial. Debes cambiarla para continuar.</p>
      <form onSubmit={onSubmit}>
        <label>
          Contraseña actual
          <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </label>
        <label>
          Nueva contraseña (mínimo 8 caracteres)
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={8} />
        </label>
        <label>
          Confirma la nueva contraseña
          <input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required minLength={8} />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={enviando}>{enviando ? "Guardando…" : "Guardar contraseña"}</button>
      </form>
      <button type="button" onClick={() => void logout()}>
        Salir
      </button>
    </main>
  );
}
