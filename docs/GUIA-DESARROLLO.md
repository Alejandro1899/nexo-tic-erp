# Guía para desarrolladores: NEXOTIC ERP

Esta guía es para quien se une al proyecto y todavía no conoce el código ni las reglas de negocio.
Léela en este orden: qué es, cómo está organizado, las reglas que no se negocian, cómo correrlo y cómo agregar algo.

Qué hace el sistema y qué queda fuera de la v1 está en [ALCANCE-NEXOTIC-ERP.md](ALCANCE-NEXOTIC-ERP.md).
Cómo trabajamos los dos socios está en [PROCESO.md](PROCESO.md).

---

## 1. Qué es

ERP interno de una sola empresa (NEXOTIC). Maneja clientes, catálogo de servicios, cotizaciones con flujo de aprobación,
usuarios con roles, indicadores y una bitácora de actividad. Es una aplicación web: el navegador habla con una API.

## 2. Mapa del repositorio

```
apps/
  api/        Servidor Express + Prisma (PostgreSQL). Aquí están las reglas y los permisos.
    prisma/     schema.prisma (modelo de datos), migrations/ (historial de cambios de la base), seed.ts (datos de demo)
    src/
      server.ts         punto de entrada: arranca el servidor
      app.ts            arma Express: CORS, JSON, rutas por módulo y manejador de errores
      lib/              utilidades compartidas del API (db, errores, contraseñas, bitácora, configuración)
      middleware/       auth (sesión) y roles (permisos por rol)
      modules/          una carpeta por tema: auth, clientes, servicios, categorias, cotizaciones,
                        usuarios, configuracion, dashboard, actividad, health
      testing/          helpers para las pruebas de integración
  web/        React + Vite (PWA). Solo presentación: el backend es quien decide qué se permite.
    src/
      pages/            una pantalla por archivo (Inicio, Clientes, Cotizaciones...)
      components/       piezas reutilizables (Shell, Badge, formularios)
      auth.tsx          sesión del usuario en el navegador
      api.ts            cliente HTTP (siempre manda la cookie y convierte errores)
      evidencia.ts      compresión de imágenes para la evidencia de aprobación
packages/
  shared/     Código que usan API y web: reglas de validación (Zod), cálculo de montos,
              formato de la bitácora y límites de la evidencia. Si algo se valida en los dos lados, vive aquí.
docs/         Alcance, proceso y esta guía
```

## 3. Puesta en marcha local

Requisitos: Node 20.12 o superior, pnpm 9, y PostgreSQL (con Docker o instalado en tu PC).

```bash
pnpm install
cp .env.example apps/api/.env          # ajusta DATABASE_URL si tu base usa otro usuario o contraseña
docker compose up -d db                # o usa tu PostgreSQL local
pnpm --filter @nexo/api exec prisma migrate deploy
pnpm db:seed                           # crea usuarios y datos de demo (ver advertencia abajo)
pnpm dev                               # API en http://localhost:4000 y web en http://localhost:5173
```

Variables de entorno (`apps/api/.env`, nunca se suben al repositorio):

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `API_PORT` | Puerto del API (4000 por defecto) |
| `WEB_ORIGIN` | Origen de la web que puede llamar al API con cookies (CORS) |

**Advertencia:** `pnpm db:seed` borra clientes, servicios y sesiones antes de recrear los datos de demo.
Nunca lo corras contra una base con datos reales.

Para crear el primer administrador en una base real, usa `pnpm --filter @nexo/api db:crear-admin` con las variables indicadas en `apps/api/prisma/crear-admin.ts`.

## 4. Reglas de negocio que debes conocer

### 4.1 Montos

- **Todo dinero se guarda en centavos enteros** (`Int`). Nunca uses decimales flotantes para dinero.
  `$2,500.00` se guarda como `250000`.
- **Cantidades en milésimas:** 2.5 horas = `2500`.
- **Porcentajes en puntos básicos (pb):** `10000` pb = 100 %. El IVA es `1600` pb (16 %). Un descuento de 50 % es `5000` pb.
- Las funciones de cálculo están en `packages/shared/src/money.ts`: `importeLinea`, `aplicarTasaPb`,
  `calcularTotales`, `calcularAnticipo`, `formatearMXN`, `pesosACentavos`.
- **El servidor es quien calcula los totales.** La web muestra una vista previa, pero lo que se guarda lo decide el API.

### 4.2 Cotización: cálculo y flujo

