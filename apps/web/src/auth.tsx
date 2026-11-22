import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Rol = "ADMIN" | "VENDEDOR" | "TECNICO" | "DIRECCION";

export interface SesionUI {
  usuario: {
    id: string;
    nombre: string;
    username: string;
    email: string;
    rol: Rol;
    esSuperAdmin: boolean;
    debeCambiarPassword: boolean;
  };
}

interface AuthValor {
  sesion: SesionUI | null;
  cargando: boolean;
  login(usuario: string, password: string): Promise<void>;
  cambiarPassword(actual: string, nueva: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthCtx = createContext<AuthValor | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionUI | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<SesionUI>("/api/auth/me")
      .then(setSesion)
      .catch(() => setSesion(null))
      .finally(() => setCargando(false));
  }, []);

  const valor: AuthValor = {
    sesion,
    cargando,
    async login(usuario, password) {
      setSesion(await api<SesionUI>("/api/auth/login", { body: { usuario, password } }));
    },
    async cambiarPassword(actual, nueva) {
      setSesion(
        await api<SesionUI>("/api/auth/cambiar-password", {
          body: { passwordActual: actual, passwordNueva: nueva },
        }),
      );
    },
    async logout() {
      await api("/api/auth/logout", { method: "POST" });
      setSesion(null);
    },
  };

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValor {
  const valor = useContext(AuthCtx);
  if (!valor) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return valor;
}

/** ADMIN o DIRECCION: quienes agregan y editan clientes y servicios, y gestionan asignaciones (ALCANCE 3). */
export const esAdminODireccion = (rol: Rol | undefined) => rol === "ADMIN" || rol === "DIRECCION";
