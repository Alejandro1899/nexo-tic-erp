/** Estructura de la app: barra lateral en escritorio y cajón en móvil. El menú solo oculta opciones; el backend es quien niega accesos. */
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Shell() {
  const { sesion, logout } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  if (!sesion) return null;
  const esAdmin = sesion.usuario.rol === "ADMIN";

  async function salir() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header className="topbar-movil">
        <button className="hamburguesa" aria-label="Abrir menú" aria-expanded={abierto} aria-controls="menu-principal" onClick={() => setAbierto(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span>NEXOTIC</span>
      </header>
      {abierto && <div className="sidebar-velo" onClick={() => setAbierto(false)} aria-hidden="true" />}
      <aside id="menu-principal" className={`sidebar${abierto ? " abierto" : ""}`}>
        <div className="sidebar-marca">
          <span className="sidebar-logo">N</span>
          <span>
            NEXOTIC
            <small>ERP interno</small>
          </span>
        </div>
        <nav onClick={() => setAbierto(false)}>
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/servicios">Catálogo</NavLink>
          {sesion.usuario.rol !== "TECNICO" && <NavLink to="/cotizaciones">Cotizaciones</NavLink>}
          {esAdmin && <NavLink to="/usuarios">Usuarios</NavLink>}
          {(sesion.usuario.rol === "ADMIN" || sesion.usuario.rol === "DIRECCION") && <NavLink to="/actividad">Actividad</NavLink>}
          {esAdmin && <NavLink to="/configuracion">Empresa</NavLink>}
        </nav>
        <div className="sidebar-usuario">
          {sesion.usuario.nombre} ({sesion.usuario.rol})
          <button onClick={salir}>Salir</button>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
