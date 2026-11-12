# CONTEXTO INTEGRAL DEL PROYECTO PARKFLOW - KIDZANIA SANTIAGO
## Documento Maestro de Contexto para Elaboración de Incremento 2 (Casos de Uso Consolidados 24 al 35)

---

## 1. Identificación y Objetivos del Incremento 2

- **Proyecto:** ParkFlow — Sistema de Gestión Operativa Integral para KidZania Santiago.
- **Equipo:** Grupo 19 — Curso de Ingeniería de Software (IDS), 2026.
- **Propósito del Incremento 2:**
  - Completar el ciclo de vida operativo, atención al cliente y gestión avanzada del parque.
  - Conectar el flujo transaccional de caja y ventas (construido en el Incremento 1) con los módulos de:
    1. **Cancelaciones y Boletas Tributarias Electrónicas / Reimpresión:** Gestión de anulaciones y ciclo fiscal de ventas (CU 24 y CU 27).
    2. **Cocina, Comandas Digitales y Retiro de Pedidos:** Enrutamiento inteligente de productos que requieren preparación, pantalla KDS (Kitchen Display System), marcado de listo/entregado y registro de tiempos operativos e incidencias (CU 28, CU 29 y CU 30).
    3. **Integración Externa con ERP Corporativo:** Sincronización diferida y en tiempo real de ventas e inventario con **SAP Business One** (CU 31).
    4. **Gestión de Puestos de Venta y Cajas:** Administración de puestos, aperturas, cierres con arqueo ciego y monitoreo en tiempo real de turnos (CU 32, CU 25, CU 26 y CU 34).
    5. **Gestión de Promociones y Descuentos Avanzados:** Reglas de compatibilidad y aplicación automática en el punto de venta (CU 22).
    6. **Recursos Humanos, Turnos y Cumplimiento:** Registro de asistencia del personal, asignación de turnos planificados y cálculo de cumplimiento laboral (CU 35).
    7. **Inteligencia de Negocio y Reportes:** Dashboard ejecutivo, reportes especializados (ventas, mermas, vencimientos) y exportación de datos (CU 33).

---

## 2. Matriz de Casos de Uso del Incremento 2 (Consolidados 24 al 35)

La siguiente tabla presenta la relación exhaustiva entre los **12 Casos de Uso Consolidados** correspondientes al Incremento 2 y los **30 Casos de Uso Originales de Documento 0** que cubren:

| CU Consolidado | Nombre Consolidado | Módulo Doc 0 | CUs Originales Doc 0 Cubiertos | Alcance Operativo e Implementación |
|---|---|---|---|---|
| **CU 24** | Cancelar pedidos o ítems | Módulo K · Pedidos | **CU 55** (Cancelando Pedido o Ítems) | Anulación de pedidos completos o ítems específicos antes de su entrega, registrando motivo de cancelación y revirtiendo stock/reservas. |
| **CU 25** | Abrir caja en puesto de venta | Módulo M · Cajas | **CU 78** (Abriendo Caja) | Apertura formal de turno en puesto (comida o merch), asignación de fondo inicial en efectivo y bloqueo de aperturas simultáneas (UR 8.7). |
| **CU 26** | Cerrar caja con arqueo de efectivo | Módulo M · Cajas | **CU 79** (Cerrando Caja con Arqueo) | Cierre ciego de turno, cálculo automático de efectivo esperado (`Fondo + Ventas Efectivo`), registro de efectivo contado físico y clasificación (`cuadrada`, `sobrante`, `faltante`). |
| **CU 27** | Emitir y reimprimir boletas electrónicas | Módulo I · Ventas | **CU 80** (Emitiendo Boleta Electrónica), **CU 87** (Reimprimiendo Boleta) | Generación del documento tributario electrónico oficial con RUT emisor, desglose neto/IVA (19%), folio único e historial de reimpresión sin generar folios duplicados. |
| **CU 28** | Enrutar pedidos y generar comandas digitales | Módulo K · Pedidos | **CU 56** (Enrutando Automático Pedido), **CU 57** (Generando Comandas Digitales) | Filtro inteligente que envía a cocina únicamente ítems que requieren preparación gastronómica, generando la comanda digital con número de pedido. |
| **CU 29** | Consultar y actualizar estado de pedidos en cocina | Módulo L · Cocina y Retiro | **CU 60** (Visualizando Pedidos en Cocina), **CU 61** (Marcando Pedido como Listo) | Pantalla operativa KDS para personal de cocina: visualización de comandas pendientes, cambio de estado a *En Preparación*, *Listo para Retiro* y *Entregado*. |
| **CU 30** | Registrar tiempos operativos e incidencias | Módulo L · Cocina y Retiro | **CU 59** (Registrar Tiempos Operativos), **CU 62** (Registrar Incidencias) | Medición automática de tiempos de preparación y entrega por pedido, y registro de eventualidades operativas (quiebre de insumo, error de cocción, reclamo de comensal). |
| **CU 31** | Sincronizar ventas con SAP Business One | Módulo I · Ventas | **CU 81** (Sincronizando Venta con SAP Business One) | Interfaz de integración con el ERP corporativo SAP Business One: cola de sincronización, envío de boletas confirmadas, manejo de reintentos y actualización de estado (`sincronizado` / `error`). |
| **CU 32** | Administrar puestos de venta | Módulo M · Puestos | **CU 82** (Gestionando Puestos de Venta) | Mantenimiento de puestos de venta (Comida vs Merch), validación de nombre único, regla de no eliminación física y bloqueo de inactivación con caja abierta. |
| **CU 33** | Visualizar dashboard ejecutivo y generar reportes | Módulo J · Reportes | **CU 33** (Visualizando Dashboard), **CU 72** (Reporte Ventas), **CU 73** (Reporte Mermas), **CU 74** (Reporte Vencimiento), **CU 75** (Visualizando Indicadores), **CU 76** (Exportando Dashboard), **CU 88** (Filtrando por Período y Puesto) | Panel gerencial consolidado con KPIs en tiempo real, gráficos de ventas y mermas, alertas críticas y exportación de reportes ejecutivos. |
| **CU 34** | Consultar historial de ventas y auditoría de cajas | Módulo M · Cajas | **CU 83** (Consultando Historial Ventas), **CU 84** (Consultando Arqueos de Caja), **CU 89** (Monitoreando Cajas Abiertas) | Supervisión en vivo de cajas abiertas en el parque, auditoría histórica de boletas y reporte de arqueos destacando visualmente cajas con discrepancias. |
| **CU 35** | Registrar asistencia, turnos y cumplimiento | Módulo N · RRHH | **CU 67** (Registrando Asistencia), **CU 68** (Consultando Historial Asistencia), **CU 69** (Validando Asistencia), **CU 70** (Registrar Turnos), **CU 71** (Controlando Cumplimiento) | Planificación de turnos de trabajadores, registro de marcaje de entrada/salida (reloj control), validación de atrasos/inconsistencias y porcentaje de cumplimiento. |

---

## 3. Modelo de Datos Específico para el Incremento 2

Además de las tablas base construidas en el Incremento 1, el Incremento 2 utiliza las siguientes entidades en PostgreSQL:

### A. Cocina, Comandas y Pedidos (`Módulos K y L`)
- `public.pedido_comanda`: Cabecera de pedido (`pedido_id`, `puesto_id`, `cajero_id`, `mesa_id`, `estado_pedido` ['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'], `fecha_hora_creacion`, `tiempo_preparacion_minutos`).
- `public.pedido_comanda_detalle`: Líneas del pedido (`detalle_id`, `pedido_id`, `producto_id`, `cantidad`, `requiere_cocina` [boolean], `estado_item`, `observacion_preparacion`).
- `public.pedido_incidencia`: Registro de incidentes (`incidencia_id`, `pedido_id`, `usuario_id`, `tipo_incidencia`, `descripcion`, `tiempo_retraso_min`, `creado_en`).

### B. Boletas Tributarias y SAP Business One (`Módulo I`)
- `public.boleta_electronica`: Documento fiscal (`boleta_id`, `venta_id`, `folio_boleta`, `rut_emisor`, `razon_social`, `monto_neto`, `monto_iva`, `monto_total`, `fecha_emision`, `reimpresiones_count`, `ultimo_reimpreso_en`).
- `public.sap_sincronizacion_log`: Bitácora de integración ERP (`sync_id`, `venta_id`, `estado_sap` ['pendiente', 'sincronizado', 'error'], `payload_enviado`, `respuesta_sap`, `codigo_transaccion_sap`, `intentos_count`, `fecha_sincronizacion`).

