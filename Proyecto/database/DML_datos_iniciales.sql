-- ============================================================
-- ParkFlow - KidZania Santiago (Grupo 19)
-- DML: datos iniciales (roles, usuarios de prueba, 7 puestos de
-- venta, unidades, ubicaciones, proveedores, productos, lotes,
-- promociones, catalogos de motivos y turnos).
-- Ejecutar DESPUES de DDL_esquema_completo.sql, sobre una base vacia.
-- Uso: psql -U postgres -d kidzania_db -f DML_datos_iniciales.sql
-- ============================================================
--
-- PostgreSQL database dump
--

\restrict YJsjWm5fR4WdhSgJbzbONeBQ1fQ6DELqk8TfYKAdzomi6tULdkr95L4vycC0Aor

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: catalogo_motivo; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (1, 'CI-DEGUSTACION', 'Degustación o control de calidad', 'consumo_interno', 'Consumo interno autorizado para pruebas o control de calidad en cocina', 'activo', '2026-11-15 23:07:34.39421');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (2, 'CI-EVENTO', 'Actividad operativa interna del parque', 'consumo_interno', 'Uso en eventos internos o capacitación de personal KidZania', 'activo', '2026-11-15 23:07:34.396939');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (3, 'CI-DOTACION', 'Colación o consumo de dotación autorizada', 'consumo_interno', 'Consumo interno de personal con autorización de turno', 'activo', '2026-11-15 23:07:34.397276');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (4, 'DESC-EMPAQUE', 'Envase o empaque deteriorado', 'descarte', 'Descarte por rotura o daño en el envase primario', 'activo', '2026-11-15 23:07:34.397609');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (5, 'DESC-ESTANDAR', 'Incumplimiento de estándar visual/inocuidad', 'descarte', 'Producto descartado por no cumplir estándar operativo', 'activo', '2026-11-15 23:07:34.397968');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (6, 'DESC-RETIRO', 'Retiro preventivo de lote', 'descarte', 'Retiro de lote por instrucción de calidad o proveedor', 'activo', '2026-11-15 23:07:34.398497');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (7, 'MER-VENCIMIENTO', 'Vencimiento de fecha de caducidad', 'merma', 'Pérdida por cumplimiento de fecha de vencimiento del lote', 'activo', '2026-11-15 23:07:34.398839');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (8, 'MER-DERRAME', 'Derrame, caída o rotura accidental', 'merma', 'Pérdida accidental durante manipulación o almacenamiento', 'activo', '2026-11-15 23:07:34.399402');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (9, 'MER-PREPARACION', 'Error en preparación o cocción', 'merma', 'Desperdicio generado durante la elaboración en cocina', 'activo', '2026-11-15 23:07:34.399897');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (10, 'MER-CADENA-FRIO', 'Quiebre de cadena de frío o contaminación', 'merma', 'Pérdida por falla de refrigeración o contaminación cruzada', 'activo', '2026-11-15 23:07:34.40038');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (11, 'MER-OTRO', 'Otra pérdida operativa documentada', 'merma', 'Otra causa de merma debidamente justificada', 'activo', '2026-11-15 23:07:34.400789');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (12, 'AJU-CONTEO', 'Diferencia detectada en conteo físico', 'ajuste', 'Ajuste correctivo originado por toma de inventario o conteo físico', 'activo', '2026-11-15 23:07:34.401145');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (13, 'AJU-SOBRANTE', 'Sobrante verificado en bodega', 'ajuste', 'Ajuste positivo por hallazgo físico verificado en revisión de bodega', 'activo', '2026-11-15 23:07:34.401607');
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado, creado_en) VALUES (14, 'AJU-ERROR-REGISTRO', 'Corrección por error de digitación previo', 'ajuste', 'Ajuste administrativo documentado por corrección de registro', 'activo', '2026-11-15 23:07:34.401952');


