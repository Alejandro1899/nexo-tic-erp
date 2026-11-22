import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { CambiarPassword } from "./pages/CambiarPassword";
import { Login } from "./pages/Login";
import { Clientes } from "./pages/Clientes";
import { Inicio } from "./pages/Inicio";
import { ClienteDetalle } from "./pages/ClienteDetalle";
import { Servicios } from "./pages/Servicios";
import { Usuarios } from "./pages/Usuarios";
import { UsuarioDetalle } from "./pages/UsuarioDetalle";
import { Cotizaciones } from "./pages/Cotizaciones";
import { CotizacionDetalle } from "./pages/CotizacionDetalle";
import { Configuracion } from "./pages/Configuracion";
import "./styles.css";

function Protegida({ children }: { children: ReactNode }) {
  const { sesion, cargando } = useAuth();
  if (cargando) return <p className="centro">Cargando…</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  // Con contraseña inicial asignada, no se entra a la app hasta cambiarla.
  if (sesion.usuario.debeCambiarPassword) return <CambiarPassword />;
  return <>{children}</>;
}

function SoloAdmin({ children }: { children: ReactNode }) {
  const { sesion } = useAuth();
  if (sesion?.usuario.rol !== "ADMIN") return <Navigate to="/clientes" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protegida>
              <Shell />
            </Protegida>
          }
        >
          <Route index element={<Inicio />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<ClienteDetalle />} />
          <Route path="servicios" element={<Servicios />} />
          <Route path="cotizaciones" element={<Cotizaciones />} />
          <Route path="cotizaciones/:id" element={<CotizacionDetalle />} />
          <Route
            path="configuracion"
            element={
              <SoloAdmin>
                <Configuracion />
              </SoloAdmin>
            }
          />
          <Route
            path="usuarios"
            element={
              <SoloAdmin>
                <Usuarios />
              </SoloAdmin>
            }
          />
          <Route
            path="usuarios/:id"
            element={
              <SoloAdmin>
                <UsuarioDetalle />
              </SoloAdmin>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
