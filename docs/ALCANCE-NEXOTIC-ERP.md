# NEXOTIC ERP: alcance, funciones y herramientas (v1 interna)

Documento de referencia para el desarrollo. Complementa `plan-v1-nexus-erp.md` y `decisiones-clientes-cotizaciones.md` del proyecto de Claude.

## 1. Qué es y para quién

NEXOTIC ERP es el sistema interno de NEXOTIC, la empresa de software y soluciones IT de los dos socios. Sirve para que la propia empresa cotice, ejecute, registre horas, documente, cobre y dé seguimiento a sus clientes y prospectos.

**Es un sistema de una sola empresa.** Todos los datos son de NEXOTIC. No hay multiempresa, ni `tenant_id`, ni aislamiento entre empresas en la v1.

**No es:**
- Un producto para vender a otras empresas (eso queda para una versión posterior, si se decide).
- Un panel de administración de plataforma.
- Un sistema de facturación electrónica (el timbrado CFDI queda para la v2).

## 2. Pantalla principal: NEXOTIC

Al entrar, el usuario ve el panel de NEXOTIC, desde el que maneja todo lo demás:

- **Clientes:** lista con su estado (en revisión, en proceso, activo, suspendido, finalizado) y acceso a su ficha.
- **Catálogo de servicios:** los servicios que NEXOTIC ofrece, con unidad de cobro y tarifa. Es la fuente para cotizar y para crear proyectos.
- **Cotizaciones:** abiertas, enviadas y por vencer.
- **Proyectos:** activos y en pausa, con avance.
- **Tareas y horas:** lo pendiente y lo registrado en la semana.
- **Cobros:** saldos pendientes y mensualidades por vencer.
- **Prospectos:** pipeline y próximas acciones.

Desde la ficha de un cliente se ven sus datos, estado, contactos, cotizaciones, proyectos y pagos pendientes.

## 3. Roles y permisos (aprobado)

| Rol | Puede |
|---|---|
| **ADMIN** | Todo. Gestiona usuarios (crear, editar, restablecer contraseña, eliminar), clientes, servicios y cotizaciones. |
| **SUPER ADMIN** | Es un ADMIN marcado como super administrador. Nadie más puede eliminarlo, desactivarlo, cambiarle el rol ni restablecer su contraseña. Solo lo crea la siembra inicial; no se crea desde la interfaz. Puede cambiar su propia contraseña. |
| **DIRECCION** (supervisor o director) | Agrega clientes, cambia su estado, agrega y edita servicios, y autoriza cotizaciones y servicios. No gestiona usuarios. |
| **VENDEDOR** | Ve clientes y el catálogo de servicios, y crea cotizaciones para clientes y proyectos. No crea clientes ni servicios. |
| **TECNICO** | Ve clientes y servicios en solo lectura. Proyectos, tareas, horas y órdenes de servicio en su momento. |

Los roles se validan en el backend. El frontend solo oculta opciones.

La eliminación de usuarios, clientes y servicios es lógica: el registro se marca como eliminado y deja de aparecer, pero se conserva el historial (quién creó cada cliente, servicio o cotización).

## 4. Módulos y funciones de la v1

### 4.1 Clientes
- Tres tipos: persona física, persona moral (empresa) y negocio sin constitución formal. El formulario es el mismo; cambian los campos fiscales requeridos.
- Campos: nombre, tipo, estado, contactos, RFC, razón social y régimen fiscal (opcionales al alta).
- Si faltan datos fiscales, el cliente queda con `datos_fiscales_pendientes = true`. Esa marca solo bloquea la exportación para facturación; no bloquea cotizaciones ni proyectos.
- Todo cliente nuevo entra en estado "en revisión".
- Lo crean DIRECCION o ADMIN. VENDEDOR consulta los clientes y crea cotizaciones para ellos.
- Eliminar un cliente es lógico y solo lo hace ADMIN.