--
-- Data for Name: categoria_producto; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado, creado_en) VALUES (1, 'Comida Preparada', 'Productos alimenticios elaborados para venta directa en puestos de comida', 'activo', '2026-11-15 23:07:34.389267');
INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado, creado_en) VALUES (2, 'Bebidas', 'Bebidas frías, jugos, néctares y calientes', 'activo', '2026-11-15 23:07:34.392276');
INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado, creado_en) VALUES (3, 'Insumos de Cocina', 'Materias primas e ingredientes base para recetas y elaboración', 'activo', '2026-11-15 23:07:34.392703');
INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado, creado_en) VALUES (4, 'Artículos de Merchandising', 'Recuerdos, disfraces, juguetes y artículos oficiales KidZania', 'activo', '2026-11-15 23:07:34.393123');
INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado, creado_en) VALUES (5, 'Snacks y Confitería', 'Snacks dulces, salados, helados y golosinas envasadas', 'activo', '2026-11-15 23:07:34.393605');


--
-- Data for Name: unidad_medida_personalizada; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (1, 'UN', 'Unidad Estándar', 'unidad', 'activo');
INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (2, 'KG', 'Kilogramo', 'masa', 'activo');
INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (3, 'LT', 'Litro', 'volumen', 'activo');
INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (4, 'POR', 'Porción Individual', 'contenedor', 'activo');
INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (5, 'G', 'Gramo', 'masa', 'activo');
INSERT INTO public.unidad_medida_personalizada (unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado) VALUES (6, 'ML', 'Mililitro', 'volumen', 'activo');


