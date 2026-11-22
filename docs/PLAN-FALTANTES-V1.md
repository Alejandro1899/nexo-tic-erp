# Plan: lo que falta para la v1 de NEXOTIC

Este documento compara lo que ya existe con lo que pide `docs/ALCANCE-NEXOTIC-ERP.md`, y propone cómo construir lo que falta. Sirve para decidir el orden y para que los dos socios revisen el mismo plan.

Tamaños: **S** (uno o dos días), **M** (una semana), **L** (dos semanas o más).

## 1. Estado actual

| Área | Estado | Notas |
|---|---|---|
| Autenticación, roles y cambio de contraseña inicial | Hecho | Sesión en cookie, control por rol en backend. |
| Clientes (alta, edición, lista, eliminación lógica) | Parcial | Falta contactos, ID de cliente y la regla de estado "en revisión" al alta. |
| Catálogo de servicios y categorías | Hecho | Tarifa propia por cliente: revisar si ya está en la UI. |
| Cotizaciones (folio, partidas, IVA, vigencia, flujo) | Hecho | Falta PDF y envío por correo. |
| Usuarios (ADMIN) | Hecho | Restablecer contraseña y eliminación lógica incluidos. |
| Inicio con indicadores y gráficas | Parcial | Indicadores de cotizaciones; faltan los de proyectos y cobros. |
| Proyectos y tareas (4.4) | No existe | |
| Registro de horas (4.5) | No existe | |
| Órdenes de servicio (4.6) | No existe | Requiere firma y evidencias (archivos). |
| Cobros (4.7) | No existe | |
| Reportes (4.8) | No existe | Varios dependen de horas, proyectos y cobros. |
| Exportación CSV/Excel (4.9) | No existe | |
| Pipeline de prospectos (4.10) | No existe | |
| Seguimientos, procesos, checklists, documentos (4.10) | No existe | Los últimos cuatro se pueden empezar como listas con enlaces. |
| Bitácora del sistema | No existe | No está en el alcance: hay que agregarlo. |
| PDF de cotización y orden | No existe | Requiere elegir librería. |
| Almacenamiento de archivos (evidencias, PDF) | No existe | Requiere elegir proveedor. |

## 2. Qué falta y cómo se implementaría

### 2.1 Contactos del cliente (M)

**Qué:** el alcance dice que un cliente tiene "contactos", pero el modelo `Cliente` no tiene teléfono ni correo.

**Cómo:**
- Nueva tabla `Contacto` con `clienteId`, `nombre`, `puesto`, `telefono`, `correo`, `esPrincipal` y campos de trazabilidad.
- Un cliente puede tener varios contactos; uno puede marcarse como principal.
- Migración de Prisma nueva, sin tocar las anteriores.
- API: `GET/POST /api/clientes/:id/contactos`, `PATCH/DELETE /api/contactos/:id`. Roles: DIRECCION y ADMIN crean y editan; VENDEDOR consulta.
- Frontend: sección "Contactos" en la ficha del cliente, con botones para llamar y escribir correo.
- Validación con Zod en `packages/shared`: teléfono (solo dígitos y longitud), correo válido.

**Pruebas:** permisos por rol, validación de teléfono y correo, un solo principal por cliente.

### 2.2 ID de cliente (S)

**Qué:** un folio legible para referenciar al cliente, igual que las cotizaciones.

**Cómo:**
- Campo `folio` único en `Cliente`, con formato `CLI-0001`.
- Generación consecutiva en el servidor, dentro de una transacción para que dos altas simultáneas no repitan número.
- Migración: asignar folio a los clientes existentes en orden de creación.

**Decisión abierta:** confirmar el formato `CLI-0001` o preferir uno por año, como `CLI-2026-0001`.

### 2.3 Bitácora del sistema (M)

**Qué:** registro de quién hizo qué y cuándo. No está en el alcance, así que hay que agregarlo al documento antes de construirlo.

**Cómo:**
- Tabla `Bitacora` con `usuarioId`, `accion` (por ejemplo `CLIENTE_CREADO`, `COTIZACION_APROBADA`, `ROL_CAMBIADO`), `entidad`, `entidadId`, `resumen` y `creadoEn`. Opcional: `antes` y `despues` en JSON para cambios.
- Un servicio único `registrarBitacora()` que los módulos llaman después de cada cambio importante. No se escribe a mano en cada ruta.
- Solo lectura desde la app, y solo ADMIN la consulta. Nadie la puede editar ni borrar.
- Pantalla con filtros por usuario, fecha, entidad y acción.

**Pruebas:** que cada alta, cambio de estado y restablecimiento de contraseña genere un registro, y que VENDEDOR reciba un 403 al consultarla.

**Decisión abierta:** ¿qué acciones se registran? Propuesta mínima: altas, ediciones, cambios de estado y de rol, aprobaciones, restablecimientos de contraseña y eliminaciones.

### 2.4 Exportación para facturación (S a M)

**Qué:** CSV con datos de clientes y cotizaciones. Los clientes con datos fiscales pendientes se marcan.

