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
    console.log('🧪 Iniciando batería de pruebas unitarias - Ronda 10 (CU 24 y CU 35)...');

    const db = require('../config/db');
    const origQuery = db.query;

    try {
        const pedidosController = require('../controllers/c_pedidosController');
        const rrhhController = require('../controllers/c_rrhhController');

        // =========================================================================
        // Test Suite 1: CU 24 — Cancelar pedidos o ítems (CU original 55)
        // =========================================================================
        console.log('\n--- 1. Pruebas CU 24: Cancelación de Pedidos e Ítems ---');

        // Test 1.1: Cancelar pedido pendiente con motivo obligatorio
        {
            let auditCalled = false;
            db.query = async (sql, params) => {
                if (sql.includes('SELECT pedido_id, numero_pedido, estado_pedido, puesto_id, venta_id')) {
                    return {
                        rows: [{
                            pedido_id: 10,
                            numero_pedido: 'ORD-20261112-0010',
                            estado_pedido: 'pendiente',
                            puesto_id: 1,
                            venta_id: 80
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda') && sql.includes("estado_pedido = 'cancelado'")) {
                    return {
                        rows: [{
                            pedido_id: 10,
                            numero_pedido: 'ORD-20261112-0010',
                            estado_pedido: 'cancelado',
                            motivo_cancelacion: params[0],
                            cancelado_por_usuario_id: params[1],
                            fecha_hora_cancelacion: new Date()
                        }]
                    };
                }
                if (sql.includes('UPDATE public.pedido_comanda_detalle') && sql.includes("estado_item = 'cancelado'")) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    auditCalled = true;
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                params: { id: 10 },
                body: { motivo_cancelacion: 'Cliente solicitó cambio de pedido antes de iniciar cocción' }
            });

            await pedidosController.cancelarPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            assert.strictEqual(res.getJson().pedido.estado_pedido, 'cancelado');
            assert.strictEqual(auditCalled, true, 'Debe registrar auditoría de cancelación');
            console.log('✅ Test 1.1: Cancelación exitosa de pedido con motivo obligatorio aprobada (CU 55)');
        }

        // Test 1.2: Rechazar cancelación de pedido ya entregado (Precondición CU 55)
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT pedido_id, numero_pedido, estado_pedido, puesto_id, venta_id')) {
                    return {
                        rows: [{
                            pedido_id: 11,
                            numero_pedido: 'ORD-20261112-0011',
                            estado_pedido: 'entregado',
                            puesto_id: 1
                        }]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                params: { id: 11 },
                body: { motivo_cancelacion: 'Cliente se fue' }
            });

            await pedidosController.cancelarPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getJson().message.includes('ya ha sido entregado'), 'Debe bloquear cancelación si ya fue entregado');
            console.log('✅ Test 1.2: Bloqueo de cancelación para pedidos entregados validado (Precondición CU 55)');
        }

        // Test 1.3: Rechazar cancelación sin motivo
        {
            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                params: { id: 10 },
                body: { motivo_cancelacion: '' }
            });

            await pedidosController.cancelarPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getJson().message.includes('motivo de cancelación es obligatorio'));
            console.log('✅ Test 1.3: Validación de motivo obligatorio de cancelación aprobada (CU 55)');
        }

        // Test 1.4: Cancelar ítem individual y auto-cancelar pedido si era el último ítem
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT pedido_id, numero_pedido, estado_pedido FROM public.pedido_comanda')) {
                    return { rows: [{ pedido_id: 12, numero_pedido: 'ORD-20261112-0012', estado_pedido: 'en_preparacion' }] };
                }
                if (sql.includes('SELECT * FROM public.pedido_comanda_detalle WHERE detalle_id')) {
                    return { rows: [{ detalle_id: 5, pedido_id: 12, producto_nombre: 'Pizza Individual', estado_item: 'en_preparacion' }] };
                }
                if (sql.includes('UPDATE public.pedido_comanda_detalle') && sql.includes("estado_item = 'cancelado'")) {
                    return { rows: [{ detalle_id: 5, estado_item: 'cancelado', motivo_cancelacion: params[0] }] };
                }
                if (sql.includes('COUNT(*)::int AS restantes')) {
                    return { rows: [{ restantes: 0 }] }; // Era el último ítem
                }
                if (sql.includes('UPDATE public.pedido_comanda') && sql.includes("estado_pedido = 'cancelado'")) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                params: { id: 12, detalleId: 5 },
                body: { motivo_cancelacion: 'Se cayó la masa al suelo' }
            });

            await pedidosController.cancelarItemPedido(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            assert.strictEqual(res.getJson().item.estado_item, 'cancelado');
            assert.strictEqual(res.getJson().pedido_cancelado_total, true, 'Debe cancelar pedido si no quedan más ítems');
            console.log('✅ Test 1.4: Cancelación de ítem individual y auto-cancelación de orden aprobada (CU 55)');
        }

        // =========================================================================
        // Test Suite 2: CU 35 — Asistencia, Turnos y Cumplimiento (CU 67 al 71)
        // =========================================================================
        console.log('\n--- 2. Pruebas CU 35: Planificación de Turnos, Asistencia y Cumplimiento ---');

        // Test 2.1: Registrar turno planificado con validación anti-solapamiento (CU 70 / CU 69)
        {
            db.query = async (sql, params) => {
                if (sql.includes('OVERLAPS')) {
                    return { rows: [] }; // No hay solapamiento
                }
                if (sql.includes('INSERT INTO public.turno_planificado')) {
                    return {
                        rows: [{
                            turno_id: 101,
                            usuario_id: params[0],
                            puesto_id: params[1],
                            fecha_turno: params[2],
                            hora_inicio_programada: params[3],
                            hora_fin_programada: params[4],
                            tolerancia_minutos: params[5],
                            estado_turno: 'planificado'
                        }]
                    };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 1, rol_nombre: 'admin' },
                body: {
                    usuario_id: 5,
                    puesto_id: 1,
                    fecha_turno: '2026-11-15',
                    hora_inicio_programada: '09:00:00',
                    hora_fin_programada: '17:00:00',
                    tolerancia_minutos: 15
                }
            });

            await rrhhController.crearTurnoPlanificado(req, res);
            assert.strictEqual(res.getStatusCode(), 201);
            assert.strictEqual(res.getJson().turno.estado_turno, 'planificado');
            console.log('✅ Test 2.1: Registro de turno planificado aprobado (CU 70)');
        }

        // Test 2.2: Marcaje de entrada puntual reloj control (CU 67)
        {
            db.query = async (sql, params) => {
                if (sql.includes('hora_entrada >= now() - INTERVAL')) {
                    return { rows: [] }; // No duplicado
                }
                if (sql.includes('FROM public.turno_planificado') && sql.includes('fecha_turno = CURRENT_DATE')) {
                    return {
                        rows: [{
                            turno_id: 101,
                            usuario_id: 5,
                            puesto_id: 1,
                            hora_inicio_programada: '23:59:00', // Futuro hoy, no hay atraso
                            tolerancia_minutos: 15
                        }]
                    };
                }
                if (sql.includes('hora_salida IS NULL') && sql.includes('SELECT asistencia_id')) {
                    return { rows: [] }; // No hay entrada abierta
                }
                if (sql.includes('INSERT INTO public.registro_asistencia')) {
                    return {
                        rows: [{
                            asistencia_id: 201,
                            usuario_id: params[0],
                            turno_id: params[1],
                            puesto_id: params[2],
                            estado_asistencia: params[3],
                            minutos_atraso: params[4],
                            hora_entrada: new Date()
                        }]
                    };
                }
                if (sql.includes('UPDATE public.turno_planificado')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                body: { usuario_id: 5, tipo_marcaje: 'entrada' }
            });

            await rrhhController.registrarMarcajeAsistencia(req, res);
            assert.strictEqual(res.getStatusCode(), 201);
            assert.strictEqual(res.getJson().asistencia.estado_asistencia, 'presente');
            assert.strictEqual(res.getJson().asistencia.minutos_atraso, 0);
            console.log('✅ Test 2.2: Marcaje de entrada puntual registrado exitosamente (CU 67)');
        }

        // Test 2.3: Marcaje de entrada con atraso superior a tolerancia (CU 67 / CU 69)
        {
            db.query = async (sql, params) => {
                if (sql.includes('hora_entrada >= now() - INTERVAL')) {
                    return { rows: [] };
                }
                if (sql.includes('FROM public.turno_planificado')) {
                    return {
                        rows: [{
                            turno_id: 102,
                            usuario_id: 6,
                            hora_inicio_programada: '00:00:00',
                            tolerancia_minutos: 0
                        }]
                    };
                }
                if (sql.includes('hora_salida IS NULL') && sql.includes('SELECT asistencia_id')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.registro_asistencia')) {
                    return {
                        rows: [{
                            asistencia_id: 202,
                            usuario_id: params[0],
                            turno_id: params[1],
                            estado_asistencia: params[3],
                            minutos_atraso: params[4],
                            hora_entrada: new Date()
                        }]
                    };
                }
                if (sql.includes('UPDATE public.turno_planificado')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 6, rol_nombre: 'cocina' },
                body: { usuario_id: 6, tipo_marcaje: 'entrada' }
            });

            await rrhhController.registrarMarcajeAsistencia(req, res);
            assert.strictEqual(res.getStatusCode(), 201);
            assert.strictEqual(res.getJson().asistencia.estado_asistencia, 'atraso');
            assert.ok(res.getJson().asistencia.minutos_atraso >= 0, 'Debe calcular los minutos de atraso');
            console.log('✅ Test 2.3: Detección y cálculo automático de atraso aprobado (CU 67 / CU 69)');
        }

        // Test 2.4: Marcaje de salida exitoso (CU 67)
        {
            db.query = async (sql, params) => {
                if (sql.includes('hora_entrada >= now() - INTERVAL')) {
                    return { rows: [] };
                }
                if (sql.includes('FROM public.turno_planificado')) {
                    return { rows: [{ turno_id: 101 }] };
                }
                if (sql.includes('hora_salida IS NULL') && sql.includes('SELECT asistencia_id')) {
                    return { rows: [{ asistencia_id: 201, hora_entrada: new Date(Date.now() - 8 * 3600 * 1000) }] };
                }
                if (sql.includes('UPDATE public.registro_asistencia') && sql.includes('hora_salida = now()')) {
                    return {
                        rows: [{
                            asistencia_id: 201,
                            hora_salida: new Date(),
                            estado_asistencia: 'presente'
                        }]
                    };
                }
                if (sql.includes("UPDATE public.turno_planificado SET estado_turno = 'completado'")) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 5, rol_nombre: 'caja' },
                body: { usuario_id: 5, tipo_marcaje: 'salida' }
            });

            await rrhhController.registrarMarcajeAsistencia(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            assert.strictEqual(res.getJson().tipo, 'salida');
            assert.ok(res.getJson().asistencia.hora_salida);
            console.log('✅ Test 2.4: Marcaje de salida y cierre de turno aprobado (CU 67)');
        }

        // Test 2.5: Detección de inconsistencias y control de cumplimiento (CU 69 / CU 71)
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.turno_planificado t') && sql.includes('COUNT(t.turno_id)::int AS total_turnos_programados')) {
                    return {
                        rows: [{
                            total_turnos_programados: 20,
                            total_asistencias_registradas: 19,
                            asistencias_puntuales: 16,
                            total_atrasos: 3,
                            minutos_atraso_totales: 42,
                            ausencias_totales: 1
                        }]
                    };
                }
                if (sql.includes('GROUP BY u.usuario_id')) {
                    return {
                        rows: [
                            { usuario_id: 5, usuario_nombre: 'Sofía Rojas', rol_nombre: 'caja', turnos_asignados: 10, asistencias: 10, atrasos: 1, minutos_atraso: 12, ausencias: 0 },
                            { usuario_id: 6, usuario_nombre: 'Matías Morales', rol_nombre: 'cocina', turnos_asignados: 10, asistencias: 9, atrasos: 2, minutos_atraso: 30, ausencias: 1 }
                        ]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { usuario_id: 1, rol_nombre: 'admin' },
                query: {}
            });

            await rrhhController.obtenerCumplimientoLaboral(req, res);
            const data = res.getJson();

            assert.strictEqual(data.kpi.total_turnos_programados, 20);
            assert.strictEqual(data.kpi.porcentaje_cumplimiento, 95); // 19 / 20 = 95%
            assert.strictEqual(data.kpi.total_atrasos, 3);
            assert.strictEqual(data.trabajadores.length, 2);
            console.log('✅ Test 2.5: KPIs de cumplimiento laboral y control de dotación aprobados (CU 71)');
        }

        console.log('\n🎉 ¡TODAS LAS PRUEBAS DE LA RONDA 10 (CU 24 Y CU 35) PASARON EXITOSAMENTE!\n');
    } finally {
        db.query = origQuery;
    }
}

runTests().catch(err => {
    console.error('❌ Error ejecutando pruebas de la Ronda 10:', err);
    process.exit(1);
});