### 4.2 Catálogo de servicios
- Nombre, descripción, unidad de cobro (hora, proyecto o mensualidad) y tarifa en pesos.
- DIRECCION y ADMIN crean y editan. DIRECCION autoriza los servicios. VENDEDOR, TECNICO y DIRECCION lo consultan.
- Eliminar un servicio: solo ADMIN, de forma lógica.
- Cada servicio puede tener una categoría (Soporte, Redes, Desarrollo…). DIRECCION y ADMIN crean y renombran categorías; eliminar una categoría deja sus servicios sin categoría.
- DIRECCION o ADMIN asignan servicios a cada cliente, con una tarifa propia opcional. Sin tarifa propia se usa la del catálogo. Quitar una asignación es lógico.

### 4.3 Cotizaciones
- Pertenece siempre a un cliente. Puede existir sin proyecto (por ejemplo, un soporte mensual).
- VENDEDOR, DIRECCION y ADMIN crean cotizaciones. TECNICO no las ve.
- Folio consecutivo por año: COT-AAAA-NNNN.
- Precios: un servicio del catálogo usa la tarifa propia del cliente o la del catálogo, siempre desde el servidor. Solo las partidas libres llevan precio capturado.
- Vigencia por defecto: 15 días. Una enviada cuya vigencia venció se muestra como vencida y ya no se puede autorizar.
- Flujo: borrador (lo edita quien la creó, o ADMIN y DIRECCION) → enviada (la envía quien la creó, o ADMIN y DIRECCION) → aprobada o rechazada (solo ADMIN y DIRECCION). Solo se eliminan borradores.
- Pendiente para más adelante: PDF, envío por correo y conversión a proyecto.
- Partidas tomadas del catálogo o libres, cada una con cantidad, precio, descuento y subtotal.
- Descuentos, IVA del 16%, vigencia, folio consecutivo (`COT-2026-0001`), PDF y envío.
- Estados: borrador, enviada, aprobada, rechazada, vencida.
- En la v1 la aprobación se marca a mano. El enlace de aprobación para el cliente llega en la v1.5.
- Al aprobar, el usuario puede crear un proyecto desde la cotización.

### 4.4 Proyectos y tareas
- Un proyecto pertenece a un cliente y puede venir de una cotización aprobada o crearse directo.
- Tipo de cobro: precio fijo, por horas o mensualidad.
- Estados del proyecto: planeado, activo, en pausa, cerrado.
- Tareas con responsable, fechas, estado y avance.

### 4.5 Registro de horas
- Por tarea: fecha, persona, descripción, horas y costo interno.
- Sirve para comparar cotizado contra real en reportes.

### 4.6 Órdenes de servicio
- Folio, cliente, proyecto, técnico, actividades realizadas, evidencias (fotos y archivos), firma del cliente y PDF.
- Estados: abierta, en proceso, firmada, cerrada.
- Basada en un formato genérico, diseñado desde cero (sin usar formatos de otros empleadores).

### 4.7 Cobros
- Pagos registrados contra una cotización o un proyecto, con saldo pendiente.
- Estados del cobro: pendiente, parcial, pagado.

### 4.8 Reportes
- Horas por proyecto y por persona.
- Cotizado contra real (rentabilidad por proyecto).
- Proyectos activos.
- Cuentas por cobrar.
- Mensualidades por vencer.
- Clientes por estado.

### 4.9 Exportación para facturación
- CSV o Excel con los datos necesarios para facturar.
- Los clientes con datos fiscales pendientes se marcan en la exportación.

### 4.10 Módulos internos de NEXOTIC
- **Pipeline de prospectos:** contacto, reunión, propuesta, negociación y cierre (ganado o perdido), con próxima acción. Al ganar, el prospecto se convierte en cliente en estado "en revisión". Los prospectos no aparecen en la lista de clientes.
- **Seguimientos:** tareas con fecha, responsable y vínculo a cliente, proyecto o prospecto.
- **Biblioteca de procesos:** venta, cotización, ejecución, entrega y cobro, con versión vigente, responsable y fecha de revisión. Al inicio es una lista con enlaces.
- **Checklists de etapa:** por ejemplo, "cotización aprobada por escrito" antes de iniciar un proyecto.
- **Documentos:** propuestas, minutas y entregables ligados a clientes o proyectos. Al inicio como enlaces.

