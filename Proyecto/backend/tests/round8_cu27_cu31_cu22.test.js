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
    console.log('🧪 Iniciando batería de pruebas unitarias - Ronda 8 (CU 27, CU 31, CU 22)...');

    const db = require('../config/db');

    // Salvar query original
    const origQuery = db.query;

    try {
        // =========================================================================
        // Test Suite 1: CU 27 — Emisión y Reimpresión de Boletas Electrónicas (CU 80, 87)
        // =========================================================================
        console.log('\n--- 1. Pruebas CU 27: Boletas Electrónicas ---');
        const boletaController = require('../controllers/c_boletaController');

        // Test 1.1: Emitir boleta electrónica
        {
            let insertCalled = false;
            const mockClient = {
                query: async (sql, params) => {
                    if (sql.includes('INSERT INTO public.boleta_electronica')) {
                        insertCalled = true;
                        return {
                            rows: [{
                                boleta_id: 101,
                                venta_id: params[0],
                                folio_boleta: params[1],
                                tipo_documento: 'boleta_electronica_afecta',
                                monto_neto: params[2],
                                monto_iva: params[3],
                                monto_total: params[4],
                                estado_sii: 'emitida',
                                codigo_generacion: params[5],
                                sello_digital: params[6],
                                veces_impresa: 1
                            }]
                        };
                    }
                    return { rows: [] };
                }
            };

            const boleta = await boletaController.emitirBoletaElectronicaParaVenta(mockClient, {
                venta_id: 55,
                folio_boleta: 'BOL-1-987654',
                total_venta: 11900,
                neto: 10000,
                iva: 1900,
                fecha_venta: new Date().toISOString()
            });

            assert.strictEqual(insertCalled, true, 'Debe llamar al insert en boleta_electronica');
            assert.strictEqual(boleta.folio_boleta, 'BOL-1-987654');
            assert.strictEqual(boleta.monto_total, 11900);
            assert.strictEqual(boleta.veces_impresa, 1);
            console.log('✅ Test 1.1: Emisión automática de boleta electrónica aprobada (CU 80)');
        }

        // Test 1.2: Consultar boleta por folio único
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.boleta_electronica b')) {
                    return {
                        rows: [{
                            boleta_id: 101,
                            venta_id: 55,
                            folio_boleta: 'BOL-1-987654',
                            monto_neto: 10000,
                            monto_iva: 1900,
                            monto_total: 11900,
                            estado_sii: 'emitida',
                            veces_impresa: 1,
                            puesto_nombre: 'Cafetería Vita',
                            puesto_tipo_negocio: 'comida',
                            cajero_nombre: 'Sofía Rojas'
                        }]
                    };
                }
                if (sql.includes('FROM public.venta_pos_detalle')) {
                    return {
                        rows: [{
                            detalle_id: 1,
                            producto_nombre: 'Hot Dog Tradicional',
                            cantidad: 2,
                            precio_unitario: 2500,
                            subtotal_linea: 5000
                        }]
                    };
                }
                if (sql.includes('FROM public.venta_pos_pago')) {
                    return {
                        rows: [{
                            pago_id: 1,
                            metodo_pago: 'efectivo',
                            monto: 11900,
                            monto_recibido: 12000,
                            vuelto: 100
                        }]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({ params: { folio: 'BOL-1-987654' } });
            await boletaController.obtenerBoletaPorFolio(req, res);

            assert.strictEqual(res.getStatusCode(), 200);
            const data = res.getJson();
            assert.strictEqual(data.boleta.folio_boleta, 'BOL-1-987654');
            assert.strictEqual(data.items.length, 1);
            assert.strictEqual(data.pagos[0].metodo_pago, 'efectivo');
            assert.strictEqual(data.boleta.empresa_emisor.rut, '76.123.456-7');
            console.log('✅ Test 1.2: Consulta de detalle de boleta con emisor y tributos aprobada (CU 80)');
        }

        // Test 1.3: Reimprimir boleta (Subflujo CU 87)
        {
            db.query = async (sql, params) => {
                if (sql.includes('SELECT * FROM public.boleta_electronica WHERE UPPER(folio_boleta)')) {
                    return {
                        rows: [{
                            boleta_id: 101,
                            folio_boleta: 'BOL-1-987654',
                            veces_impresa: 1
                        }]
                    };
                }
                if (sql.includes('UPDATE public.boleta_electronica')) {
                    return {
                        rows: [{
                            boleta_id: 101,
                            folio_boleta: 'BOL-1-987654',
                            veces_impresa: 2,
                            ultima_reimpresion: new Date().toISOString(),
                            motivo_reimpresion: params[0]
                        }]
                    };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                user: { id: 5, rol_nombre: 'caja' },
                params: { folio: 'BOL-1-987654' },
                body: { motivo: 'Cliente extravió comprobante' }
            });
            await boletaController.reimprimirBoleta(req, res);

            assert.strictEqual(res.getStatusCode(), 200);
            const data = res.getJson();
            assert.strictEqual(data.es_copia, true);
            assert.strictEqual(data.boleta.veces_impresa, 2);
            assert.strictEqual(data.rotulo_copia, 'COPIA REIMPRESIÓN (N° 2)');
            console.log('✅ Test 1.3: Reimpresión con marca de agua y registro de auditoría aprobada (CU 87)');
        }

        // =========================================================================
        // Test Suite 2: CU 31 — Sincronización de Ventas con ERP SAP B1 (CU 81)
        // =========================================================================
        console.log('\n--- 2. Pruebas CU 31: Sincronización ERP SAP Business One ---');
        const sapController = require('../controllers/c_sapController');

        // Test 2.1: Sincronizar venta individual con SAP B1
        {
            let logInsertado = false;
            let ventaActualizada = false;

            const mockDb = {
                query: async (sql, params) => {
                    if (sql.includes('FROM public.venta_pos v')) {
                        return {
                            rows: [{
                                venta_id: 88,
                                folio_boleta: 'BOL-2-123456',
                                fecha_venta: new Date().toISOString(),
                                total_venta: 25000,
                                puesto_codigo: 'PUESTO-MER-01',
                                puesto_nombre: 'Candy Corner',
                                puesto_tipo_negocio: 'merch',
                                cajero_nombre: 'Sofía Rojas',
                                caja_id: 2
                            }]
                        };
                    }
                    if (sql.includes('FROM public.venta_pos_detalle vd')) {
                        return {
                            rows: [{
                                detalle_id: 1,
                                producto_codigo: 'MER-PELUCHE',
                                producto_nombre: 'Peluche Urbano KidZania',
                                cantidad: 2,
                                precio_unitario: 12500,
                                subtotal_linea: 25000,
                                descuento_linea: 0
                            }]
                        };
                    }
                    if (sql.includes('INSERT INTO public.sap_sincronizacion_log')) {
                        logInsertado = true;
                        return {
                            rows: [{
                                log_id: 1,
                                venta_id: 88,
                                estado_sap: 'sincronizado',
                                doc_entry_sap: params[2],
                                doc_num_sap: params[3]
                            }]
                        };
                    }
                    if (sql.includes('UPDATE public.venta_pos') && sql.includes('estado_sap')) {
                        ventaActualizada = true;
                        return { rows: [] };
                    }
                    return { rows: [] };
                }
            };

            const resultado = await sapController.sincronizarVentaConSAP(mockDb, 88);

            assert.strictEqual(logInsertado, true, 'Debe registrarse en log de SAP');
            assert.strictEqual(ventaActualizada, true, 'Debe actualizarse venta_pos');
            assert.ok(resultado.doc_entry.startsWith('SAP-'), 'DocEntry debe tener prefijo SAP');
            console.log('✅ Test 2.1: Generación de OINV / Invoice en SAP B1 Service Layer aprobada (CU 81)');
        }

        // Test 2.2: Sincronización masiva de ventas pendientes
        {
            db.query = async (sql, params) => {
                if (sql.includes('estado_sap IN')) {
                    return {
                        rows: [
                            { venta_id: 91, folio_boleta: 'BOL-1-111' },
                            { venta_id: 92, folio_boleta: 'BOL-1-222' }
                        ]
                    };
                }
                if (sql.includes('FROM public.venta_pos v') && sql.includes('v.venta_id = $1')) {
                    return {
                        rows: [{
                            venta_id: params[0],
                            folio_boleta: `BOL-1-${params[0]}`,
                            fecha_venta: new Date().toISOString(),
                            total_venta: 5000,
                            puesto_codigo: 'PUESTO-COM-01',
                            puesto_nombre: 'Cafetería Vita',
                            puesto_tipo_negocio: 'comida',
                            cajero_nombre: 'Sofía Rojas',
                            caja_id: 1
                        }]
                    };
                }
                if (sql.includes('FROM public.venta_pos_detalle vd')) {
                    return {
                        rows: [{
                            detalle_id: 1,
                            producto_codigo: 'COM-HOTDOG',
                            producto_nombre: 'Hot Dog Tradicional',
                            cantidad: 2,
                            precio_unitario: 2500,
                            subtotal_linea: 5000,
                            descuento_linea: 0
                        }]
                    };
                }
                if (sql.includes('INSERT INTO public.sap_sincronizacion_log')) {
                    return { rows: [{ log_id: 1, estado_sap: 'sincronizado' }] };
                }
                if (sql.includes('UPDATE public.venta_pos')) {
                    return { rows: [] };
                }
                if (sql.includes('INSERT INTO public.bitacora_auditoria')) {
                    return { rows: [] };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({ user: { id: 1 } });
            await sapController.sincronizarVentasPendientesSAP(req, res);

            assert.strictEqual(res.getStatusCode(), 200);
            const data = res.getJson();
            assert.strictEqual(data.total_procesadas, 2);
            assert.strictEqual(data.exitosas, 2);
            console.log('✅ Test 2.2: Sincronización masiva de ventas hacia SAP B1 aprobada (CU 81)');
        }

        // =========================================================================
        // Test Suite 3: CU 22 — Gestión de Promociones y Descuentos (CU 31, 65, 66)
        // =========================================================================
        console.log('\n--- 3. Pruebas CU 22: Promociones y Descuentos Comerciales ---');
        const promoController = require('../controllers/c_promocionController');

        // Test 3.1: Crear promoción comercial
        {
            db.connect = async () => ({
                query: async (sql, params) => {
                    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
                    if (sql.includes('SELECT promocion_id FROM public.promocion')) return { rows: [] };
                    if (sql.includes('INSERT INTO public.promocion')) {
                        return {
                            rows: [{
                                promocion_id: 10,
                                promocion_codigo: 'PROMO-KIDZ15',
                                promocion_nombre: '15% Descuento Especial',
                                tipo_descuento: 'porcentaje',
                                valor_descuento: 15,
                                es_acumulable: false,
                                monto_minimo_compra: 5000,
                                estado: 'activo'
                            }]
                        };
                    }
                    if (sql.includes('INSERT INTO public.bitacora_auditoria')) return { rows: [] };
                    return { rows: [] };
                },
                release: () => {}
            });

            const { req, res } = createMockReqRes({
                user: { id: 1 },
                body: {
                    promocion_codigo: 'PROMO-KIDZ15',
                    promocion_nombre: '15% Descuento Especial',
                    tipo_descuento: 'porcentaje',
                    valor_descuento: 15,
                    monto_minimo_compra: 5000,
                    es_acumulable: false
                }
            });

            await promoController.crearPromocion(req, res);
            assert.strictEqual(res.getStatusCode(), 201);
            assert.strictEqual(res.getJson().promocion.promocion_codigo, 'PROMO-KIDZ15');
            console.log('✅ Test 3.1: Creación de promoción comercial aprobada (CU 31)');
        }

        // Test 3.2: Validar código de promoción y evaluar compra mínima (Subflujo CU 65)
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.promocion p') && sql.includes('promocion_codigo')) {
                    return {
                        rows: [{
                            promocion_id: 1,
                            promocion_codigo: 'PROMO-KIDZ10',
                            promocion_nombre: '10% Descuento Temporada Escolar',
                            tipo_descuento: 'porcentaje',
                            valor_descuento: 10,
                            es_acumulable: false,
                            aplica_a: 'total_venta',
                            monto_minimo_compra: 3000,
                            estado: 'activo',
                            fecha_inicio: new Date(Date.now() - 86400000).toISOString(),
                            fecha_fin: new Date(Date.now() + 86400000).toISOString()
                        }]
                    };
                }
                if (sql.includes('FROM public.producto') && sql.includes('ANY')) {
                    return {
                        rows: [
                            { producto_id: 1, categoria_id: 1, producto_precio: 2500, producto_nombre: 'Hot Dog' },
                            { producto_id: 2, categoria_id: 2, producto_precio: 1500, producto_nombre: 'Bebida 500ml' }
                        ]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                body: {
                    codigo_promocion: 'PROMO-KIDZ10',
                    items: [
                        { producto_id: 1, cantidad: 1, precio_unitario: 2500 },
                        { producto_id: 2, cantidad: 1, precio_unitario: 1500 }
                    ]
                }
            });

            await promoController.validarYAplicarPromocion(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            const data = res.getJson();
            assert.strictEqual(data.valida, true);
            assert.strictEqual(data.calculo.subtotal_bruto, 4000); // 2500 + 1500
            assert.strictEqual(data.calculo.monto_descuento, 400); // 10% de 4000
            assert.strictEqual(data.calculo.nuevo_total, 3600);
            console.log('✅ Test 3.2: Validación y cálculo en vivo de descuento de promoción aprobada (CU 65)');
        }

        // Test 3.3: Regla de incompatibilidad / no acumulación de descuentos (Subflujo CU 66)
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.promocion p') && sql.includes('promocion_codigo')) {
                    return {
                        rows: [{
                            promocion_id: 2,
                            promocion_codigo: 'PROMO-MERCH20',
                            promocion_nombre: '20% Descuento Souvenirs',
                            tipo_descuento: 'porcentaje',
                            valor_descuento: 20,
                            es_acumulable: false, // NO acumulable
                            aplica_a: 'total_venta',
                            monto_minimo_compra: 0,
                            estado: 'activo',
                            fecha_inicio: new Date(Date.now() - 86400000).toISOString()
                        }]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                body: {
                    codigo_promocion: 'PROMO-MERCH20',
                    promocion_existente_codigo: 'PROMO-KIDZ10', // Intento de aplicar dos promociones no acumulables
                    items: [{ producto_id: 1, cantidad: 1, precio_unitario: 5000 }]
                }
            });

            await promoController.validarYAplicarPromocion(req, res);
            assert.strictEqual(res.getStatusCode(), 400, 'Debe rechazar promociones no acumulables (CU 66)');
            const data = res.getJson();
            assert.strictEqual(data.es_incompatible, true);
            assert.ok(data.message.includes('NO es acumulable'));
            console.log('✅ Test 3.3: Regla de incompatibilidad y no acumulación de promociones validada (CU 66)');
        }

        // =========================================================================
        // Test Suite 4: Integración en POS (Calcular total con promoción y venta)
        // =========================================================================
        console.log('\n--- 4. Pruebas Integración POS: Descuento de Promoción ---');
        const cajaController = require('../controllers/c_cajaController');

        // Test 4.1: Calcular total con promoción activa en POS (CU 21 + CU 22)
        {
            db.query = async (sql, params) => {
                if (sql.includes('FROM public.producto p')) {
                    return {
                        rows: [{
                            producto_id: 10,
                            producto_codigo: 'COM-HOTDOG-01',
                            producto_nombre: 'Hot Dog Tradicional KidZania',
                            producto_precio: 2500,
                            producto_tipo_negocio: 'comida',
                            producto_estado: 'activo',
                            producto_stock_actual: 50,
                            categoria_id: 1,
                            unidad_medida_codigo: 'UN'
                        }]
                    };
                }
                if (sql.includes('FROM public.promocion')) {
                    return {
                        rows: [{
                            promocion_id: 1,
                            promocion_codigo: 'PROMO-KIDZ10',
                            promocion_nombre: '10% Descuento Temporada',
                            tipo_descuento: 'porcentaje',
                            valor_descuento: 10,
                            es_acumulable: false,
                            monto_minimo_compra: 2000,
                            estado: 'activo',
                            fecha_inicio: new Date(Date.now() - 86400000).toISOString(),
                            fecha_fin: new Date(Date.now() + 86400000).toISOString()
                        }]
                    };
                }
                return { rows: [] };
            };

            const { req, res } = createMockReqRes({
                body: {
                    items: [{ producto_id: 10, cantidad: 2 }], // 2 * 2500 = 5000
                    codigo_promocion: 'PROMO-KIDZ10' // 10% de 5000 = 500
                }
            });

            await cajaController.calcularTotalVentaPos(req, res);
            assert.strictEqual(res.getStatusCode(), 200);
            const data = res.getJson();
            assert.strictEqual(data.resumen_calculo.subtotal, 5000);
            assert.strictEqual(data.resumen_calculo.descuento_promocion, 500);
            assert.strictEqual(data.resumen_calculo.total_venta, 4500); // 5000 - 500
            assert.strictEqual(data.resumen_calculo.promocion_aplicada.codigo, 'PROMO-KIDZ10');
            console.log('✅ Test 4.1: Cálculo automático de descuento de promoción en POS aprobado (CU 21 + CU 22)');
        }

        console.log('\n🎉 ¡TODAS LAS PRUEBAS DE LA RONDA 8 (CU 27, CU 31, CU 22) PASARON EXITOSAMENTE!');
    } finally {
        db.query = origQuery;
    }
}

runTests().catch(err => {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
});
