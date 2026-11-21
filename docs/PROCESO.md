# Proceso de desarrollo (resumen)

Fuente completa: documento "Proceso de desarrollo: NEXOTIC ERP (v1)" en el proyecto.

- Reparto: socio A backend, modelo de datos y reglas de negocio. Socio B frontend, UX y PWA.
- `main` protegida; ramas cortas por historia; PR revisado por el otro socio.
- CI (lint, pruebas, build) en cada PR. No se fusiona si fallan las pruebas de cálculo.
- Definición de terminado: funciona en staging con pruebas, respeta permisos y aislamiento por empresa, valida en backend, revisado en PR.