**Cómo:**
- Endpoint `GET /api/exportaciones/clientes.csv` y `GET /api/exportaciones/cotizaciones.csv`, con filtros por fecha y estado.
- CSV generado en el servidor con escape correcto de comas, comillas y saltos de línea. Sin librería externa.
- Columna `datosFiscalesPendientes` y una columna `observacion` que lo explique.
- Solo ADMIN y DIRECCION exportan. La exportación queda en la bitácora.
- Excel (`.xlsx`) se agrega después, con una librería como `exceljs`, cuando se decida.

**Decisión abierta:** ¿CSV basta por ahora o necesitan Excel desde el inicio?

### 2.5 PDF de cotización (M a L)

**Qué:** cotización imprimible con el formato "Cotización Nexo TIC" (archivo de referencia: `Cotizacion_Nexo_TIC.pdf`, dos hojas).

**Qué pide el formato y qué falta en el sistema:**
- Emisor (empresa, correo, teléfono, sitio): fijo. Va en un archivo de configuración, no en la base.
- Folio `NX-AAAA-000`: el sistema usa `COT-AAAA-NNNN`. Decisión abierta.
- Proyecto: nombre, descripción y objetivo, alcance incluido y fuera de alcance. No existe; agregar a `Cotizacion`.
- Cliente: cliente, contacto, correo y teléfono. Se toma el contacto principal (fase 1).
- Conceptos: #, concepto, unidad, cantidad, precio unitario e importe. Falta la **unidad** en `CotizacionPartida`; hoy solo viene del servicio y las partidas libres no la tienen.
- Totales: ya se calculan en el servidor, en el mismo orden del formato.
- Tipo de cobro (precio fijo, por horas, mensualidad): agregar `tipoCobro` a `Cotizacion`.
- Anticipo (%) y saldo: agregar como entero (50 = 50%) y texto. Sin decimales.
- Tiempos de entrega (inicio, entrega final, hitos): dos fechas y un texto en `Cotizacion`.
- Medio de pago, condiciones y bloque de aceptación: texto fijo en la plantilla. La firma es impresa; la aceptación digital es de la v1.5.

**Cómo:**
1. **Datos (M):** migración con los campos nuevos en `Cotizacion` y `CotizacionPartida`. Formulario de cotización con secciones opcionales de proyecto, cobro y tiempos, para no bloquear cotizaciones rápidas.
2. **Plantilla (M a L):** `pdfkit`, que no necesita navegador y funciona en Render gratis.
   - Encabezado con logo, título, folio, fecha y vigencia.
   - Tabla de conceptos con la misma distribución de columnas.
   - Totales alineados a la derecha.
   - Casillas de tipo de cobro como cuadros vectoriales, porque la fuente estándar no tiene el símbolo ☐.
   - Pie en cada hoja con los datos del emisor y "Página X de Y".
   - Cantidades en milésimas que se muestran como decimales (2500 → 2.500).
   - Emisor y condiciones en configuración, para cambiarlos sin tocar código.
3. **Endpoint y botón (S):** `GET /api/cotizaciones/:id/pdf` con los mismos permisos que ver la cotización (TECNICO no la ve). Botón "Descargar PDF" en el detalle.
4. **Pruebas y revisión (S):** el archivo empieza con `%PDF`; TECNICO recibe 403; una cotización inexistente recibe 404. Revisión visual lado a lado contra el formato de referencia.

**Decisiones abiertas:**
- Folio: mantener `COT-AAAA-NNNN` o cambiar a `NX-AAAA-000`. Recomendado: el del formato.
- Logo original en PNG con fondo transparente o SVG.
- Texto final de las condiciones y datos de contacto del emisor. Recomendado: revisión de abogado o contador antes de usarlo con clientes.
- ¿Se imprime número de página?

### 2.6 Proyectos y tareas (L)

**Qué:** un proyecto nace de una cotización aprobada o se crea directo. Tiene tipo de cobro, estados y tareas con responsable, fechas y avance.

**Cómo:**
- Modelos `Proyecto` (clienteId, cotizacionId opcional, tipoCobro, estado) y `Tarea` (proyectoId, responsableId, fechas, estado, avance).
- Al aprobar una cotización, la UI ofrece crear el proyecto; la acción queda en la bitácora.
- Reglas: un proyecto cerrado no admite tareas nuevas; el cliente pasa a "en proceso" cuando se crea el primer proyecto.
- Pantallas: lista de proyectos, ficha con tareas y un tablero simple por estado.

**Dependencias:** contactos (2.1) y bitácora (2.3) conviene tenerlos antes.

### 2.7 Registro de horas (M)

**Qué:** horas por tarea, con persona, fecha, descripción y costo interno. Alimenta los reportes de cotizado contra real.

**Cómo:**
- Modelo `RegistroHora` con `tareaId`, `usuarioId`, `fecha`, `horasMilesimas` (entero, según la regla de cantidades) y `costoInternoCentavos`.
- Las horas se guardan en milésimas, nunca en decimales.
- Un técnico registra sus propias horas; ADMIN y DIRECCION registran por cualquiera.

