# CONTEXTO INTEGRAL DEL PROYECTO PARKFLOW - KIDZANIA SANTIAGO
## Documento Maestro de Contexto para Elaboración de Incremento 1 (Casos de Uso Consolidados 1 al 23)

---

## 1. Identificación y Objetivos del Proyecto

- **Organización Cliente:** KidZania Santiago (Parque Temático y Centro de Eduentretenimiento, Parque Araucano, Las Condes, Santiago, Chile).
- **Razón Social:** KidZania Santiago S.A. (RUT: 76.123.456-7).
- **Giro:** Entretenimiento Educativo Infantil, Gastronomía y Retail Oficial.
- **Equipo Consultor / Desarrollador:** Grupo 19 — Curso de Ingeniería de Software (IDS), 2026.
- **Nombre de la Solución:** **ParkFlow** — Sistema de Gestión Operativa Integral para Gastronomía, Retail e Inventarios de KidZania Santiago.
- **Problema de Negocio a Resolver (según Documento 0):**
  - Desconexión operativa entre bodegas centrales, cocina y los 7 puestos de venta en el parque.
  - Inexistencia de control estricto de mermas, recetas e insumos críticos perecibles.
  - Quiebres de stock en horas punta y diferencias no auditadas en aperturas y cierres de caja.
  - Necesidad de trazabilidad por lotes (FIFO / FEFO), auditoría de cambios y preparación para sincronización con SAP Business One.
  - Regla de negocio taxativa (Documento 0 Sección I.5): **Los KidZos (moneda ficticia del parque) NO son aceptados como medio de pago en los puestos de venta**.

---

## 2. Arquitectura Tecnológica y Stack de Implementación

- **Backend:** Node.js (v20+ / v26) con Express.js en arquitectura MVC RESTful.
- **Base de Datos:** PostgreSQL 16 relacional con esquemas normalizados en `public`. Desplegado en Docker container (`kidzania-postgres`, base `kidzania_db`).
- **Autenticación y Seguridad:**
  - JWT (JSON Web Tokens) con expiración de 8 horas.
  - Hashing seguro de contraseñas y PINs con `bcryptjs` (salt rounds = 10).
  - Control de Acceso Basado en Roles (RBAC) con bloqueo automático tras 5 intentos fallidos de PIN.
- **Frontend:** Single Page / Multi-View Vanilla JavaScript moderno, HTML5 responsivo y Tailwind CSS (estilo corporativo KidZania Slate/Amber/Rose).
- **Mecanismo de Migración:** Esquema centralizado sincronizado entre `Proyecto/database/01_esquema_inicial.sql` y auto-migración idempotente en `Proyecto/backend/config/initDb.js` (`initDatabase()`).

---

## 3. Modelo de Dominio y Datos Clave

### A. Estructura de Puestos de Venta Oficiales de KidZania (7 Puestos)
1. **Línea Gastronómica (`comida` - 4 puestos):**
   - `PUESTO-COM-01`: Cafetería Vita (Plaza Central)
   - `PUESTO-COM-02`: Restaurante La Plaza (Sector Comidas)
   - `PUESTO-COM-03`: Al Paso (Entrada Principal)
   - `PUESTO-COM-04`: Dulcería (Teatro KidZania)
2. **Línea Merchandising (`merch` - 3 puestos):**
   - `PUESTO-MER-01`: Candy Corner (Sector Niños)
   - `PUESTO-MER-02`: BKidZanian (Oficina de Pasaportes)
   - `PUESTO-MER-03`: National Store (Salida Parque)

