import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensajeError } from "../api";

export interface Contacto {
  id: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  correo: string | null;
  esPrincipal: boolean;
}

/** Contactos del cliente: teléfono y correo para comunicarse. Alta y edición: DIRECCION y ADMIN. */
export function ClienteContactos({ clienteId, puedeEditar }: { clienteId: string; puedeEditar: boolean }) {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ contactos: Contacto[] }>(`/api/clientes/${clienteId}/contactos`);
      setContactos(data.contactos);
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/clientes/${clienteId}/contactos`, {
        body: {
          nombre,
          puesto: puesto.trim() || null,
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
        },
      });
      setNombre("");
      setPuesto("");
      setTelefono("");
      setCorreo("");
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function marcarPrincipal(id: string) {
    setError(null);
    try {
      await api(`/api/clientes/${clienteId}/contactos/${id}`, { method: "PATCH", body: { esPrincipal: true } });
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function quitar(c: Contacto) {
    if (!window.confirm(`¿Quitar a ${c.nombre} como contacto de este cliente?`)) return;
    setError(null);
    try {
      await api(`/api/clientes/${clienteId}/contactos/${c.id}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="tarjeta">
      <h3>Contactos</h3>
      {error && <p className="error">{error}</p>}

      {contactos.length === 0 ? (
        <p>Este cliente todavía no tiene contactos.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Teléfono</th>
                <th>Correo</th>
                {puedeEditar && <th />}
              </tr>
            </thead>
            <tbody>
              {contactos.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.nombre}
                    {c.esPrincipal && <span className="badge badge-azul">Principal</span>}
                  </td>
                  <td>{c.puesto ?? "—"}</td>
                  <td>{c.telefono ? <a href={`tel:${c.telefono.replace(/\s/g, "")}`}>{c.telefono}</a> : "—"}</td>
                  <td>{c.correo ? <a href={`mailto:${c.correo}`}>{c.correo}</a> : "—"}</td>
                  {puedeEditar && (
                    <td>
                      <div className="acciones">
                        {!c.esPrincipal && <button type="button" onClick={() => void marcarPrincipal(c.id)}>Hacer principal</button>}
                        <button type="button" onClick={() => void quitar(c)}>Quitar</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeEditar && (
        <form onSubmit={agregar} className="grid" style={{ marginTop: "1rem" }}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={200} />
          </label>
          <label>
            Puesto
            <input value={puesto} onChange={(e) => setPuesto(e.target.value)} maxLength={100} />
          </label>
          <label>
            Teléfono
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="55 1234 5678" />
          </label>
          <label>
            Correo
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <div className="acciones" style={{ alignSelf: "end" }}>
            <button type="submit" disabled={!nombre.trim()}>Agregar contacto</button>
          </div>
        </form>
      )}
    </div>
  );
}