### 4.11 Usuarios y sesión
- Cada usuario tiene nombre para mostrar y un usuario de acceso único (minúsculas, sin espacios, 3 a 30 caracteres).
- Se entra con correo o usuario más contraseña.
- ADMIN: listar con búsqueda y filtro, ver detalle, crear, editar (nombre, usuario, correo, rol, estado), restablecer contraseña (genera una temporal que se muestra una vez y obliga a cambiarla al entrar) y eliminar lógicamente.
- El super administrador queda protegido según la sección 3.
- Sesión con cookie httpOnly y cierre de sesión que la revoca.

### 4.12 Colores por estado
- Cliente: en revisión amarillo, en proceso azul, activo verde, suspendido rojo, finalizado gris.
- Usuario: activo verde, inactivo gris, debe cambiar contraseña ámbar.
- Cada color va acompañado de la etiqueta de texto, no solo del color.

## 5. Estados

**Cliente:** en revisión → en proceso (se aprueba una cotización y se crea proyecto) → activo o finalizado. Suspendido puede venir de activo o de en proceso. Para reactivar, el usuario cambia el estado a "en revisión".

El sistema propone el estado según cotizaciones y proyectos. El usuario puede cambiarlo en cualquier momento.

**Cotización:** borrador → enviada → aprobada, rechazada o vencida.
**Proyecto:** planeado → activo → en pausa → cerrado.
**Orden de servicio:** abierta → en proceso → firmada → cerrada.
**Cobro:** pendiente → parcial → pagado.
**Prospecto:** contacto → reunión → propuesta → negociación → cierre (ganado o perdido).

La interfaz muestra siempre a qué entidad pertenece cada estado, porque "en proceso" y "activo" aparecen en clientes y en proyectos con significados distintos.

## 6. Reglas de negocio

- **Dinero:** montos en centavos enteros. Nunca decimales flotantes en base de datos ni en cálculos.
- **Cantidades:** en milésimas (2.5 horas = 2500), también enteras.
- **IVA:** 16%, definido una sola vez en `packages/shared`. Frontend y backend usan la misma función.
- **Redondeo:** mitad hacia arriba al centavo, definido una sola vez.
- **Orden de cálculo de cotización:** importe de partida, descuento de partida, base gravable, IVA, total.
- **Folios:** consecutivos por tipo y año (COT, OS, etc.).
- **Trazabilidad:** toda tabla registra `creadoEn`, `actualizadoEn` y quién la creó.

## 7. Requisitos no funcionales

- **Pruebas de cálculo obligatorias:** totales, descuentos, IVA y redondeo tienen pruebas automáticas. No se fusiona si fallan.
- **Seguridad:** contraseñas con hash, sesiones revocables, roles verificados en backend, secretos en variables de entorno.
- **Privacidad (LFPDPPP):** aviso de privacidad, acceso por rol y respaldos automáticos. Los datos fiscales solo se capturan cuando el cliente los pide.
- **Respaldos:** diarios de la base de datos, con prueba de restauración antes del piloto.
- **Rendimiento:** crear una cotización en menos de 10 minutos de uso real (criterio de éxito del plan).
- **Idioma y formatos:** español de México, moneda MXN, fechas dd/mm/aaaa.
- **Uso en móvil:** PWA, con la interfaz usable desde teléfono para registrar horas y firmar órdenes.

## 8. Herramientas

| Área | Herramienta | Estado |
|---|---|---|
| Frontend | React + TypeScript + Vite | Decidido |
| PWA | vite-plugin-pwa | Decidido |
| Enrutamiento web | React Router | Decidido |
| Backend | Node.js + TypeScript + Express | Decidido |
| ORM y migraciones | Prisma | Decidido (migraciones versionadas) |
| Base de datos | PostgreSQL 16 (Docker para local) | Decidido |
| Validación | Zod (en `packages/shared`) | Decidido |
| Monorepo | pnpm workspaces | Decidido |
| Pruebas | Vitest y supertest | Decidido |
| Control de versiones | Git + GitHub, `main` protegida, PR revisado por el otro socio | Decidido |
| Integración continua | GitHub Actions (lint, pruebas, build) | Decidido |
| Autenticación | Sesiones con cookie httpOnly | Decidido |
| Archivos (evidencias y PDF) | Almacenamiento compatible con S3 | Por elegir proveedor |
| Generación de PDF (cotización y orden) | Por definir (librería) | Pendiente |
| Exportación CSV/Excel | Por definir (librería) | Pendiente |
| Envío de cotizaciones por correo | Por definir (proveedor SMTP) | Pendiente |
| Firma del cliente | Captura en navegador (canvas) | Por confirmar |
| Hosting de producción y staging | Gestionado, mismo proveedor | Pendiente |
| Respaldos | Del proveedor de base de datos | Pendiente de confirmar |