### B. Tablas Principales de Base de Datos
- `public.usuario`: Credenciales, roles (`admin`, `caja`, `cocina`, `operador_inventario`, `supervisor`, `encargado_rrhh`), correo `@kidzania.cl`, hash de contraseña, PIN numérico (`usuario_pin_hash`), intentos fallidos y estado de bloqueo.
- `public.unidad_medida_personalizada`: Unidades operativas (`UN`, `KG`, `G`, `L`, `ML`, `PAQ`, `CAJA`).
- `public.proveedor`: Razón social, RUT, correo, teléfono, plazo de pago, modalidad de entrega.
- `public.ubicacion_bodega`: Bodegas y sectores físicos de almacenamiento en el parque.
- `public.categoria_producto`: Categorización taxonómica (`Comida Preparada`, `Bebidas`, `Insumos de Cocina`, `Artículos de Merchandising`, `Consumo Interno`).
- `public.producto`: Código, nombre, precio venta, stock actual, stock crítico mínimo, stock máximo, tipo de negocio (`comida` vs `merch`), tipo de control (`lote` vs `unidades`), categoría, ubicación, días de alerta de vencimiento.
- `public.lote`: Código de lote, fecha de elaboración, fecha de vencimiento, costo unitario, cantidad inicial y actual, documento de respaldo, estado de recepción (`conforme`, `con_observaciones`, `rechazado`).
- `public.movimiento_stock`: Kardex completo de movimientos (`ingreso`, `salida`, `ajuste_positivo`, `ajuste_negativo`, `transferencia`, `merma`, `venta`).
- `public.catalogo_motivo`: Motivos parametrizables de salida, merma y descarte operativo.
- `public.conteo_fisico`: Registro de toma física de inventario para comparación contra stock teórico.
- `public.ajuste_inventario`: Ajustes formalizados con cálculo de porcentaje de impacto y detección de ajustes críticos (>10%).
- `public.transferencia_interna`: Movimientos de stock entre diferentes ubicaciones del parque.
- `public.merma`: Registro de desperdicios, caducidades o daños con costo unitario y total.
- `public.receta`: Escandallo/fórmula de preparación que vincula producto elaborado con sus insumos y cantidades requeridas para descuento automático por venta.
- `public.puesto_venta`: Catálogo operativo de los 7 puntos de venta con línea de negocio y estado.
- `public.caja_sesion`: Turnos de caja con fondo inicial, hora apertura/cierre, totales por medio de pago, efectivo esperado, efectivo contado, diferencia de arqueo y estado (`cuadrada`, `sobrante`, `faltante`).
- `public.venta_pos`: Cabecera de transacción con folio de boleta, totales, neto, IVA (19%), desglose por medio de pago, estado de venta y estado de sincronización SAP (`pendiente`/`sincronizado`).
- `public.venta_pos_detalle`: Desglose multi-ítem vendido con producto, cantidad, precio, descuento y referencia de movimiento de stock.
- `public.venta_pos_pago`: Detalle de tramos de pago (pagos simples o combinados) con montos, montos recibidos, vueltos y códigos de autorización.
- `public.bitacora_auditoria` y `public.auditoria_producto`: Trazabilidad forense de accesos, ventas, cambios de stock y modificaciones de catálogo.

---

## 4. Matriz de Casos de Uso del Incremento 1 (Consolidados 1 al 23)

La siguiente tabla detalla la correspondencia exacta entre los **23 Casos de Uso Consolidados** asignados al Incremento 1 y los **59 Casos de Uso Originales de Documento 0** que cubren en su totalidad:

| CU Consolidado | Nombre Consolidado | Módulo Doc 0 | CUs Originales Doc 0 Cubiertos | Alcance Operativo e Implementación |
|---|---|---|---|---|
| **CU 1** | Autenticar administrador en el sistema | Módulo A · Autenticación | **CU 1** (Autenticando Usuario), **CU 2** (Validando Dominio Correo) | Login con correo institucional obligatorio (`@kidzania.cl`), contraseña encriptada, validación de estado activo y token JWT. |
| **CU 2** | Validar permisos según el rol del usuario | Módulo A · Autenticación | **CU 3** (Validando Permisos según Rol) | Middleware RBAC granular (`requerirPermiso`), restricción de rutas backend y renderizado condicional de vistas según rol. |
| **CU 3** | Administrar cuentas y credenciales de trabajadores | Módulo A · Autenticación | **CU 85** (Asignando PIN), **CU 86** (Desbloqueando Cuenta) | Gestión de personal, reseteo de contraseñas, asignación de PIN de 4 dígitos y desbloqueo administrativo de cuentas con auditoría. |
| **CU 4** | Autenticar trabajador mediante PIN | Módulo A · Autenticación | **CU 77** (Autenticando Trabajador con PIN) | Acceso táctil kiosco POS mediante PIN de 4 dígitos con teclado numérico en pantalla, contador de 5 intentos y bloqueo. |
| **CU 5** | Mantener unidades de medida | Módulo B · Base | **CU 4** (Registrar Unidad de Medida) | CRUD de unidades operativas (UN, KG, L, etc.), validación de código único, control de uso en recetas y catálogo. |
| **CU 6** | Mantener proveedores | Módulo B · Base | **CU 5** (Registrar Proveedor) | Catálogo oficial de proveedores de KidZania con validación de RUT chileno, plazos de pago y modalidades de entrega. |
| **CU 7** | Mantener ubicaciones de almacenamiento | Módulo B · Base | **CU 6** (Registrar Ubicación de Almacenamiento) | Mantenimiento de bodegas y sectores de almacenamiento físico (Bodega Central, Cámara Fría, Puestos). |
| **CU 8** | Mantener catálogo de productos y auditoría | Módulo C · Catálogo | **CU 7** (Registrar Producto), **CU 34** (Gestionando Categorías), **CU 35** (Actualizando con Auditoría), **CU 36** (Baja Lógica), **CU 37** (Tipo Control Stock), **CU 38** (Asignando Ubicación) | Catálogo maestro de productos con categorías, tipo de control (lote vs unidades), ubicación física, auditoría de cambios y baja lógica (sin borrado físico). |
| **CU 9** | Asociar productos a proveedores | Módulo C · Catálogo | **CU 8** (Asociando Producto a Proveedor) | Asignación contractual de insumos y productos terminados a uno o más proveedores oficiales con códigos de referencia. |
| **CU 10** | Recibir y registrar lotes con validaciones | Módulo C · Lotes | **CU 9** (Registrar Lote), **CU 10** (Validando Fechas), **CU 39** (Registrar Ingreso Mercadería), **CU 40** (Registrar Costo Unitario), **CU 48** (Registrar Responsable Recepción) | Recepción de mercadería con código de lote, validación FEFO (elaboración < vencimiento), costo unitario, documento de respaldo y usuario responsable. |
| **CU 11** | Registrar salidas de inventario y clasificar motivos | Módulo D · Movimientos | **CU 12** (Registrar Salida), **CU 13** (Clasificando Motivo), **CU 44** (Validando Disponibilidad Stock) | Salidas de bodega por consumo interno, rotura o descarte con selección obligatoria de motivo de catálogo y bloqueo si el stock es insuficiente. |
| **CU 12** | Ajustar inventario mediante conteo y transferencias | Módulo D · Movimientos | **CU 14** (Ajustando Inventario), **CU 15** (Registrar Conteo Físico), **CU 16** (Transfiriendo Internamente), **CU 43** (Registrar Obs. Ajuste Crítico), **CU 53** (Generando Inventario Físico) | Toma de inventario físico, cálculo de discrepancias, transferencias entre bodegas y justificación obligatoria para ajustes críticos (>10% de variación). |
| **CU 13** | Registrar y gestionar mermas | Módulo E · Mermas | **CU 18** (Registrar Merma), **CU 50** (Gestionando Mermas y Desperdicios) | Registro de desperdicios de cocina o bodega asociando lote, costo unitario y total, generando automáticamente el movimiento de salida en el kardex. |
| **CU 14** | Consultar historial de movimientos (Kardex) | Módulo D · Movimientos | **CU 17** (Consultando Historial), **CU 42** (Historial por Producto) | Trazabilidad completa de entradas, salidas, ajustes y ventas, con filtros multicriterio por fecha, producto, tipo y usuario. |
| **CU 15** | Consultar existencias y stock en tiempo real | Módulo F · Consultas | **CU 19** (Buscando Productos), **CU 20** (Aplicando Filtros), **CU 21** (Consultando Existencias), **CU 41** (Calculando Stock Disponible), **CU 51** (Stock en Tiempo Real) | Búsqueda multicriterio en vivo, filtros acumulativos (categoría, línea, bodega) y cálculo dinámico de stock disponible descontando reservas. |
| **CU 16** | Configurar límites y alertas de stock crítico | Módulo G · Alertas | **CU 22** (Definiendo Stock Mín/Máx), **CU 23** (Alerta Stock Bajo), **CU 52** (Configurando Alertas Críticas) | Parametrización de niveles mínimos y máximos por producto con generación de notificaciones visuales y badges de riesgo de desabastecimiento. |
| **CU 17** | Monitorear alertas y lotes por vencimiento | Módulo G · Alertas | **CU 24** (Alerta de Vencimiento), **CU 25** (Listando por Vencimiento) | Monitoreo proactivo de fechas de caducidad con semáforo de criticidad (Vencido, Crítico ≤7 días, Próximo ≤15 días, Conforme). |
| **CU 18** | Administrar catálogos operativos | Módulo E · Catálogos | **CU 45** (Creando Motivo), **CU 46** (Modificando Motivo), **CU 47** (Inactivando Motivo), **CU 54** (Configurando Catálogos Operativos) | Mantenimiento dinámico de motivos para salidas, mermas, descartes y consumos internos con activación/inactivación sin eliminación física. |
| **CU 19** | Definir recetas y descontar automáticamente sus insumos | Módulo H · Recetas | **CU 26** (Registrando Receta), **CU 27** (Descontando Insumos por Venta) | Creación de recetas gastronómicas (ej: Hot Dog, Pizza, Jugo) con proporciones de insumos, y descuento automático de inventario al registrarse una venta. |
| **CU 20** | Registrar y gestionar pedidos | Módulo K · Pedidos | **CU 49** (Registrar Pedido), **CU 58** (Visualizando Estado Pedido) | Apertura de comandas y pedidos gastronómicos asociados a clientes/mesas, selección de ítems y seguimiento de ciclo de vida del pedido. |
| **CU 21** | Registrar venta, calcular total y actualizar inventario | Módulo I · Ventas | **CU 28** (Registrar Venta), **CU 29** (Asociando a Inventario), **CU 30** (Descontando Stock por Venta), **CU 64** (Calculando Total Automático) | Terminal de punto de venta (POS) multi-ítem con validación de caja abierta, cálculo de Neto, IVA (19%) y total, descuento de stock y emisión de boleta. |
| **CU 22** | Gestionar promociones y descuentos | Módulo I · Ventas | **CU 31** (Gestionando Promociones y Descuentos), **CU 65** (Configurando Promoción), **CU 66** (Validando Compatibilidad Promociones) | Parametrización de descuentos porcentuales o de monto fijo, reglas de aplicación a productos y control de incompatibilidad de promociones cruzadas. |
| **CU 23** | Registrar pagos, incluidos pagos combinados | Módulo I · Ventas | **CU 32** (Registrar Método de Pago), **CU 63** (Registrando Pagos Combinados) | Cobro de ventas con validación estricta: Efectivo (cálculo de vuelto), Tarjetas (autorización), Transferencia y Pagos Combinados (2+ medios que cubren el 100% del total). Rechazo explícito de KidZos. |