**Dependencias:** proyectos y tareas (2.6).

### 2.8 Órdenes de servicio (L)

**Qué:** documento de trabajo con folio, cliente, proyecto, técnico, actividades, evidencias (fotos y archivos), firma del cliente y PDF.

**Cómo:**
- Modelo `OrdenServicio` con folio `OS-AAAA-NNNN`, estados y relación con proyecto.
- Evidencias: subida de archivos a un almacenamiento compatible con S3. Requiere decidir el proveedor.
- Firma: captura en canvas en el navegador, guardada como imagen; el cierre de la orden exige firma.
- PDF de la orden con la misma librería de la cotización.
- Pantalla móvil para que el técnico llene la orden desde el teléfono (la PWA ya está).

**Dependencias:** proyectos (2.6), almacenamiento de archivos (decisión abierta) y PDF (2.5).

### 2.9 Cobros (M)

**Qué:** pagos contra una cotización o proyecto, con saldo pendiente y estados pendiente, parcial y pagado.

**Cómo:**
- Modelo `Pago` con `cotizacionId` o `proyectoId`, monto en centavos, fecha y método.
- El saldo se calcula en el servidor a partir de los pagos registrados, no se guarda a mano.
- Un pago no puede exceder el saldo pendiente.

### 2.10 Reportes (M, en varias partes)

**Qué:** lista del alcance, sección 4.8.

**Cómo, por orden de dependencia:**
1. **Ya posibles:** clientes por estado y cotizaciones por estado, con monto aprobado (sección de inicio ampliada).
2. **Después de cobros:** cuentas por cobrar y mensualidades por vencer.
3. **Después de horas y proyectos:** horas por proyecto y por persona, cotizado contra real, proyectos activos.

Cada reporte es un endpoint de solo lectura con filtros por fecha, y una vista con la opción de exportar a CSV (2.4).

### 2.11 Pipeline de prospectos (M)

**Qué:** prospectos con etapas (contacto, reunión, propuesta, negociación, cierre), próxima acción y conversión a cliente al ganar.

**Cómo:**
- Modelo `Prospecto` separado de `Cliente`, para que no aparezca en la lista de clientes.
- Al marcar "ganado", se crea un `Cliente` en estado "en revisión" y se copian sus contactos.
- Vista tipo tablero por etapa.

### 2.12 Seguimientos, procesos, checklists y documentos (S a M)

Se pueden empezar sin lógica compleja:
- **Seguimientos:** tabla de tareas con fecha, responsable y vínculo opcional a cliente, proyecto o prospecto.
- **Biblioteca de procesos:** lista con nombre, versión, responsable, fecha de revisión y enlace.
- **Checklists:** plantillas simples por etapa, marcables por proyecto.
- **Documentos:** enlaces ligados a cliente o proyecto, mientras no haya almacenamiento de archivos.

## 3. Orden recomendado

| Fase | Entregable | Tamaño aprox. |
|---|---|---|
| 1 | Contactos del cliente y folio `CLI-0001` | M + S |
| 2 | Bitácora y pantalla para ADMIN | M |
| 3 | Exportación CSV de clientes y cotizaciones | S a M |
| 4 | PDF de cotización | M |
| 5 | Proyectos, tareas y registro de horas | L + M |
| 6 | Cobros y reportes de cobranza | M |
| 7 | Órdenes de servicio con firma y evidencias | L |
| 8 | Prospectos y módulos internos | M + S a M |
| 9 | Reportes de rentabilidad (cotizado contra real) | M |

La fase 1 y la 2 mejoran lo que ya existe y no dependen de nada nuevo. Las fases 5 a 9 son la mayor parte del trabajo.

## 4. Decisiones que necesitamos antes de empezar

1. **Formato del folio de cliente:** `CLI-0001` o `CLI-2026-0001`.
2. **Acciones de la bitácora:** la propuesta mínima de la sección 2.3, o más.
3. **Exportación:** CSV basta por ahora, o Excel desde el inicio.
4. **Librería de PDF** para cotizaciones y órdenes. Propuesta: `pdfkit`.
5. **Proveedor de almacenamiento** para evidencias y PDF. Opciones compatibles con S3: Cloudflare R2 o Backblaze B2 (ambos tienen plan gratuito o de bajo costo).
6. **Datos de NEXOTIC** que aparecen en el PDF: nombre fiscal, RFC, dirección y logotipo.
7. **Tareas de los dos socios:** cómo se reparten las fases del 1 al 9.

## 5. Ajustes al alcance que propongo

- Agregar la **bitácora** a la sección 4.11 (usuarios y sesión) o a una sección nueva.
- Agregar a la sección 4.1 los **contactos** con sus campos mínimos (nombre, teléfono, correo, principal) y el **folio de cliente**.
- Aclarar en la sección 4.9 si la exportación de v1 es solo CSV.
