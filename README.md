# NEXOTIC ERP (v1)

ERP interno de NEXOTIC: clientes, catálogo de servicios, cotizaciones con aprobación, usuarios por rol,
indicadores y bitácora de actividad. Una sola empresa.

**Para empezar, lee [docs/GUIA-DESARROLLO.md](docs/GUIA-DESARROLLO.md).** Ahí están la estructura del código,
las reglas de negocio (montos, roles, estados), cómo correrlo y cómo agregar una función.

- Alcance y decisiones: [docs/ALCANCE-NEXOTIC-ERP.md](docs/ALCANCE-NEXOTIC-ERP.md)
- Cómo trabajamos: [docs/PROCESO.md](docs/PROCESO.md)

## Inicio rápido

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d db
pnpm --filter @nexo/api exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- API de salud: http://localhost:4000/api/health

El seed crea usuarios de demo con contraseña `demo1234` (ver la guía, sección 3). No lo corras contra una base con datos reales.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | API y web en modo desarrollo |
| `pnpm test` | Pruebas de `shared` y del API (el API necesita PostgreSQL arriba) |
| `pnpm typecheck` | Revisa tipos en todos los paquetes |
| `pnpm build` | Compila todos los paquetes |

## Reglas que no se negocian

- El dinero se guarda en centavos enteros. Nunca decimales flotantes.
- El servidor decide los permisos y calcula los totales. La web solo oculta opciones.
- Los cambios de base de datos pasan por migraciones de Prisma. Nunca se editan migraciones ya aplicadas.
- Los borrados son lógicos (`eliminadoEn`). Excepciones: las partidas de una cotización se reemplazan al editarla,
  y la limpieza de la bitácora es manual, pide confirmación y deja su propio registro.
- `main` despliega en producción. Los cambios se prueban en local antes de subirlos.