---

## 5. Casos de Soporte Operativo Implementados que Integran el Flujo (Puestos y Cajas)

Para que el ciclo de venta de los **CU 21 y 23** funcione en estricta conformidad con la regla de negocio **UR 8.7** ("*No se permite registrar ventas sin una caja abierta*"), el sistema cuenta con los siguientes casos complementarios ya implementados:
- **CU 32 (CU orig. 82):** Mantener puestos de venta (Comida vs Merch) con validación de nombre único y bloqueo de inactivación con caja abierta.
- **CU 25 (CU orig. 78):** Apertura de caja en puesto con asignación de fondo inicial en efectivo y bloqueo de cajas simultáneas por cajero/puesto.
- **CU 26 (CU orig. 79):** Cierre de caja con arqueo ciego, cálculo de efectivo esperado (`Fondo + Ventas Efectivo`) y clasificación en *Cuadrada*, *Sobrante* o *Faltante*.
- **CU 34 (CU orig. 83, 84, 89):** Monitoreo en tiempo real de cajas abiertas, consulta de historial de ventas con boleta tributaria e historial de auditoría de arqueos.

---

## 6. Mapeo de Rutas de la Aplicación y Archivos de Código

| Componente / Funcionalidad | Controlador Backend | Rutas Express | Vista Frontend |
|---|---|---|---|
| Autenticación, JWT y PIN (CU 1, 2, 3, 4) | `backend/controllers/c_authController.js` | `backend/routes/c_auth.js` | `frontend/views/v_login.html`, `v_pos_login.html`, `v_usuarios.html` |
| Unidades, Proveedores y Ubicaciones (CU 5, 6, 7) | `backend/controllers/c_inventarioController.js` | `backend/routes/c_inventario.js` | `frontend/views/v_proveedores.html`, `v_bodegas.html` |
| Catálogo, Categorías y Lotes (CU 8, 9, 10) | `backend/controllers/c_inventarioController.js` | `backend/routes/c_inventario.js` | `frontend/views/v_catalogo.html`, `v_lotes.html` |
| Movimientos, Ajustes y Transferencias (CU 11, 12, 14) | `backend/controllers/c_movimientosController.js` | `backend/routes/c_movimientos.js` | `frontend/views/v_movimientos.html`, `v_ajustes.html` |
| Mermas y Catálogos Operativos (CU 13, 18) | `backend/controllers/c_mermasController.js` | `backend/routes/c_mermas.js` | `frontend/views/v_mermas.html` |
| Existencias, Búsqueda y Alertas (CU 15, 16, 17) | `backend/controllers/c_stockController.js` | `backend/routes/c_stock.js` | `frontend/views/v_stock.html`, `v_alertas.html` |
| Recetas y Preparación (CU 19) | `backend/controllers/c_recetasController.js` | `backend/routes/c_recetas.js` | `frontend/views/v_recetas.html` |
| Puestos de Venta y Cajas (CU 32, 25, 26, 34) | `backend/controllers/c_cajaController.js` | `backend/routes/c_puestos.js`, `c_cajas.js` | `frontend/views/v_salon.html` |
| Terminal POS, Ventas y Pagos Combinados (CU 21, 23) | `backend/controllers/c_cajaController.js` | `backend/routes/c_cajas.js` | `frontend/views/v_pos.html` |
| Dashboard Ejecutivo Consolidado (CU 33) | `backend/controllers/c_dashboardController.js` | `backend/routes/c_dashboard.js` | `frontend/views/v_dashboard.html` |

---

## 7. Instrucciones para la Redacción del Informe del Incremento 1

Al redactar el entregable del **Incremento 1**:
1. **Introducción y Alcance:** Explicar que el Incremento 1 consolida la columna vertebral operativa y transaccional del parque (Inventario, Trazabilidad, Recetas Gastronómicas, Apertura/Cierre de Turnos y Venta POS con Pagos Múltiples).
2. **Especificación de Requisitos:** Citar los 23 Casos de Uso Consolidados tabulados arriba, destacando que abarcan 59 casos originales de Documento 0.
3. **Diagramas UML Sugeridos:**
   - Diagrama de Casos de Uso del Núcleo Transaccional (Cajero, Operador de Bodega, Cocina y Administrador).
   - Diagrama de Clases del Modelo de Datos (Productos, Lotes, Movimientos, Recetas, Cajas, Ventas y Pagos).
   - Diagrama de Secuencia de Venta POS con Pago Combinado y Descuento Automático de Insumos de Receta.
4. **Validación y Evidencias:** Incluir capturas de las pantallas implementadas (`v_pos.html`, `v_salon.html`, `v_stock.html`, `v_mermas.html`, `v_recetas.html`) y documentar las pruebas de no aceptación de KidZos y cuadratura de caja en arqueo.