- Orden del cálculo: importe de cada línea → descuento de la línea → base gravable (subtotal menos descuento) → IVA → total.
- **Anticipo:** un porcentaje del total con IVA (`anticipoPb`). El saldo es lo que resta, así que anticipo + saldo siempre suman el total.
- **Precios:** un servicio del catálogo toma la tarifa propia del cliente si existe; si no, la del catálogo.
  Las partidas libres llevan precio capturado. El precio nunca se toma del cuerpo de la petición para servicios del catálogo.
- **Estados:**
  - `BORRADOR` → `ENVIADA` (la envía quien la creó, ADMIN o DIRECCION).
  - `ENVIADA` → `APROBADA` o `RECHAZADA` (solo ADMIN o DIRECCION).
  - Cambio manual (solo ADMIN o DIRECCION): `APROBADA` → `RECHAZADA` o `BORRADOR`; `RECHAZADA` → `BORRADOR`.
  - `VENCIDA` no se guarda: se calcula cuando una `ENVIADA` ya pasó su fecha de vigencia.
  - Solo se eliminan borradores.
- **Folio:** `COT-AAAA-NNNN`. Sale de la tabla `Consecutivo` dentro de una transacción, para que nunca se repita.
- **Costos y utilidad:** son internos. `vistaCotizacion` (en `cotizaciones.routes.ts`) solo los incluye para ADMIN y DIRECCION.
  VENDEDOR y TECNICO no los reciben en ninguna respuesta.
- **Evidencia de aprobación:** la cotización firmada u otro respaldo. Solo ADMIN y DIRECCION la suben y la ven.
  Límites en `packages/shared/src/evidencia.ts`.

### 4.3 Roles y permisos

| Acción | ADMIN | DIRECCION | VENDEDOR | TECNICO |
|---|:-:|:-:|:-:|:-:|
| Ver clientes y catálogo | ✔ | ✔ | ✔ | ✔ |
| Crear y editar clientes, asignar servicios | ✔ | ✔ | | |
| Eliminar clientes | ✔ | | | |
| Crear y editar servicios y categorías | ✔ | ✔ | | |
| Eliminar servicios | ✔ | | | |
| Ver y crear cotizaciones | ✔ | ✔ | ✔ | |
| Editar, enviar o eliminar un borrador | quien la creó o ADMIN/DIRECCION | | | |
| Aprobar, rechazar o cambiar estado | ✔ | ✔ | | |
| Ver costos y utilidad | ✔ | ✔ | | |
| Evidencia de aprobación | ✔ | ✔ | | |
| Usuarios (crear, editar, restablecer, eliminar) | ✔ | | | |
| Datos de la empresa (editar) | ✔ | | | |
| Bitácora: consultar | ✔ | ✔ | | |
| Bitácora: exportar, limpiar, importar | ✔ | | | |

- **Quién manda:** el backend (`requireRole` y las comprobaciones dentro de cada ruta). El frontend solo oculta botones.
- **Super administrador:** la cuenta marcada con `esSuperAdmin` no la puede eliminar ni cambiar la contraseña otro administrador.
- **La identidad sale de la sesión** (`sesionDe(res)`), nunca del cuerpo de la petición.

### 4.4 Borrado lógico

Clientes, servicios, asignaciones, usuarios, cotizaciones (borradores) y evidencias usan `eliminadoEn`.
Las consultas siempre filtran `eliminadoEn: null`. Así el historial se conserva.
Las categorías no se borran físicamente: al eliminarlas, sus servicios quedan sin categoría.

### 4.5 Sesiones y contraseñas

- Entrada con correo o usuario de acceso. La cookie `nexo_sesion` es `httpOnly`; en la base solo se guarda el hash SHA-256 del token.
- Las contraseñas se guardan con scrypt (`lib/password.ts`). Nunca se registran en la bitácora ni en los logs.
- Una contraseña temporal obliga a cambiarla al entrar (`debeCambiarPassword`).

### 4.6 Bitácora de actividad

- Cada acción importante queda en `RegistroActividad` a través de `registrarActividad` (`lib/bitacora.ts`).
- En ediciones solo se guardan los campos de `CAMPOS_CLAVE` que cambiaron, con su valor anterior y el nuevo.
- **Solo se agrega.** Nadie la edita. La limpieza es manual, pide escribir `BORRAR` y exporta antes.
  La exportación tiene formato versionado para poder importarla después.

### 4.7 Dashboard

`modules/dashboard` calcula los indicadores según el rol y el periodo (`periodos.ts`). Todo se calcula con la fecha del servidor.

## 5. Cómo está hecho un módulo (ejemplo: clientes)

Para agregar algo nuevo, sigue los mismos pasos. Así lo hicimos con clientes, cotizaciones y la bitácora.

