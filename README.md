# NEXO TIC ERP (v1)

Monorepo de la plataforma modular NEXUS ERP. Ver el plan y el proceso de desarrollo en el proyecto de Claude.

## Estructura

- `apps/web`: React + TypeScript + Vite + PWA.
- `apps/api`: Node + TypeScript + Express + Prisma.
- `packages/shared`: esquemas Zod y el módulo de cálculo de totales (dinero en centavos, IVA definido una sola vez).

## Requisitos

- Node 20.11 o superior
- pnpm 9
- Docker (para PostgreSQL local)

## Primeros pasos

```bash
pnpm install
cp .env.example .env
pnpm dev:db
pnpm --filter @nexo/api db:migrate
pnpm dev
```

## Reglas

- Ningún cambio de base de datos se hace a mano: todo pasa por migraciones de Prisma.
- Los montos se guardan en centavos enteros. Nunca decimales flotantes.
- `tenant_id` sale siempre del token de sesión, nunca del cuerpo de la petición.
- `main` está protegida. Cada historia va en una rama corta (`feat/...`) y entra por PR revisado por el otro socio.