## 9. Entornos y flujo de trabajo

- **Local:** Docker con PostgreSQL. Migraciones y seed de datos de prueba.
- **Staging:** mismo proveedor que producción. Pruebas del equipo y del uso interno.
- **Producción:** desde la semana 12, con datos reales de NEXOTIC.
- Cada historia se trabaja en una rama corta (`feat/...`) y entra por PR revisado por el otro socio.
- Sprints de dos semanas con demo al final.

**Definición de terminado:** funciona en staging, tiene pruebas automáticas, respeta roles, valida en backend y fue revisado en PR.

## 10. Alcance excluido de la v1

- Timbrado CFDI con PAC.
- Inventario.
- Reuniones y minutas.
- Portal avanzado de clientes y flujos de aprobación con varios niveles.
- Integraciones contables.
- App nativa (sí habrá PWA).
- Panel de administración de la plataforma.
- Multiempresa.

## 11. Decisiones abiertas

1. **Piloto con negocios externos (semanas 15-18 del plan):** si NEXOTIC decide que otros negocios usen el sistema, la multiempresa vuelve a ser necesaria. Hoy queda fuera de la v1 interna.
2. **Roles:** confirmar la lista de la sección 3, en especial si DIRECCION necesita editar algo.
3. **Proveedor de hosting, almacenamiento y correo.**
4. **Librerías de PDF y de Excel.**
5. **Reparto de roles técnicos entre los dos socios.**
6. **Tipo de cobro predeterminado para proyectos nuevos.**
7. **Anticipo en cotizaciones:** porcentaje elegible por cotización, con 0 % por defecto, calculado sobre el total con IVA. Mostrarlo en el detalle y en la impresión. Confirmar con contador el tratamiento fiscal del anticipo. El registro de pagos queda en cobros (4.7).
8. **Firma del cliente:** bloque de aceptación impreso en la cotización. La firma digital dentro de la app queda para la v1.5.
9. **Estado de trabajos por servicio** (en revisión, aprobado, en proceso, terminado): aplica a instalación y mantenimiento, no a venta de hardware. Se ubicará en órdenes de servicio (4.6) o proyectos (4.4), no en la asignación del cliente.
10. **Costos y utilidad interna:** costo estimado por partida, con utilidad y margen visibles solo para ADMIN y DIRECCION. Nunca aparecen en la impresión. El costo real se compara después contra el registro de horas (4.5).
11. **Rol de contador (posterior):** solo lectura de cobros, facturación y reportes de ingresos, sin crear ni aprobar cotizaciones. Se define con quien lo usará, porque toca el modelo de usuarios.
12. **Reportes de ingresos y utilidad:** dependen de cobros (4.7) y de costos reales (4.5). Orden propuesto: cobros y anticipos, luego costos y márgenes, y al final el rol de contador con sus reportes.

## 12. Impacto en lo ya construido (Sprint 1)

Como la v1 es de una sola empresa:

- Se elimina `tenant` del modelo de datos. `Tenant` deja de existir y `tenantId` desaparece de todas las tablas.
- La sesión deja de llevar `tenantId`. Solo lleva el usuario y su rol.
- El login ya no pide empresa (`empresa` / `slug`).
- Las pruebas de aislamiento por empresa se sustituyen por pruebas de roles (qué puede hacer cada uno).
- Se conservan: autenticación, roles, clientes, catálogo de servicios, esquemas Zod y el módulo de cálculo de totales.
- Se requiere una migración nueva para quitar las tablas y columnas de tenant. Como todavía no hay datos reales, conviene recrear la migración inicial (`init`).
