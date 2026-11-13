const assert = require('assert');

// Mock helpers
function createMockReqRes({ user, params = {}, query = {}, body = {} }) {
    const req = { user, params, query, body };
    let statusCode = 200;
    let jsonBody = null;

    const res = {
        status(code) {
            statusCode = code;
            return res;
        },
        json(data) {
            jsonBody = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getJson: () => jsonBody
    };

    return { req, res };
}

async function runTests() {
    console.log('🧪 Iniciando batería de pruebas unitarias - Ronda 9 (CU 28, CU 29, CU 30)...');

    const db = require('../config/db');
    const origQuery = db.query;

    try {
        const cocinaController = require('../controllers/c_cocinaController');

        // =========================================================================
        // Test Suite 1: CU 28 — Enrutamiento y Comandas Digitales (CU orig. 56 y 57)
        // =========================================================================
        console.log('\n--- 1. Pruebas CU 28: Enrutamiento y Generación de Comandas Digitales ---');

        // Test 1.1: Generación de comanda cuando la venta incluye productos que requieren cocina
        {
            let pedidoInsertado = false;
            let detalleInsertado = 0;

            db.query = async (sql, params) => {
                if (sql.includes('SELECT producto_id, producto_codigo, producto_nombre, requiere_cocina')) {
                    return {
                        rows: [
                            { producto_id: 1, producto_codigo: 'COM-HOTDOG-01', producto_nombre: 'Hot Dog Tradicional', requiere_cocina: true, producto_tipo_negocio: 'comida' },
                            { producto_id: 2, producto_codigo: 'COM-BEB-500', producto_nombre: 'Bebida Néctar Frutal', requiere_cocina: false, producto_tipo_negocio: 'comida' }
                        ]
                    };
                }
                if (sql.includes('SELECT COUNT(*)::int AS total_hoy FROM public.pedido_comanda')) {
                    return { rows: [{ total_hoy: 12 }] };
                }
                if (sql.includes('INSERT INTO public.pedido_comanda')) {
                    pedidoInsertado = true;
                    return {
                        rows: [{
                            pedido_id: 88,
                            numero_pedido: params[0],
                            venta_id: params[1],
                            puesto_id: params[2],
                            cajero_id: params[3],
                            mesa_id: params[4],
                            estado_pedido: 'pendiente',
                            prioridad: params[5],
                            fecha_hora_creacion: new Date()
                        }]
                    };
                }
                if (sql.includes('INSERT INTO public.pedido_comanda_detalle')) {
                    detalleInsertado++;
                    return {
                        rows: [{
                            detalle_id: 200 + detalleInsertado,
                            pedido_id: params[0],
                            producto_id: params[1],
                            producto_codigo: params[2],
                            producto_nombre: params[3],
                            cantidad: params[4],
                            requiere_cocina: params[5],
                            estado_item: 'pendiente',
                            nota_preparacion: params[6]
                        }]
                    };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const resultado = await cocinaController.enrutarYGenerarComanda({
                venta_id: 42,
                puesto_id: 1,
                cajero_id: 5,
                items: [
                    { producto_id: 1, cantidad: 2, nota_preparacion: 'Sin mostaza' },
                    { producto_id: 2, cantidad: 1 }
                ]
            });

            assert.strictEqual(resultado.comanda_generada, true, 'Debe generar comanda digital');
            assert.strictEqual(pedidoInsertado, true, 'Debe insertar en pedido_comanda');
            assert.strictEqual(resultado.pedido_id, 88);
            assert.strictEqual(resultado.estado_pedido, 'pendiente');
            assert.ok(resultado.numero_pedido.startsWith('ORD-'), 'Número de comanda debe comenzar con ORD-');
            assert.strictEqual(resultado.total_items, 2, 'Debe registrar ambos ítems de la orden');
            console.log('✅ Test 1.1: Generación automática de comanda digital aprobada (CU 56 y 57)');
        }

        // Test 1.2: No generar comanda si ningún producto requiere cocina (p.ej. solo merchandising o snacks cerrados)
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT producto_id, producto_codigo, producto_nombre, requiere_cocina')) {
                    return {
                        rows: [
                            { producto_id: 10, producto_codigo: 'MER-POLERA-01', producto_nombre: 'Polera KidZania', requiere_cocina: false, producto_tipo_negocio: 'merch' }
                        ]
                    };
                }
                return { rows: [] };
            };

            const resultado = await cocinaController.enrutarYGenerarComanda({
                venta_id: 43,
                puesto_id: 5, // Puesto Merch
                cajero_id: 5,
                items: [
                    { producto_id: 10, cantidad: 1 }
                ]
            });

            assert.strictEqual(resultado.comanda_generada, false, 'No debe generar comanda si no hay ítems de cocina');
            assert.strictEqual(resultado.pedido_id, null);
            assert.ok(resultado.razon.toLowerCase().includes('no incluye productos que requieran preparación'), 'Debe dar razón clara');
            console.log('✅ Test 1.2: Omisión inteligente de comanda para ventas sin cocina aprobada (CU 56)');
        }

        // =========================================================================
        // Test Suite 2: CU 29 — Consulta y Cambio de Estado en Cocina KDS (CU orig. 60 y 61)
        // =========================================================================
        console.log('\n--- 2. Pruebas CU 29: Visualización y Transición de Estados KDS ---');

        // Test 2.1: Consulta de comandas con semáforo de urgencia y orden FIFO
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.pedido_comanda p')) {
                    return {
                        rows: [
                            {
                                pedido_id: 1,
                                numero_pedido: 'ORD-20261112-0001',
                                puesto_id: 1,
                                puesto_nombre: 'Cafetería Vita',
                                puesto_codigo: 'PUESTO-COM-01',
                                cajero_id: 5,
                                cajero_nombre: 'Sofía Rojas',
                                cocinero_id: null,
                                cocinero_nombre: null,
                                estado_pedido: 'pendiente',
                                prioridad: 'normal',
                                fecha_hora_creacion: new Date(Date.now() - 12 * 60 * 1000), // Hace 12 minutos
                                minutos_desde_creacion: 12,
                                total_incidencias: 0
                            },
                            {
                                pedido_id: 2,
                                numero_pedido: 'ORD-20261112-0002',
                                puesto_id: 2,
                                puesto_nombre: 'Restaurante La Plaza',
                                puesto_codigo: 'PUESTO-COM-02',
                                cajero_id: 5,
                                cajero_nombre: 'Sofía Rojas',
                                cocinero_id: 6,
                                cocinero_nombre: 'Matías Morales',
                                estado_pedido: 'en_preparacion',
                                prioridad: 'urgente',
                                fecha_hora_creacion: new Date(Date.now() - 3 * 60 * 1000), // Hace 3 minutos
                                minutos_desde_creacion: 3,
                                total_incidencias: 1
                            }
                        ]
                    };
                }
                if (sql.includes('FROM public.pedido_comanda_detalle')) {
                    return {
                        rows: [
                            { detalle_id: 11, pedido_id: 1, producto_nombre: 'Hot Dog Tradicional', cantidad: 2, estado_item: 'pendiente', requiere_cocina: true },
                            { detalle_id: 12, pedido_id: 2, producto_nombre: 'Pizza Individual', cantidad: 1, estado_item: 'en_preparacion', requiere_cocina: true }
                        ]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                query: { estado: 'activos' }
            });

            await cocinaController.obtenerComandasCocina(req, res);
            const comandas = res.getJson();

            assert.strictEqual(Array.isArray(comandas), true);
            assert.strictEqual(comandas.length, 2);
            assert.strictEqual(comandas[0].semaforo_urgencia, 'critico', '12 minutos debe catalogarse como crítico (> 10m SLA)');
            assert.strictEqual(comandas[1].semaforo_urgencia, 'normal', '3 minutos debe catalogarse como normal (< 5m)');
            assert.strictEqual(comandas[0].items.length, 1);
            console.log('✅ Test 2.1: Consulta KDS con orden y cálculo de semáforo de urgencia aprobada (CU 60)');
        }

        // Test 2.2: Transición de estado: 'pendiente' -> 'en_preparacion' (Cocinero toma el pedido)
        {
            let sqlEjecutado = '';
            db.query = async (sql, params) => {
                if (sql.includes('SELECT * FROM public.pedido_comanda WHERE pedido_id')) {
                    return {
                        rows: [{
                            pedido_id: 1,
                            numero_pedido: 'ORD-20261112-0001',
                            estado_pedido: 'pendiente',
                            prioridad: 'normal',
                            hora_inicio_preparacion: null
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda') && sql.includes('estado_pedido = $1')) {
                    sqlEjecutado = sql;
                    return {
                        rows: [{
                            pedido_id: 1,
                            numero_pedido: 'ORD-20261112-0001',
                            estado_pedido: params[0],
                            cocinero_id: params[2],
                            hora_inicio_preparacion: new Date()
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda_detalle')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                params: { id: 1 },
                body: { nuevo_estado: 'en_preparacion' }
            });

            await cocinaController.cambiarEstadoPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            assert.strictEqual(res.getJson().pedido.estado_pedido, 'en_preparacion');
            assert.ok(sqlEjecutado.includes('hora_inicio_preparacion'), 'Debe registrar hora de inicio');
            console.log('✅ Test 2.2: Transición a "en_preparacion" con asignación de cocinero aprobada (CU 60)');
        }

        // Test 2.3: Transición de estado: 'en_preparacion' -> 'listo' (CU 61: Marcar Pedido como Listo)
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT * FROM public.pedido_comanda WHERE pedido_id')) {
                    return {
                        rows: [{
                            pedido_id: 1,
                            numero_pedido: 'ORD-20261112-0001',
                            estado_pedido: 'en_preparacion',
                            hora_inicio_preparacion: new Date(Date.now() - 420 * 1000) // 7 minutos atrás
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda') && sql.includes('tiempo_preparacion_segundos')) {
                    return {
                        rows: [{
                            pedido_id: 1,
                            numero_pedido: 'ORD-20261112-0001',
                            estado_pedido: 'listo',
                            hora_listo: new Date(),
                            tiempo_preparacion_segundos: 420
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda_detalle')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                params: { id: 1 },
                body: { nuevo_estado: 'listo' }
            });

            await cocinaController.cambiarEstadoPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            const p = res.getJson().pedido;
            assert.strictEqual(p.estado_pedido, 'listo');
            assert.strictEqual(p.tiempo_preparacion_segundos, 420, 'Debe calcular el tiempo de preparación');
            console.log('✅ Test 2.3: Marcado de pedido como listo y cálculo de tiempo de cocción aprobado (CU 61)');
        }

        // Test 2.4: Transición inválida rechazada (ej: de 'pendiente' a 'entregado' sin cocinar)
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT * FROM public.pedido_comanda WHERE pedido_id')) {
                    return {
                        rows: [{
                            pedido_id: 1,
                            numero_pedido: 'ORD-20261112-0001',
                            estado_pedido: 'pendiente'
                        }]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                params: { id: 1 },
                body: { nuevo_estado: 'entregado' }
            });

            await cocinaController.cambiarEstadoPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getJson().message.includes('Transición de estado inválida'));
            console.log('✅ Test 2.4: Bloqueo de transición inconsistente validado');
        }

        // =========================================================================
        // Test Suite 3: CU 30 — Tiempos Operativos e Incidencias (CU orig. 59 y 62)
        // =========================================================================
        console.log('\n--- 3. Pruebas CU 30: Registro de Incidencias y Métricas Operativas ---');

        // Test 3.1: Registrar incidencia de cocina con retraso y elevación de prioridad
        {
            let prioridadActualizada = false;
            db.query = async (sql, params) => {
                if (sql.includes('SELECT pedido_id, numero_pedido FROM public.pedido_comanda')) {
                    return { rows: [{ pedido_id: 1, numero_pedido: 'ORD-20261112-0001' }] };
                }
                if (sql.includes('INSERT INTO public.pedido_incidencia')) {
                    return {
                        rows: [{
                            incidencia_id: 50,
                            pedido_id: params[0],
                            usuario_id: params[1],
                            tipo_incidencia: params[2],
                            descripcion: params[3],
                            tiempo_retraso_min: params[4],
                            accion_correctiva: params[5],
                            creado_en: new Date()
                        }]
                    };
                }
                if (sql.includes("UPDATE public.pedido_comanda") && sql.includes("prioridad = 'urgente'")) {
                    prioridadActualizada = true;
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                params: { id: 1 },
                body: {
                    tipo_incidencia: 'quiebre_insumo',
                    tiempo_retraso_min: 8,
                    descripcion: 'Se agotó la salsa de tomate artesanal en la estación de pizzas',
                    accion_correctiva: 'Se solicitó tarro de reposición express a bodega'
                }
            });

            await cocinaController.registrarIncidenciaPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 201);
            assert.strictEqual(res.getJson().incidencia.tipo_incidencia, 'quiebre_insumo');
            assert.strictEqual(res.getJson().incidencia.tiempo_retraso_min, 8);
            assert.strictEqual(prioridadActualizada, true, 'Debe elevar la comanda a prioridad urgente');
            console.log('✅ Test 3.1: Registro de incidencia con retraso y elevación a urgente aprobado (CU 62)');
        }

        // Test 3.2: Reyección de tipo de incidencia inválido
        {
            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                params: { id: 1 },
                body: {
                    tipo_incidencia: 'tipo_falso_inventado',
                    descripcion: 'Prueba de validación'
                }
            });

            await cocinaController.registrarIncidenciaPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getJson().message.includes('Tipo de incidencia inválido'));
            console.log('✅ Test 3.2: Validación de catálogo cerrado de tipos de incidencia aprobada (CU 62)');
        }

        // Test 3.3: Métricas operativas consolidadas de tiempos y porcentaje SLA (CU 59)
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.pedido_comanda')) {
                    return {
                        rows: [{
                            total_pedidos: 50,
                            pedidos_pendientes: 4,
                            pedidos_en_preparacion: 6,
                            pedidos_listos: 5,
                            pedidos_entregados: 34,
                            pedidos_cancelados: 1,
                            tiempo_prom_preparacion_seg: 380, // 6m 20s
                            tiempo_prom_entrega_seg: 145,     // 2m 25s
                            pedidos_fuera_sla_10min: 3        // 3 de 39 listos/entregados excedieron SLA
                        }]
                    };
                }
                if (sql.includes('FROM public.pedido_incidencia i')) {
                    return {
                        rows: [
                            { tipo_incidencia: 'quiebre_insumo', total_tipo: 2, minutos_retraso_acumulados: 15 },
                            { tipo_incidencia: 'error_preparacion', total_tipo: 1, minutos_retraso_acumulados: 5 }
                        ]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 1, rol_nombre: 'admin' },
                query: {}
            });

            await cocinaController.obtenerMetricasCocina(req, res);
            const m = res.getJson();

            assert.strictEqual(m.kpi.total_pedidos, 50);
            assert.strictEqual(m.kpi.tiempo_prom_preparacion_formato, '6m 20s');
            assert.strictEqual(m.kpi.tiempo_prom_entrega_formato, '2m 25s');
            assert.ok(m.kpi.sla_cumplimiento_porcentaje >= 90, 'El cumplimiento de SLA debe calcularse correctamente');
            assert.strictEqual(m.incidencias.total_incidencias, 3);
            console.log('✅ Test 3.3: Cálculo consolidado de tiempos promedio y SLA operativo aprobado (CU 59)');
        }

        console.log('\n🎉 ¡TODAS LAS PRUEBAS DE LA RONDA 9 (CU 28, CU 29, CU 30) PASARON EXITOSAMENTE!\n');
    } finally {
        db.query = origQuery;
    }
}

runTests().catch(err => {
    console.error('❌ Error ejecutando pruebas de la Ronda 9:', err);
    process.exit(1);
});
