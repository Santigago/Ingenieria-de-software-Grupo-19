-- =============================================================================
-- ParkFlow - KidZania Santiago
-- Script DML: Datos Iniciales y Siembra de Demostración
-- =============================================================================

-- 1. Roles del Sistema
INSERT INTO public.rol (rol_id, rol_nombre) VALUES
    (1, 'admin'),
    (2, 'operador_inventario'),
    (3, 'encargado_rrhh'),
    (4, 'supervisor'),
    (5, 'caja'),
    (6, 'cocina')
ON CONFLICT (rol_nombre) DO NOTHING;
SELECT setval('public.rol_rol_id_seq', COALESCE((SELECT MAX(rol_id) FROM public.rol), 1));

-- 2. Usuarios Base
INSERT INTO public.usuario (
    usuario_id, usuario_run, usuario_apellido_paterno, usuario_apellido_materno,
    usuario_nombres, usuario_correo, usuario_estado_cuenta, usuario_contrasena,
    rol_id, usuario_pin_hash, usuario_intentos_pin, usuario_pin_bloqueado, usuario_pin_actualizado_en
) VALUES
    (1, '12345678-9', 'González', 'López', 'Carlos', 'carlos@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 1, NULL, 0, false, NULL),
    (2, '15432198-7', 'Martínez', 'Soto', 'Ana', 'inventario@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 2, NULL, 0, false, NULL),
    (3, '16543210-K', 'Ramírez', 'Vega', 'Pedro', 'rrhh@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 3, NULL, 0, false, NULL),
    (4, '17654321-1', 'Valdés', 'Pinto', 'Laura', 'supervisor@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 4, NULL, 0, false, NULL),
    (5, '18765432-2', 'Rojas', 'Díaz', 'Sofía', 'sofia.rojas@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 5, '$2b$10$xtXURLTXl2O2CUWtS./TbODf4eYDsEgPmC4caN5OVVwDo4eU4hvAy', 0, false, now()),
    (6, '19876543-3', 'Morales', 'Silva', 'Matías', 'matias.morales@kidzania.cl', 'activo', '$2b$10$qUHGDlgflHoog8KckNrFSeuQi12GRZRqqYy/9MChkXnH2pYiP258m', 6, '$2b$10$wmWvC6V3.fBjGq7XXNmqt.qfcPcmSeHoqZ7uBjLUKVhvRbixA10Eu', 0, false, now())
ON CONFLICT (usuario_correo) DO UPDATE
SET usuario_contrasena = EXCLUDED.usuario_contrasena,
    usuario_pin_hash = EXCLUDED.usuario_pin_hash;
SELECT setval('public.usuario_usuario_id_seq', COALESCE((SELECT MAX(usuario_id) FROM public.usuario), 1));

-- 3. Unidades de Medida
INSERT INTO public.unidad_medida_personalizada (
    unidad_medida_id, unidad_medida_codigo, unidad_medida_nombre, unidad_medida_clasificacion, unidad_medida_estado
) VALUES
    (1, 'UNID', 'Unidad', 'unidades', 'activo'),
    (2, 'KG', 'Kilogramo', 'masa', 'activo'),
    (3, 'GR', 'Gramo', 'masa', 'activo'),
    (4, 'LT', 'Litro', 'volumen', 'activo'),
    (5, 'ML', 'Mililitro', 'volumen', 'activo'),
    (6, 'PACK', 'Pack / Caja', 'unidades', 'activo')
ON CONFLICT (unidad_medida_codigo) DO NOTHING;
SELECT setval('public.unidad_medida_personalizada_unidad_medida_id_seq', COALESCE((SELECT MAX(unidad_medida_id) FROM public.unidad_medida_personalizada), 1));

-- 4. Ubicaciones Físicas de Bodega
INSERT INTO public.ubicacion_bodega (
    ubicacion_id, ubicacion_codigo, ubicacion_nombre, ubicacion_tipo, ubicacion_estado
) VALUES
    (1, 'BCD-01', 'Bodega Central Distribución', 'almacen', 'activo'),
    (2, 'BPV-01', 'Bodega Puestos de Venta', 'pasillo', 'activo'),
    (3, 'CAM-01', 'Cámara de Frío Alimentos', 'estante', 'activo')
ON CONFLICT (ubicacion_codigo) DO NOTHING;
SELECT setval('public.ubicacion_bodega_ubicacion_id_seq', COALESCE((SELECT MAX(ubicacion_id) FROM public.ubicacion_bodega), 1));

-- 5. Proveedores Oficiales
INSERT INTO public.proveedor (
    proveedor_id, proveedor_rut, proveedor_nombre, proveedor_nombre_contacto,
    proveedor_telefono_contacto, proveedor_correo_contacto, proveedor_condiciones_comerciales,
    proveedor_plazo_pago, proveedor_modalidad_entrega, proveedor_estado
) VALUES
    (1, '76123456-7', 'Distribuidora Alimentos Chile S.A.', 'Rodrigo Fuentes', '+56 9 8765 4321', 'contacto@alimentoschile.cl', 'Despacho semanal programado con reposición rápida', '30 días', 'Despacho directo a bodega', 'activo'),
    (2, '77654321-0', 'Merchandising y Juguetes KidZania Spa', 'Marcela Peña', '+56 9 7654 3210', 'ventas@merchkidzania.cl', 'Facturación quincenal contra recepción conforme', '15 días', 'Entrega centralizada', 'activo'),
    (3, '78901234-5', 'Bebidas Embotelladora Metropolitana', 'Ignacio Soto', '+56 9 6543 2109', 'isoto@embotelladora.cl', 'Crédito a 45 días con stock de seguridad garantizado', '45 días', 'Despacho dos veces por semana', 'activo')
ON CONFLICT (proveedor_rut) DO NOTHING;
SELECT setval('public.proveedor_proveedor_id_seq', COALESCE((SELECT MAX(proveedor_id) FROM public.proveedor), 1));

-- 6. Categorías de Producto
INSERT INTO public.categoria_producto (categoria_id, categoria_nombre, categoria_descripcion, categoria_estado) VALUES
    (1, 'Alimentos Preparados', 'Comidas preparadas calientes y frías', 'activo'),
    (2, 'Bebidas y Jugos', 'Bebidas gaseosas, aguas y jugos naturales', 'activo'),
    (3, 'Snacks y Dulces', 'Snacks envasados, chocolates y confitería', 'activo'),
    (4, 'Souvenirs y Merchandising', 'Poleras, gorros, peluches y recuerdos oficiales', 'activo'),
    (5, 'Juguetes Educativos', 'Juegos didácticos y accesorios de profesiones', 'activo')
ON CONFLICT (categoria_nombre) DO NOTHING;
SELECT setval('public.categoria_producto_categoria_id_seq', COALESCE((SELECT MAX(categoria_id) FROM public.categoria_producto), 1));

-- 7. Catálogo Oficial de Motivos
INSERT INTO public.catalogo_motivo (motivo_id, motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado) VALUES
    (1, 'SAL-VENTA-01', 'Salida por Venta Directa', 'salida', 'Salida originada por comprobante de venta POS', 'activo'),
    (2, 'SAL-DEG-01', 'Salida por Degustación Promocional', 'salida', 'Entrega gratuita para degustación o muestra a clientes', 'activo'),
    (3, 'MER-VENC-01', 'Merma por Vencimiento de Lote', 'merma', 'Producto perecible que alcanzó su fecha de vencimiento', 'activo'),
    (4, 'MER-DAN-01', 'Merma por Deterioro o Daño Físico', 'merma', 'Embalaje roto, golpe o rotura en manipulación', 'activo'),
    (5, 'MER-DER-01', 'Merma por Derrame Accidental', 'merma', 'Líquido o preparado derramado en operación', 'activo'),
    (6, 'AJU-POS-01', 'Ajuste Físico Faltante', 'ajuste', 'Diferencia negativa detectada en conteo cíclico', 'activo'),
    (7, 'AJU-POS-02', 'Ajuste Físico Sobrante', 'ajuste', 'Diferencia positiva detectada en inventario general', 'activo'),
    (8, 'AJU-CORR-01', 'Ajuste por Corrección de Digitacion', 'ajuste', 'Rectificación autorizada de error operativo previo', 'activo'),
    (9, 'CON-PER-01', 'Consumo Interno Colaboradores', 'consumo_interno', 'Ración de alimentación diaria autorizada para personal', 'activo'),
    (10, 'CON-CAP-01', 'Consumo Interno Capacitación', 'consumo_interno', 'Uso de insumos en entrenamiento de nuevos cajeros/cocina', 'activo'),
    (11, 'DES-FALL-01', 'Descarte por Falla de Fabricación', 'descarte', 'Producto no conforme devuelto o apartado para descarte', 'activo'),
    (12, 'DES-CONT-01', 'Descarte por Contaminación Cruzada', 'descarte', 'Insumo alimenticio descartado por inocuidad sanitaria', 'activo'),
    (13, 'SAL-PROMO-01', 'Salida por Campaña Comercial', 'salida', 'Entrega de producto asociada a cupón o promoción corporativa', 'activo'),
    (14, 'MER-ROBO-01', 'Merma por Pérdida No Identificada', 'merma', 'Diferencia no atribuible a merma operativa', 'activo')
ON CONFLICT (motivo_codigo) DO NOTHING;
SELECT setval('public.catalogo_motivo_motivo_id_seq', COALESCE((SELECT MAX(motivo_id) FROM public.catalogo_motivo), 1));

-- 8. Puestos de Venta Oficiales
INSERT INTO public.puesto_venta (
    puesto_id, puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado
) VALUES
    (1, 'PUESTO-COM-01', 'Cafetería Central Plaza', 'comida', 'Plaza Principal Frente a Teatro', 'Cafetería principal con café, pasteles, sándwiches y bebidas', 'activo'),
    (2, 'PUESTO-COM-02', 'Kiosco Pizzas y Snacks', 'comida', 'Sector Barrio Urbano', 'Kiosco express de pizzas porciones y bocadillos calientes', 'activo'),
    (3, 'PUESTO-COM-03', 'Heladería Vita', 'comida', 'Avenida Central Esquina Bomberos', 'Puesto especializado en helados artesanales y postres fríos', 'activo'),
    (4, 'PUESTO-MER-01', 'Tienda Souvenirs Principal', 'merch', 'Acceso Principal y Salida de Visitantes', 'Tienda insignia de regalos, juguetes y recuerdos de KidZania', 'activo'),
    (5, 'PUESTO-MER-02', 'Módulo Urbano KidZania', 'merch', 'Paseo de las Profesiones', 'Módulo de venta rápida de merchandising temático infantil', 'activo'),
    (6, 'PUESTO-COM-04', 'Stand Hamburguesas Gourmet', 'comida', 'Patio de Comidas Nivel 2', 'Stand de comida rápida con hamburguesas y combos familiares', 'activo'),
    (7, 'PUESTO-MER-03', 'Kiosco Fotografía y Recuerdos', 'merch', 'Zona Fotográfica Central', 'Venta de fotos impresas con marco temático y accesorios de visita', 'activo')
ON CONFLICT (puesto_codigo) DO NOTHING;
SELECT setval('public.puesto_venta_puesto_id_seq', COALESCE((SELECT MAX(puesto_id) FROM public.puesto_venta), 1));

-- 9. Catálogo de Productos
INSERT INTO public.producto (
    producto_id, producto_codigo, producto_nombre, producto_precio, producto_categoria,
    categoria_id, producto_tipo_negocio, producto_tipo_control_stock, producto_estado,
    producto_unidad_medida_id, producto_stock_actual, producto_stock_minimo, producto_stock_maximo,
    alerta_canal_sistema, alerta_canal_correo, alerta_correo_destino, requiere_cocina
) VALUES
    (1, 'PROD-HAMB-01', 'Hamburguesa KidZania Clásica', 4990.00, 'Alimentos Preparados', 1, 'comida', 'lote', 'activo', 1, 45.00, 10.00, 200.00, true, false, NULL, true),
    (2, 'PROD-PIZ-01', 'Porción Pizza Margherita', 3500.00, 'Alimentos Preparados', 1, 'comida', 'lote', 'activo', 1, 60.00, 15.00, 250.00, true, false, NULL, true),
    (3, 'PROD-PAP-01', 'Papas Fritas Medianas', 2200.00, 'Alimentos Preparados', 1, 'comida', 'lote', 'activo', 1, 80.00, 20.00, 300.00, true, false, NULL, true),
    (4, 'PROD-BEB-01', 'Bebida 500ml Variedades', 1800.00, 'Bebidas y Jugos', 2, 'comida', 'lote', 'activo', 1, 120.00, 30.00, 400.00, true, false, NULL, false),
    (5, 'PROD-JUG-01', 'Jugo Natural Naranja 400ml', 2400.00, 'Bebidas y Jugos', 2, 'comida', 'lote', 'activo', 1, 50.00, 15.00, 200.00, true, false, NULL, false),
    (6, 'PROD-HEL-01', 'Helado Artesanal Doble', 2900.00, 'Alimentos Preparados', 1, 'comida', 'lote', 'activo', 1, 40.00, 10.00, 150.00, true, false, NULL, false),
    (7, 'PROD-GAL-01', 'Galleta Chispas Chocolate', 1200.00, 'Snacks y Dulces', 3, 'comida', 'lote', 'activo', 1, 95.00, 25.00, 350.00, true, false, NULL, false),
    (8, 'PROD-POL-01', 'Polera Oficial KidZania Infantil', 12990.00, 'Souvenirs y Merchandising', 4, 'merch', 'lote', 'activo', 1, 70.00, 10.00, 150.00, true, false, NULL, false),
    (9, 'PROD-GOR-01', 'Gorro Urbano KidZania', 7990.00, 'Souvenirs y Merchandising', 4, 'merch', 'lote', 'activo', 1, 85.00, 15.00, 180.00, true, false, NULL, false),
    (10, 'PROD-PEL-01', 'Peluche Mascota Urbano', 14990.00, 'Souvenirs y Merchandising', 4, 'merch', 'lote', 'activo', 1, 38.00, 8.00, 100.00, true, false, NULL, false),
    (11, 'PROD-JUG-BOM', 'Set Didáctico Bombero Infantil', 16990.00, 'Juguetes Educativos', 5, 'merch', 'lote', 'activo', 1, 120.00, 12.00, 160.00, true, false, NULL, false)
ON CONFLICT (producto_codigo) DO NOTHING;
SELECT setval('public.producto_producto_id_seq', COALESCE((SELECT MAX(producto_id) FROM public.producto), 1));

-- 10. Relación Producto - Proveedor
INSERT INTO public.producto_proveedor (producto_id, proveedor_id, fecha_asociacion, estado) VALUES
    (1, 1, CURRENT_DATE, 'activo'),
    (2, 1, CURRENT_DATE, 'activo'),
    (3, 1, CURRENT_DATE, 'activo'),
    (4, 3, CURRENT_DATE, 'activo'),
    (5, 1, CURRENT_DATE, 'activo'),
    (6, 1, CURRENT_DATE, 'activo'),
    (7, 1, CURRENT_DATE, 'activo'),
    (8, 2, CURRENT_DATE, 'activo'),
    (9, 2, CURRENT_DATE, 'activo'),
    (10, 2, CURRENT_DATE, 'activo'),
    (11, 2, CURRENT_DATE, 'activo')
ON CONFLICT (producto_id, proveedor_id) DO NOTHING;

-- 11. Lotes de Inventario Inicial
INSERT INTO public.lote (
    lote_id, lote_codigo, lote_cantidad_ingresada, lote_cantidad_disponible,
    lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion,
    lote_fecha_recepcion, lote_fecha_vencimiento, producto_id, proveedor_id,
    ubicacion_id, responsable_recepcion_id
) VALUES
    (1, 'LOT-HAMB-001', 50.00, 45.00, 2100.00, 'FAC-100234', 'aprobado', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '25 days', 1, 1, 3, 2),
    (2, 'LOT-PIZ-001', 70.00, 60.00, 1400.00, 'FAC-100234', 'aprobado', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '18 days', 2, 1, 3, 2),
    (3, 'LOT-PAP-001', 90.00, 80.00, 850.00, 'FAC-100234', 'aprobado', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '45 days', 3, 1, 1, 2),
    (4, 'LOT-BEB-001', 130.00, 120.00, 720.00, 'FAC-883921', 'aprobado', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '180 days', 4, 3, 1, 2),
    (5, 'LOT-JUG-001', 55.00, 50.00, 980.00, 'FAC-100235', 'aprobado', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '12 days', 5, 1, 3, 2),
    (6, 'LOT-HEL-001', 45.00, 40.00, 1100.00, 'FAC-100235', 'aprobado', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', 6, 1, 3, 2),
    (7, 'LOT-GAL-001', 100.00, 95.00, 450.00, 'FAC-100235', 'aprobado', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '60 days', 7, 1, 1, 2),
    (8, 'LOT-POL-001', 70.00, 70.00, 5200.00, 'FAC-554410', 'aprobado', CURRENT_DATE - INTERVAL '5 days', NULL, 8, 2, 2, 2),
    (9, 'LOT-GOR-001', 85.00, 85.00, 3100.00, 'FAC-554410', 'aprobado', CURRENT_DATE - INTERVAL '5 days', NULL, 9, 2, 2, 2),
    (10, 'LOT-PEL-001', 38.00, 38.00, 6800.00, 'FAC-554411', 'aprobado', CURRENT_DATE - INTERVAL '4 days', NULL, 10, 2, 2, 2),
    (11, 'LOT-BOM-001', 120.00, 120.00, 7400.00, 'FAC-554411', 'aprobado', CURRENT_DATE - INTERVAL '4 days', NULL, 11, 2, 2, 2)
ON CONFLICT (lote_codigo) DO NOTHING;
SELECT setval('public.lote_lote_id_seq', COALESCE((SELECT MAX(lote_id) FROM public.lote), 1));

-- 12. Promociones Comerciales
INSERT INTO public.promocion (
    promocion_id, promocion_codigo, promocion_nombre, promocion_descripcion,
    tipo_descuento, valor_descuento, es_acumulable, aplica_a, categoria_id,
    monto_minimo_compra, estado, fecha_inicio, fecha_fin
) VALUES
    (1, 'DESC10', '10% Descuento Global', 'Descuento general para visitantes en todo el parque', 'porcentaje', 10.00, false, 'total', NULL, 0.00, 'activo', now() - INTERVAL '1 day', now() + INTERVAL '1 year'),
    (2, 'KIDZ500', '00 Descuento en Snack', 'Descuento fijo para colaciones y galletas', 'monto_fijo', 500.00, true, 'categoria', 3, 2000.00, 'activo', now() - INTERVAL '1 day', now() + INTERVAL '1 year'),
    (3, 'MERCH15', '15% Descuento Souvenirs', 'Promoción oficial en compras de la tienda', 'porcentaje', 15.00, false, 'categoria', 4, 10000.00, 'activo', now() - INTERVAL '1 day', now() + INTERVAL '1 year')
ON CONFLICT (promocion_codigo) DO NOTHING;
SELECT setval('public.promocion_promocion_id_seq', COALESCE((SELECT MAX(promocion_id) FROM public.promocion), 1));

-- 13. Turnos Planificados y Asistencia
INSERT INTO public.turno_planificado (
    turno_id, usuario_id, puesto_id, fecha_turno, hora_inicio_programada, hora_fin_programada,
    tolerancia_minutos, observaciones, estado_turno
) VALUES
    (1, 5, 1, CURRENT_DATE, '09:00:00', '17:00:00', 15, 'Turno matutino de atención caja', 'en_curso'),
    (2, 6, 2, CURRENT_DATE, '09:00:00', '17:00:00', 15, 'Turno de cocina y preparación comensales', 'en_curso')
ON CONFLICT DO NOTHING;
SELECT setval('public.turno_planificado_turno_id_seq', COALESCE((SELECT MAX(turno_id) FROM public.turno_planificado), 1));

INSERT INTO public.registro_asistencia (
    asistencia_id, usuario_id, turno_id, puesto_id, fecha, hora_entrada,
    estado_asistencia, minutos_atraso, observaciones
) VALUES
    (1, 5, 1, 1, CURRENT_DATE, CURRENT_DATE + TIME '08:55:00', 'presente', 0, 'Marcaje de entrada puntual reloj control'),
    (2, 6, 2, 2, CURRENT_DATE, CURRENT_DATE + TIME '09:18:00', 'atraso', 18, 'Marcaje con retraso leve (18 min)')
ON CONFLICT DO NOTHING;
SELECT setval('public.registro_asistencia_asistencia_id_seq', COALESCE((SELECT MAX(asistencia_id) FROM public.registro_asistencia), 1));
