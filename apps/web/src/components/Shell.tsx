import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Shell() {
  const { sesion, logout } = useAuth();
  const navigate = useNavigate();
  if (!sesion) return null;
  const esAdmin = sesion.usuario.rol === "ADMIN";

  async function salir() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header>
        <strong>NEXO TIC ERP</strong>
        <nav>
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/servicios">Catálogo</NavLink>
          {sesion.usuario.rol !== "TECNICO" && <NavLink to="/cotizaciones">Cotizaciones</NavLink>}
          {esAdmin && <NavLink to="/usuarios">Usuarios</NavLink>}
        </nav>
        <div className="usuario">
          {sesion.usuario.nombre} ({sesion.usuario.rol})
          <button onClick={salir}>Salir</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