--
-- Data for Name: producto; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (1, 'COM-HOTDOG-01', 'Hot Dog Tradicional KidZania', 2500.00, 'Comida Preparada', 1, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 80.00, 15.00, NULL, true, false, NULL, true);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (2, 'COM-BEB-500', 'Bebida Néctar Frutal 500ml', 1500.00, 'Bebidas', 2, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 120.00, 20.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (3, 'COM-PIZZA-IND', 'Pizza Individual Mozzarella Artesanal', 3500.00, 'Comida Preparada', 1, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 50.00, 10.00, NULL, true, false, NULL, true);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (4, 'COM-MUFFIN-VAN', 'Muffin de Vainilla con Chispas de Chocolate', 1200.00, 'Comida Preparada', 1, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 65.00, 10.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (5, 'COM-CAFE-EXP', 'Café Expreso Grano Premium', 1800.00, 'Bebidas', 2, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 90.00, 15.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (6, 'COM-COMBO-FELIZ', 'Combo Al Paso (Hot Dog + Bebida + Snack)', 4500.00, 'Comida Preparada', 1, 'comida', 'lote', 'activo', NULL, NULL, NULL, 1, 40.00, 10.00, NULL, true, false, NULL, true);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (7, 'MER-POLERA-01', 'Polera Oficial KidZania Santiago (Talla 8-12)', 12990.00, 'Artículos de Merchandising', 4, 'merch', 'lote', 'activo', NULL, NULL, NULL, 1, 45.00, 8.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (8, 'MER-PELUCHE-URB', 'Peluche Urbano KidZania 30cm', 9990.00, 'Artículos de Merchandising', 4, 'merch', 'lote', 'activo', NULL, NULL, NULL, 1, 35.00, 6.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (9, 'MER-PASAPORTE-BKZ', 'Pasaporte Ciudadano B-KidZanian Oficial', 4990.00, 'Artículos de Merchandising', 4, 'merch', 'lote', 'activo', NULL, NULL, NULL, 1, 150.00, 25.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (10, 'MER-MOCHILA-EXP', 'Mochila Infantil KidZania Explorer', 14990.00, 'Artículos de Merchandising', 4, 'merch', 'lote', 'activo', NULL, NULL, NULL, 1, 28.00, 5.00, NULL, true, false, NULL, false);
INSERT INTO public.producto (producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria, categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado, producto_motivo_baja, producto_fecha_baja, producto_actualizado_en, producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo, alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina) VALUES (11, 'MER-STICKERS-SET', 'Set de Stickers y Pines Coleccionables', 1990.00, 'Artículos de Merchandising', 4, 'merch', 'lote', 'activo', NULL, NULL, NULL, 1, 100.00, 20.00, NULL, true, false, NULL, false);


--
-- Data for Name: insumo; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: proveedor; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.proveedor (proveedor_id, proveedor_rut, proveedor_nombre, proveedor_nombre_contacto, proveedor_telefono_contacto, proveedor_correo_contacto, proveedor_condiciones_comerciales, proveedor_plazo_pago, proveedor_modalidad_entrega, proveedor_estado, proveedor_actualizado_en, lote_id) VALUES (1, '76.123.456-7', 'CCU Bebidas Chile S.A.', 'Cristián Labbé', '+56 9 8765 4321', 'ventas@ccu.cl', 'Facturación 30 días', '30 días', 'Despacho directo en parque', 'activo', NULL, NULL);
INSERT INTO public.proveedor (proveedor_id, proveedor_rut, proveedor_nombre, proveedor_nombre_contacto, proveedor_telefono_contacto, proveedor_correo_contacto, proveedor_condiciones_comerciales, proveedor_plazo_pago, proveedor_modalidad_entrega, proveedor_estado, proveedor_actualizado_en, lote_id) VALUES (2, '77.987.654-3', 'Panificadora Ideal S.A.', 'Marcela Soto', '+56 9 7654 3210', 'pedidos@ideal.cl', 'Contado comercial', '15 días', 'Entrega matutina diaria', 'activo', NULL, NULL);
INSERT INTO public.proveedor (proveedor_id, proveedor_rut, proveedor_nombre, proveedor_nombre_contacto, proveedor_telefono_contacto, proveedor_correo_contacto, proveedor_condiciones_comerciales, proveedor_plazo_pago, proveedor_modalidad_entrega, proveedor_estado, proveedor_actualizado_en, lote_id) VALUES (3, '78.345.678-9', 'KidZania Merchandising SpA', 'Roberto Silva', '+56 9 6543 2109', 'contacto@kzmerch.cl', 'Distribución autorizada', '45 días', 'Despacho consolidado quincenal', 'activo', NULL, NULL);


--
-- Data for Name: rol; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.rol (rol_id, rol_nombre) VALUES (1, 'admin');
INSERT INTO public.rol (rol_id, rol_nombre) VALUES (2, 'operador_inventario');
INSERT INTO public.rol (rol_id, rol_nombre) VALUES (3, 'encargado_rrhh');
INSERT INTO public.rol (rol_id, rol_nombre) VALUES (4, 'supervisor');
INSERT INTO public.rol (rol_id, rol_nombre) VALUES (5, 'caja');
INSERT INTO public.rol (rol_id, rol_nombre) VALUES (6, 'cocina');


--
-- Data for Name: ubicacion_bodega; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ubicacion_bodega (ubicacion_id, ubicacion_codigo, ubicacion_nombre, ubicacion_tipo, ubicacion_padre_id, ubicacion_estado) VALUES (1, 'BOD-GEN', 'Bodega General Central', 'zona', NULL, 'activo');
INSERT INTO public.ubicacion_bodega (ubicacion_id, ubicacion_codigo, ubicacion_nombre, ubicacion_tipo, ubicacion_padre_id, ubicacion_estado) VALUES (2, 'BOD-ALIM', 'Bodega Alimentos y Bebidas', 'estante', NULL, 'activo');
INSERT INTO public.ubicacion_bodega (ubicacion_id, ubicacion_codigo, ubicacion_nombre, ubicacion_tipo, ubicacion_padre_id, ubicacion_estado) VALUES (3, 'BOD-MERCH', 'Bodega Souvenirs y Merchandising', 'estante', NULL, 'activo');


--
-- Data for Name: usuario; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (1, '12345678-9', 'González', 'López', 'Carlos', 'carlos@kidzania.cl', 'activo', '$2b$10$ft8viGD0Tv3ee3l4t4tqw.uNj5jdsq5.JrRb7BOa/GsMda.8hhOqG', 1, NULL, 0, false, NULL);
INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (2, '15432198-7', 'Martínez', 'Soto', 'Ana', 'inventario@kidzania.cl', 'activo', '$2b$10$A.n173HfPlaiQ/0211dLOuk5CDIKuB1P0qvUk5W.rcSNvxkXompA2', 2, NULL, 0, false, NULL);
INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (3, '16543210-K', 'Ramírez', 'Vega', 'Pedro', 'rrhh@kidzania.cl', 'activo', '$2b$10$v378/ocEvQOOJLiVvWHK/u3JaPOqTBJuzziYgPg7EQLo8pk0E1VN.', 3, NULL, 0, false, NULL);
INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (4, '17654321-1', 'Valdés', 'Pinto', 'Laura', 'supervisor@kidzania.cl', 'activo', '$2b$10$BryQOEmj3ohRGOFeGDk3OuvOxABshe53GgLecmGmv.8Xg.xsbtE5.', 4, NULL, 0, false, NULL);
INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (5, '18765432-2', 'Rojas', 'Díaz', 'Sofía', 'sofia.rojas@kidzania.cl', 'activo', '$2b$10$VH4C0dtOSPeXOL.8NvU73u.NUpGrRmntayCsxcb2D5VV9lbNY0Qtq', 5, '$2b$10$yIE9DqSZOWT.m83MZw52nuwECAavwN8e/gsODariSjwnRvETCfmTG', 0, false, '2026-11-15 23:07:34.85408');
INSERT INTO public.usuario (usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno, usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena, rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en) VALUES (6, '19876543-3', 'Morales', 'Silva', 'Matías', 'matias.morales@kidzania.cl', 'activo', '$2b$10$zI7rNQpPjQPyxxiIZX7D.OjcvNN7Rq8CIIqGB1CXlgrdQgdd.FeQm', 6, '$2b$10$K1Ui/bqjZnA6MMeybhor4u99LiKJVcDOxjsdhFPuRDaEKsNhXzCJi', 0, false, '2026-11-15 23:07:34.997582');


--
-- Data for Name: lote; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (1, 'LOT-COM-HOTDOG-01-01', 80.00, 80.00, 1250.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 1, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (2, 'LOT-COM-BEB-500-01', 120.00, 120.00, 750.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 2, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (3, 'LOT-COM-PIZZA-IND-01', 50.00, 50.00, 1750.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 3, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (4, 'LOT-COM-MUFFIN-VAN-01', 65.00, 65.00, 600.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 4, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (5, 'LOT-COM-CAFE-EXP-01', 90.00, 90.00, 900.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 5, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (6, 'LOT-COM-COMBO-FELIZ-01', 40.00, 40.00, 2250.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 6, 1, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (7, 'LOT-MER-POLERA-01-01', 45.00, 45.00, 6495.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 7, 3, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (8, 'LOT-MER-PELUCHE-URB-01', 35.00, 35.00, 4995.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 8, 3, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (9, 'LOT-MER-PASAPORTE-BKZ-01', 150.00, 150.00, 2495.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 9, 3, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (10, 'LOT-MER-MOCHILA-EXP-01', 28.00, 28.00, 7495.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 10, 3, 1, NULL, 2);
INSERT INTO public.lote (lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion, lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id, ubicacion_id, insumo_id, responsable_recepcion_id) VALUES (11, 'LOT-MER-STICKERS-SET-01', 100.00, 100.00, 995.00, 'GUIA-INICIAL-KZ', 'conforme', '2026-11-15', '2027-05-14', 11, 3, 1, NULL, 2);


--
-- Data for Name: conteo_fisico; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: movimiento_stock; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ajuste_inventario; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auditoria_producto; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: bitacora_auditoria; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: puesto_venta; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (1, 'PUESTO-COM-01', 'Cafetería Vita', 'comida', 'Plaza Central', 'Puesto de cafetería, pastelería, snacks y bebidas calientes/frías', 'activo', '2026-11-15 23:07:34.402431', '2026-11-15 23:07:34.402431');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (2, 'PUESTO-COM-02', 'Restaurante La Plaza', 'comida', 'Sector Gastronómico Principal', 'Restaurante principal de pizzas, menús y platos preparados', 'activo', '2026-11-15 23:07:34.406688', '2026-11-15 23:07:34.406688');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (3, 'PUESTO-COM-03', 'Al Paso', 'comida', 'Avenida Principal', 'Punto de comida rápida, hot dogs, empanadas y bebidas al paso', 'activo', '2026-11-15 23:07:34.407105', '2026-11-15 23:07:34.407105');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (4, 'PUESTO-COM-04', 'Dulcería', 'comida', 'Boulevard Norte', 'Puesto de confites, palomitas, helados y golosinas de consumo inmediato', 'activo', '2026-11-15 23:07:34.407479', '2026-11-15 23:07:34.407479');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (5, 'PUESTO-MER-01', 'Candy Corner', 'merch', 'Sector Dulces y Souvenirs', 'Tienda de recuerdos dulces empaquetados y artículos coleccionables', 'activo', '2026-11-15 23:07:34.407855', '2026-11-15 23:07:34.407855');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (6, 'PUESTO-MER-02', 'BKidZanian', 'merch', 'Plaza Ciudadana', 'Punto oficial del programa ciudadano BKidZanian y accesorios exclusivos', 'activo', '2026-11-15 23:07:34.408275', '2026-11-15 23:07:34.408275');
INSERT INTO public.puesto_venta (puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado, creado_en, actualizado_en) VALUES (7, 'PUESTO-MER-03', 'National Store', 'merch', 'Salida Principal / Tienda Oficial', 'Tienda principal de merchandising oficial, juguetes, poleras y souvenirs KidZania', 'activo', '2026-11-15 23:07:34.40869', '2026-11-15 23:07:34.40869');


--
-- Data for Name: caja_sesion; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: venta_pos; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: boleta_electronica; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: configuracion_sistema; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: merma; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: mesa; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pedido_comanda; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pedido_comanda_detalle; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: pedido_incidencia; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: producto_proveedor; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (1, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (2, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (3, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (4, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (5, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (6, 1, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (7, 3, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (8, 3, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (9, 3, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (10, 3, '2026-11-15', 'activo');
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES (11, 3, '2026-11-15', 'activo');


--
-- Data for Name: promocion; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.promocion (promocion_id, promocion_codigo, promocion_nombre, promocion_descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, es_acumulable, aplica_a, categoria_id, monto_minimo_compra, estado, creado_en, actualizado_en) VALUES (1, 'PROMO-KIDZ10', '10% Descuento Temporada Escolar', '10% de descuento directo sobre el total de la compra en cualquier puesto', 'porcentaje', 10.00, '2026-11-14 23:07:35.04871', '2027-11-15 23:07:35.04871', false, 'total_venta', NULL, 3000.00, 'activo', '2026-11-15 23:07:35.04871', '2026-11-15 23:07:35.04871');
INSERT INTO public.promocion (promocion_id, promocion_codigo, promocion_nombre, promocion_descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, es_acumulable, aplica_a, categoria_id, monto_minimo_compra, estado, creado_en, actualizado_en) VALUES (2, 'PROMO-MERCH20', '20% Descuento Souvenirs y Merchandising', '20% de descuento en artículos de merchandising oficial', 'porcentaje', 20.00, '2026-11-14 23:07:35.053982', '2027-11-15 23:07:35.053982', false, 'categoria', 4, 5000.00, 'activo', '2026-11-15 23:07:35.053982', '2026-11-15 23:07:35.053982');
INSERT INTO public.promocion (promocion_id, promocion_codigo, promocion_nombre, promocion_descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, es_acumulable, aplica_a, categoria_id, monto_minimo_compra, estado, creado_en, actualizado_en) VALUES (3, 'PROMO-COMBO-DESC', 'Descuento Fijo $500 Almuerzo Feliz', '$500 de descuento en ventas gastronómicas sobre $4.000', 'monto_fijo', 500.00, '2026-11-14 23:07:35.055459', '2027-11-15 23:07:35.055459', false, 'total_venta', NULL, 4000.00, 'activo', '2026-11-15 23:07:35.055459', '2026-11-15 23:07:35.055459');


--
-- Data for Name: promocion_producto; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: receta; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: turno_planificado; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.turno_planificado (turno_id, usuario_id, puesto_id, fecha_turno, hora_inicio_programada, hora_fin_programada, tolerancia_minutos, observaciones, estado_turno, creado_en) VALUES (1, 5, 1, '2026-11-15', '09:00:00', '17:00:00', 15, 'Turno matutino de atención caja', 'en_curso', '2026-11-15 23:07:35.05986');
INSERT INTO public.turno_planificado (turno_id, usuario_id, puesto_id, fecha_turno, hora_inicio_programada, hora_fin_programada, tolerancia_minutos, observaciones, estado_turno, creado_en) VALUES (2, 6, 2, '2026-11-15', '09:00:00', '17:00:00', 15, 'Turno de cocina y preparación comensales', 'en_curso', '2026-11-15 23:07:35.06851');


--
-- Data for Name: registro_asistencia; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.registro_asistencia (asistencia_id, usuario_id, turno_id, puesto_id, fecha, hora_entrada, hora_salida, estado_asistencia, minutos_atraso, es_inconsistente, tipo_inconsistencia, observaciones, creado_en) VALUES (1, 5, 1, 1, '2026-11-15', '2026-11-15 08:55:00', NULL, 'presente', 0, false, NULL, 'Marcaje de entrada puntual reloj control', '2026-11-15 23:07:35.06347');
INSERT INTO public.registro_asistencia (asistencia_id, usuario_id, turno_id, puesto_id, fecha, hora_entrada, hora_salida, estado_asistencia, minutos_atraso, es_inconsistente, tipo_inconsistencia, observaciones, creado_en) VALUES (2, 6, 2, 2, '2026-11-15', '2026-11-15 09:18:00', NULL, 'atraso', 18, false, NULL, 'Marcaje con retraso leve (18 min)', '2026-11-15 23:07:35.069486');


--
-- Data for Name: sap_sincronizacion_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: transferencia_interna; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: venta_pos_detalle; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: venta_pos_pago; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: ajuste_inventario_ajuste_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ajuste_inventario_ajuste_id_seq', 1, false);


--
-- Name: auditoria_producto_auditoria_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auditoria_producto_auditoria_producto_id_seq', 1, false);


--
-- Name: bitacora_auditoria_auditoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bitacora_auditoria_auditoria_id_seq', 1, false);


--
-- Name: boleta_electronica_boleta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.boleta_electronica_boleta_id_seq', 1, false);


--
-- Name: caja_sesion_caja_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.caja_sesion_caja_id_seq', 1, false);


--
-- Name: catalogo_motivo_motivo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.catalogo_motivo_motivo_id_seq', 14, true);


--
-- Name: categoria_producto_categoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categoria_producto_categoria_id_seq', 5, true);


--
-- Name: conteo_fisico_conteo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conteo_fisico_conteo_id_seq', 1, false);


--
-- Name: insumo_insumo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.insumo_insumo_id_seq', 1, false);


--
-- Name: lote_lote_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lote_lote_id_seq', 11, true);


--
-- Name: merma_merma_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.merma_merma_id_seq', 1, false);


--
-- Name: mesa_mesa_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mesa_mesa_id_seq', 1, false);


--
-- Name: movimiento_stock_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.movimiento_stock_movimiento_id_seq', 1, false);


--
-- Name: pedido_comanda_detalle_detalle_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_comanda_detalle_detalle_id_seq', 1, false);


--
-- Name: pedido_comanda_pedido_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_comanda_pedido_id_seq', 1, false);


--
-- Name: pedido_incidencia_incidencia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_incidencia_incidencia_id_seq', 1, false);


--
-- Name: producto_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.producto_producto_id_seq', 11, true);


--
-- Name: promocion_promocion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promocion_promocion_id_seq', 3, true);


--
-- Name: proveedor_proveedor_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.proveedor_proveedor_id_seq', 3, true);


--
-- Name: puesto_venta_puesto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.puesto_venta_puesto_id_seq', 7, true);


--
-- Name: receta_receta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.receta_receta_id_seq', 1, false);


--
-- Name: registro_asistencia_asistencia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.registro_asistencia_asistencia_id_seq', 2, true);


--
-- Name: rol_rol_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rol_rol_id_seq', 6, true);


--
-- Name: sap_sincronizacion_log_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sap_sincronizacion_log_log_id_seq', 1, false);


--
-- Name: transferencia_interna_transferencia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transferencia_interna_transferencia_id_seq', 1, false);


--
-- Name: turno_planificado_turno_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.turno_planificado_turno_id_seq', 2, true);


--
-- Name: ubicacion_bodega_ubicacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ubicacion_bodega_ubicacion_id_seq', 3, true);


--
-- Name: unidad_medida_personalizada_unidad_medida_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.unidad_medida_personalizada_unidad_medida_id_seq', 6, true);


--
-- Name: usuario_usuario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.usuario_usuario_id_seq', 6, true);


--
-- Name: venta_pos_detalle_detalle_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.venta_pos_detalle_detalle_id_seq', 1, false);


--
-- Name: venta_pos_pago_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.venta_pos_pago_pago_id_seq', 1, false);


--
-- Name: venta_pos_venta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.venta_pos_venta_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict YJsjWm5fR4WdhSgJbzbONeBQ1fQ6DELqk8TfYKAdzomi6tULdkr95L4vycC0Aor