1. **Modelo:** agrega el modelo en `apps/api/prisma/schema.prisma`.
2. **Migración:** `pnpm --filter @nexo/api exec prisma migrate dev --name descripcion_corta`.
   Nunca edites una migración que ya se aplicó. Si Prisma pide un valor por defecto para filas existentes,
   escribe el SQL a mano en la migración y aplícalo con `prisma migrate deploy`.
3. **Reglas compartidas:** el esquema Zod va en `packages/shared/src/schemas.ts` (o en un archivo nuevo).
4. **Ruta:** en `apps/api/src/modules/<tema>/<tema>.routes.ts`, con este orden:
   - `requireRole(...)` para el rol.
   - `sesionDe(res)` para saber quién hace la petición.
   - `safeParse` del esquema y `HttpError` para los errores de negocio.
   - Envuelve el handler con `ruta(...)` para que los errores async lleguen al manejador global.
   - Si cambió un dato importante, llama a `registrarActividad`.
5. **Registro en la app:** en `apps/api/src/app.ts`.
6. **Pruebas:** en el mismo módulo, `<tema>.test.ts`. Usa los helpers de `testing/helpers.ts`.
7. **Pantalla:** en `apps/web/src/pages/`, con su ruta en `App.tsx`. Usa `api(...)` de `api.ts`.
   Si la pantalla solo debe verla cierto rol, agrega también la restricción visual en `App.tsx` y en `Shell.tsx`.

Ejemplo mínimo de ruta protegida:

```ts
clientesRouter.patch(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),          // quién puede llamarla
  ruta(async (req, res) => {                  // maneja errores async
    const { usuarioId } = sesionDe(res);      // quién lo hace (de la sesión)
    const parsed = ClienteActualizarSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    // ... cambio ...
    res.json({ cliente });
  }),
);
```

## 6. Pruebas

```bash
pnpm test          # shared + API
pnpm typecheck     # TypeScript en todos los paquetes
```

- `packages/shared`: cálculo de montos, redondeo y esquemas. No necesita base de datos.
- `apps/api`: pruebas de integración contra la base local. Por eso `pnpm dev:db` (o tu PostgreSQL) debe estar arriba.
  Corren una por una (`fileParallelism: false`) porque comparten la base.
- Las pruebas crean usuarios y datos con el prefijo `[prueba]` y el dominio `@prueba.test`. `limpiarPruebas()` los borra al terminar.
- Para una prueba que necesita entrar con un rol, usa `crearUsuarioPrueba("tema", "ROL")` y luego `loginComo(correo)`.

## 7. Despliegue

- **API (Render):** cada push a `main` despliega solo (si Auto-Deploy está activo). El comando de inicio aplica las migraciones
  con `prisma migrate deploy` antes de arrancar el servidor. Por eso, una migración nueva llega a producción sin pasos manuales.
- **Web (devadmin):** no se despliega sola. Hay que generar el build con la URL del API y subir `dist` al hosting:

  ```bash
  cd apps/web && VITE_API_URL=https://api.nexotic.com.mx pnpm build
  ```

  Sube el contenido de `dist` conservando el `.htaccess` (sin él, las rutas de React fallan al recargar).
  Después recarga con `Ctrl+Shift+R`, porque la app usa service worker y puede servir una versión anterior.

## 8. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `EPERM` al correr `prisma generate` | El API en modo desarrollo tiene bloqueado el motor de Prisma | Detén `pnpm dev` y vuelve a generar |
| La web muestra una versión vieja después de subir cambios | Service worker en caché | Quita el service worker en las herramientas del navegador y recarga |
| "Error del servidor (HTTP 500)" en una pantalla nueva | La migración no está aplicada en esa base | Corre `prisma migrate deploy` contra esa base |
| CORS bloquea una petición | El método o el origen no está permitido | Revisa `WEB_ORIGIN` y la lista de métodos en `app.ts` |
| Las pruebas fallan con datos que "ya existen" | Quedaron datos de una corrida anterior | Corre de nuevo; `limpiarPruebas` los borra |
| `prisma migrate dev` pide un valor por defecto | Hay filas existentes y una columna nueva obligatoria | Escribe la migración a mano (ver sección 5) |

## 9. Pendientes y decisiones abiertas

Lo que sigue está en la sección 10 y 11 de [ALCANCE-NEXOTIC-ERP.md](ALCANCE-NEXOTIC-ERP.md): proyectos, horas, órdenes de servicio,
cobros, reportes de ingresos, rol de contador, firma digital y estados de trabajos por servicio.
