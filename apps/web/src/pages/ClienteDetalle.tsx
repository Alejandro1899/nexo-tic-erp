import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, mensajeError } from "../api";
import { esAdminODireccion, useAuth } from "../auth";
import { CotizacionesDelCliente, ServiciosAsignados } from "../components/ClienteServiciosYCotizaciones";
import { Badge } from "../components/Badge";
import { ClienteContactos } from "../components/ClienteContactos";
import { Cliente, ClienteFormulario, ETIQUETA_TIPO, EstadoCliente } from "./Clientes";

/** Ficha de un cliente: ver detalle, editar (ADMIN y DIRECCION) y eliminar lógicamente (ADMIN). */
export function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const rol = sesion?.usuario.rol;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ cliente: Cliente }>(`/api/clientes/${id}`);
      setCliente(data.cliente);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Este cliente no existe o fue eliminado." : mensajeError(e));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function eliminar() {
    if (!cliente) return;
    if (!window.confirm(`¿Eliminar a ${cliente.nombre}? Dejará de aparecer, pero su historial se conserva.`)) return;
    try {
      await api(`/api/clientes/${cliente.id}`, { method: "DELETE" });
      navigate("/clientes", { replace: true });
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/clientes">Volver a clientes</Link>
      </section>
    );
  }
  if (!cliente) return <p>Cargando…</p>;

  return (
    <section>
      <div className="barra">
        <h2>{cliente.nombre}</h2>
        <EstadoCliente estado={cliente.estado} />
        {cliente.datosFiscalesPendientes && <Badge tono="ambar">Datos fiscales pendientes</Badge>}
        {esAdminODireccion(rol) && !editando && <button onClick={() => setEditando(true)}>Editar</button>}
        {rol === "ADMIN" && <button onClick={() => void eliminar()}>Eliminar</button>}
      </div>

      {editando ? (
        <ClienteFormulario
          inicial={cliente}
          onCancelar={() => setEditando(false)}
          onGuardado={async () => {
            setEditando(false);
            await cargar();
          }}
        />
      ) : (
        <dl className="detalle">
          <dt>Folio</dt>
          <dd>{cliente.folio}</dd>
          <dt>Tipo</dt>
          <dd>{ETIQUETA_TIPO[cliente.tipo]}</dd>
          <dt>RFC</dt>
          <dd>{cliente.rfc ?? "—"}</dd>
          <dt>Razón social</dt>
          <dd>{cliente.razonSocial ?? "—"}</dd>
          <dt>Régimen fiscal</dt>
          <dd>{cliente.regimenFiscal ?? "—"}</dd>
          <dt>Código postal</dt>
          <dd>{cliente.codigoPostal ?? "—"}</dd>
          <dt>Registrado</dt>
          <dd>{new Date(cliente.creadoEn).toLocaleDateString("es-MX")}</dd>
        </dl>
      )}

      {!editando && (
        <>
          <ClienteContactos clienteId={cliente.id} puedeEditar={esAdminODireccion(rol)} />
          <ServiciosAsignados clienteId={cliente.id} puedeAsignar={esAdminODireccion(rol)} />
          {rol !== "TECNICO" && <CotizacionesDelCliente clienteId={cliente.id} puedeCotizar={esAdminODireccion(rol) || rol === "VENDEDOR"} />}
        </>
      )}

      <p>
        <Link to="/clientes">← Volver a clientes</Link>
      </p>
    </section>
  );
}
