# NEXO TIC ERP (v1)

Monorepo de la plataforma modular NEXUS ERP.

## Estructura

- `apps/web`: React + TypeScript + Vite + PWA. Login, clientes y catálogo de servicios.
- `apps/api`: Node + TypeScript + Express + Prisma. Autenticación por sesión y control de acceso por rol (NEXOTIC, una sola empresa).
- `packages/shared`: esquemas Zod y el módulo de cálculo de totales (centavos enteros, IVA definido una sola vez).

## Puesta en marcha local

Requisitos: Node 20.12 o superior, pnpm 9 y Docker Desktop abierto.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:db
pnpm --filter @nexo/api exec prisma migrate dev --name init
pnpm db:seed
pnpm dev
```

Después abre:

- Web: http://localhost:5173
- API de salud: http://localhost:4000/api/health

### Usuarios de demo

Contraseña para todos: `demo1234`.

| Correo | Rol | Puede |
|---|---|---|
| admin@nexotic.mx | ADMIN | Todo, incluido crear servicios |
| vendedor@nexotic.mx | VENDEDOR | Crear y editar clientes |
| tecnico@nexotic.mx | TECNICO | Solo consultar |
| direccion@nexotic.mx | DIRECCION | Solo consultar |

## Pruebas

```bash
pnpm test
```

- `packages/shared`: cálculo de totales, redondeo, RFC y esquemas.
- `apps/api`: autenticación y permisos por rol. Las pruebas de API usan la base de datos local, así que `pnpm dev:db` debe estar arriba.

## Reglas

- Ningún cambio de base de datos se hace a mano: todo pasa por migraciones de Prisma.
- Los montos se guardan en centavos enteros. Nunca decimales flotantes.
- La identidad sale siempre de la sesión, nunca del cuerpo de la petición.
- La verificación de roles vive en el backend. El frontend solo oculta opciones.
- `main` está protegida. Cada historia va en una rama corta (`feat/...`) y entra por PR revisado por el otro socio.
- Contraseñas y claves van en variables de entorno (`apps/api/.env`), fuera del repositorio.