### C. Promociones y Descuentos Cruzados (`Módulo I`)
- `public.promocion`: Catálogo de promociones (`promocion_id`, `promocion_codigo`, `promocion_nombre`, `tipo_descuento` ['porcentaje', 'monto_fijo'], `valor_descuento`, `fecha_inicio`, `fecha_fin`, `estado` ['activo', 'inactivo']).
- `public.promocion_producto`: Relación n:m de productos aplicables por promoción.
- `public.promocion_incompatibilidad`: Matriz de exclusión mutua para evitar aplicación simultánea de descuentos no combinables.

### D. Recursos Humanos, Turnos y Cumplimiento (`Módulo N`)
- `public.turno_planificado`: Asignación de turnos (`turno_id`, `usuario_id`, `puesto_id`, `fecha_turno`, `hora_inicio_programada`, `hora_fin_programada`, `tolerancia_minutos`).
- `public.registro_asistencia`: Marcaje de asistencia (`asistencia_id`, `usuario_id`, `turno_id`, `hora_entrada`, `hora_salida`, `estado_asistencia` ['presente', 'atraso', 'ausente', 'inconsistente'], `minutos_atraso`, `observaciones`).

---

## 4. Mapeo de Vistas Frontend y Controladores Backend del Incremento 2

| Módulo / CU | Controlador Backend | Rutas Express | Vista Frontend |
|---|---|---|---|
| Puestos de Venta y Cajas (CU 32, 25, 26, 34) | `backend/controllers/c_cajaController.js` | `backend/routes/c_puestos.js`, `c_cajas.js` | `frontend/views/v_salon.html`, `v_pos.html` |
| Boletas y Sincronización SAP (CU 27, 31) | `backend/controllers/c_cajaController.js`, `c_sapController.js` | `backend/routes/c_cajas.js`, `c_sap.js` | `frontend/views/v_pos.html`, `v_salon.html` |
| Pedidos y Comandas KDS Cocina (CU 24, 28, 29, 30) | `backend/controllers/c_pedidosController.js`, `c_cocinaController.js` | `backend/routes/c_pedidos.js`, `c_cocina.js` | `frontend/views/v_cocina.html`, `v_pedidos.html` |
| Promociones y Descuentos (CU 22) | `backend/controllers/c_promocionesController.js` | `backend/routes/c_promociones.js` | `frontend/views/v_promociones.html`, `v_pos.html` |
| Asistencia, Turnos y Cumplimiento (CU 35) | `backend/controllers/c_rrhhController.js` | `backend/routes/c_rrhh.js` | `frontend/views/v_asistencia.html` |
| Dashboard y Reportes Ejecutivos (CU 33) | `backend/controllers/c_dashboardController.js` | `backend/routes/c_dashboard.js` | `frontend/views/v_dashboard.html` |

---

## 5. Guía de Redacción para el Informe del Incremento 2

1. **Objetivo del Documento:** Consolidar el cierre del ciclo operativo del sistema ParkFlow: atención de clientes en puestos de venta, coordinación en tiempo real con cocina mediante pantalla KDS, control fiscal con boletas electrónicas, integración con SAP Business One y control de personal y turnos.
2. **Estructura Recomendada del Entregable:**
   - **Sección 1: Introducción y Resumen Ejecutivo del Incremento 2.**
   - **Sección 2: Especificación Detallada de Requisitos Funcionales (Casos de Uso Consolidados 24 al 35).**
   - **Sección 3: Diagramas de Análisis y Diseño UML:**
     - Diagrama de Casos de Uso del Módulo de Cocina, Pedidos y Turnos de Caja.
     - Diagrama de Estado del Ciclo de Vida de un Pedido (`Pendiente` ➔ `En Preparación` ➔ `Listo` ➔ `Entregado` / `Cancelado`).
     - Diagrama de Componentes de la Integración entre Terminal POS, Base de Datos PostgreSQL y ERP SAP Business One.
   - **Sección 4: Pruebas y Evidencias de Verificación:** Capturas de pantalla de la pantalla KDS de cocina, boletas emitidas con folio y modal de auditoría de arqueo de cajas con sobrantes y faltantes.

