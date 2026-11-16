const db = require('../config/db');
const { registrarLote } = require('./c_loteController');
const { descontarInsumosRecetaPorVenta } = require('./c_productoController');
const { registrarAuditoria } = require('../config/initDb');
const { tienePermiso } = require('../middleware/authMiddleware');

const MOTIVOS_SALIDA_PERMITIDOS = ['venta', 'consumo_interno', 'merma', 'descarte'];
const CATEGORIAS_CATALOGO_PERMITIDAS = ['salida', 'merma', 'ajuste', 'consumo_interno', 'descarte'];

const mapearCodigoMotivoAEnumMerma = (codigo = '', nombre = '') => {
    const texto = `${codigo} ${nombre}`.toLowerCase();
    if (texto.includes('vencimiento')) return 'vencimiento';
    if (texto.includes('derrame') || texto.includes('caída') || texto.includes('rotura')) return 'derrame';
    if (texto.includes('preparacion') || texto.includes('preparación') || texto.includes('cocción')) return 'error_preparacion';
    return 'otro';
};

const registrarIngreso = async (req, res) => {
    return registrarLote(req, res);
};

// Catálogo de motivos para salidas no asociadas a venta y mermas (CU 11 - Subflujo CU 13 y CU 13 - Subflujo CU 18/50)
const obtenerMotivosCatalogo = async (req, res) => {
    const { categoria, todos } = req.query;
    const params = [];
    const condiciones = [];

    if (todos !== 'true') {
        condiciones.push("motivo_estado = 'activo'");
    }
    if (categoria) {
        params.push(String(categoria).trim().toLowerCase());
        condiciones.push(`motivo_categoria = $${params.length}`);
    }

    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const { rows } = await db.query(`
            SELECT
                motivo_id,
                motivo_codigo,
                motivo_nombre,
                motivo_categoria,
                motivo_descripcion,
                motivo_estado,
                creado_en
            FROM public.catalogo_motivo
            ${whereSql}
            ORDER BY motivo_categoria ASC, motivo_nombre ASC
        `, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener catálogo de motivos', error: error.message });
    }
};

// Subflujo CU 44: Validando Disponibilidad de Stock en tiempo real antes de confirmar salida
const validarDisponibilidadStock = async (req, res) => {
    const { producto_id, lote_id, cantidad } = req.query;
    const cantSolicitada = Number(cantidad || 0);

    if (!producto_id) {
        return res.status(400).json({ message: 'Debe indicar el producto a consultar' });
    }

    try {
        const { rows: prodRows } = await db.query(
            'SELECT producto_id, producto_codigo, producto_nombre, producto_stock_actual, producto_tipo_control_stock FROM public.producto WHERE producto_id = $1',
            [producto_id]
        );
        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const producto = prodRows[0];

        let stockDisponible = Number(producto.producto_stock_actual || 0);
        let loteInfo = null;

        if (lote_id) {
            const { rows: loteRows } = await db.query(
                'SELECT lote_id, lote_codigo, lote_cantidad_disponible, lote_costo_unitario FROM public.lote WHERE lote_id = $1 AND producto_id = $2',
                [lote_id, producto_id]
            );
            if (loteRows.length === 0) {
                return res.status(400).json({ message: 'El lote seleccionado no corresponde al producto indicado' });
            }
            loteInfo = loteRows[0];
            stockDisponible = Number(loteInfo.lote_cantidad_disponible || 0);
        }

        const suficiente = cantSolicitada <= 0 ? stockDisponible > 0 : stockDisponible >= cantSolicitada;
        const puedeAutorizarExcepcion = tienePermiso(req.user?.rol_nombre, 'movimientos', 'autorizar_excepcion');

        res.json({
            producto_id: Number(producto_id),
            producto_codigo: producto.producto_codigo,
            producto_nombre: producto.producto_nombre,
            lote_id: loteInfo ? loteInfo.lote_id : null,
            lote_codigo: loteInfo ? loteInfo.lote_codigo : null,
            stock_disponible: stockDisponible,
            cantidad_solicitada: cantSolicitada,
            suficiente,
            diferencia: Number((stockDisponible - cantSolicitada).toFixed(2)),
            requiere_excepcion: cantSolicitada > 0 && !suficiente,
            puede_autorizar_excepcion: puedeAutorizarExcepcion
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al validar disponibilidad de stock', error: error.message });
    }
};

// CU 11 (Subflujos CU 12, CU 13 y CU 44): Registrar salida de inventario con motivo y validación de existencias
const registrarSalida = async (req, res) => {
    const {
        lote_id = null,
        producto_id,
        cantidad,
        motivo,
        motivo_catalogo_id = null,
        motivo_codigo = null,
        fecha = new Date().toISOString(),
        observacion = null,
        autorizacion_excepcional = false,
        referencia_autorizacion = null
    } = req.body;

    const cantidadSalida = Number(cantidad);

    if (!producto_id || !cantidad || !motivo) {
        return res.status(400).json({ message: 'Debe indicar producto, cantidad y tipo/motivo de salida' });
    }
    if (!MOTIVOS_SALIDA_PERMITIDOS.includes(motivo)) {
        return res.status(400).json({ message: 'Tipo de salida no válido (debe ser venta, consumo_interno, merma o descarte)' });
    }
    if (!Number.isFinite(cantidadSalida) || cantidadSalida <= 0) {
        return res.status(400).json({ message: 'La cantidad de salida debe ser mayor que cero' });
    }

    // Subflujo CU 13: Clasificando Motivo de Salida (obligatorio para salidas distintas de venta)
    if (motivo !== 'venta' && !motivo_catalogo_id && !motivo_codigo) {
        return res.status(400).json({
            message: 'Para salidas no asociadas a venta (consumo interno, merma o descarte) es obligatorio seleccionar un motivo clasificado del catálogo permitido (CU 13)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Verificar producto
        const { rows: prodRows } = await client.query(`
            SELECT producto_id, producto_codigo, producto_nombre, producto_precio, producto_stock_actual, producto_tipo_control_stock
            FROM public.producto
            WHERE producto_id = $1
            FOR UPDATE
        `, [producto_id]);

        if (prodRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const producto = prodRows[0];

        if (producto.producto_tipo_control_stock === 'lote' && !lote_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Este producto tiene control de stock por lote; debe seleccionar el lote de salida'
            });
        }

        // Subflujo CU 13: Validar que el motivo pertenezca al catálogo activo
        let motivoCatalogo = null;
        if (motivo !== 'venta') {
            let catQuery = "SELECT * FROM public.catalogo_motivo WHERE motivo_id = $1 AND motivo_estado = 'activo'";
            let catParam = [motivo_catalogo_id];
            if (!motivo_catalogo_id && motivo_codigo) {
                catQuery = "SELECT * FROM public.catalogo_motivo WHERE UPPER(motivo_codigo) = UPPER($1) AND motivo_estado = 'activo'";
                catParam = [String(motivo_codigo).trim()];
            }
            const { rows: catRows } = await client.query(catQuery, catParam);
            if (catRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'El motivo seleccionado no pertenece al catálogo activo permitido'
                });
            }
            motivoCatalogo = catRows[0];
            if (motivoCatalogo.motivo_categoria !== motivo && motivoCatalogo.motivo_categoria !== 'salida') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El motivo del catálogo "${motivoCatalogo.motivo_nombre}" no corresponde al tipo de salida "${motivo}"`
                });
            }
        }

        let lote = null;
        let stockDisponible = Number(producto.producto_stock_actual || 0);

        if (lote_id) {
            const { rows: loteRows } = await client.query(`
                SELECT lote_id, lote_codigo, producto_id, proveedor_id, lote_cantidad_disponible, COALESCE(lote_costo_unitario, 0) AS lote_costo_unitario
                FROM public.lote
                WHERE lote_id = $1 AND producto_id = $2
                FOR UPDATE
            `, [lote_id, producto_id]);

            if (loteRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'El lote no corresponde al producto seleccionado' });
            }
            lote = loteRows[0];
            stockDisponible = Number(lote.lote_cantidad_disponible || 0);
        }

        // Subflujo CU 44: Validando disponibilidad de stock y excepción autorizada por rol
        let esExcepcion = false;
        let refAutorizacionLimpia = null;

        if (stockDisponible < cantidadSalida) {
            const puedeExcepcion = tienePermiso(req.user?.rol_nombre, 'movimientos', 'autorizar_excepcion');

            if (!autorizacion_excepcional || !puedeExcepcion) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `Stock insuficiente en tiempo real (disponible: ${stockDisponible}, solicitado: ${cantidadSalida}). Operación bloqueada (CU 44).`
                });
            }

            if (!referencia_autorizacion || !String(referencia_autorizacion).trim() || !observacion || !String(observacion).trim()) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'Para aplicar una regularización excepcional de salida debe indicar obligatoriamente la referencia de autorización y la observación justificativa (CU 44)'
                });
            }

            esExcepcion = true;
            refAutorizacionLimpia = String(referencia_autorizacion).trim();
        }

        const costoUnitarioSalida = lote && Number(lote.lote_costo_unitario) > 0
            ? Number(lote.lote_costo_unitario)
            : Number(producto.producto_precio || 0);
        const costoTotalSalida = Number((cantidadSalida * costoUnitarioSalida).toFixed(2));

        if (lote) {
            await client.query(
                'UPDATE public.lote SET lote_cantidad_disponible = GREATEST(lote_cantidad_disponible - $1, 0) WHERE lote_id = $2',
                [cantidadSalida, lote.lote_id]
            );
        }

        await client.query(
            'UPDATE public.producto SET producto_stock_actual = GREATEST(producto_stock_actual - $1, 0), producto_actualizado_en = now() WHERE producto_id = $2',
            [cantidadSalida, producto_id]
        );

        const obsFinal = motivoCatalogo
            ? `[${motivoCatalogo.motivo_codigo} - ${motivoCatalogo.motivo_nombre}]${observacion ? ' ' + String(observacion).trim() : ''}`
            : (observacion ? String(observacion).trim() : null);

        const { rows } = await client.query(`
            INSERT INTO public.movimiento_stock
            (
                movimiento_tipo,
                movimiento_motivo,
                motivo_catalogo_id,
                movimiento_fecha,
                movimiento_cantidad,
                movimiento_costo_unitario,
                movimiento_costo_total,
                movimiento_observacion,
                es_excepcion_stock,
                referencia_autorizacion,
                producto_id,
                lote_id,
                proveedor_id,
                usuario_id
            )
            VALUES ('salida', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING movimiento_id
        `, [
            motivo,
            motivoCatalogo ? motivoCatalogo.motivo_id : null,
            fecha,
            cantidadSalida,
            costoUnitarioSalida,
            costoTotalSalida,
            obsFinal,
            esExcepcion,
            refAutorizacionLimpia,
            producto_id,
            lote ? lote.lote_id : null,
            lote ? lote.proveedor_id : null,
            req.user?.id || null
        ]);

        const movimientoId = rows[0].movimiento_id;

        // Subflujo CU 27: Si la salida es por venta, verificar y descontar automáticamente los insumos de la receta (si aplica)
        let resultadoReceta = { tiene_receta: false, descuentos: [], alertas_stock: [] };
        if (motivo === 'venta') {
            resultadoReceta = await descontarInsumosRecetaPorVenta(client, {
                productoId: Number(producto_id),
                cantidadVendida: cantidadSalida,
                usuarioId: req.user?.id || null,
                referenciaVenta: `Venta folio mov #${movimientoId} (${producto.producto_codigo} x ${cantidadSalida})`
            });

            if (resultadoReceta.ok === false) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: resultadoReceta.mensaje,
                    insumos_insuficientes: resultadoReceta.insumos_insuficientes
                });
            }
        }

        // Si la salida es por merma, registrar también en la tabla estructurada public.merma (CU 13)
        if (motivo === 'merma') {
            const enumMotivo = mapearCodigoMotivoAEnumMerma(
                motivoCatalogo?.motivo_codigo,
                motivoCatalogo?.motivo_nombre
            );
            await client.query(`
                INSERT INTO public.merma
                (
                    merma_cantidad,
                    merma_fecha,
                    merma_motivo,
                    motivo_catalogo_id,
                    merma_observacion,
                    merma_costo_unitario,
                    merma_costo_total,
                    producto_id,
                    lote_id,
                    insumo_id,
                    usuario_id,
                    movimiento_id
                )
                VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10)
            `, [
                cantidadSalida,
                enumMotivo,
                motivoCatalogo ? motivoCatalogo.motivo_id : null,
                obsFinal ? obsFinal.slice(0, 255) : null,
                costoUnitarioSalida,
                costoTotalSalida,
                producto_id,
                lote ? lote.lote_id : null,
                req.user?.id || null,
                movimientoId
            ]);
        }

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: esExcepcion ? 'salida_excepcional_autorizada' : 'salida_inventario',
            modulo: 'movimientos',
            accion: esExcepcion ? 'REGISTRAR_SALIDA_EXCEPCIONAL' : 'REGISTRAR_SALIDA',
            resultado: 'exitoso',
            detalle: `Salida (${motivo}) de ${cantidadSalida} en producto ${producto.producto_codigo}${lote ? ' lote ' + lote.lote_codigo : ''}. ${motivoCatalogo ? 'Motivo catálogo: ' + motivoCatalogo.motivo_codigo + '. ' : ''}${esExcepcion ? 'Autorización excepcional: ' + refAutorizacionLimpia : ''}`
        });

        res.status(201).json({
            message: esExcepcion
                ? 'Salida registrada con autorización excepcional y trazabilidad especial'
                : 'Salida de stock registrada correctamente',
            movimiento_id: movimientoId,
            es_excepcion_stock: esExcepcion,
            costo_total: costoTotalSalida,
            receta_aplicada: resultadoReceta.tiene_receta,
            insumos_descontados: resultadoReceta.descuentos,
            alertas_stock_insumos: resultadoReceta.alertas_stock
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar salida de stock', error: error.message });
    } finally {
        client.release();
    }
};

// =========================================================================
// CU 13 (Subflujos CU 18 y CU 50): Gestionar mermas y desperdicios
// =========================================================================
const registrarMerma = async (req, res) => {
    const {
        producto_id = null,
        lote_id = null,
        insumo_id = null,
        cantidad,
        motivo_catalogo_id = null,
        motivo_codigo = null,
        costo_unitario = null,
        fecha = new Date().toISOString(),
        observacion = null
    } = req.body;

    const cantidadPerdida = Number(cantidad);

    if (!producto_id && !insumo_id) {
        return res.status(400).json({ message: 'Debe seleccionar el producto/lote o insumo afectado por la merma' });
    }
    if (!Number.isFinite(cantidadPerdida) || cantidadPerdida <= 0) {
        return res.status(400).json({ message: 'La cantidad perdida debe ser mayor que cero' });
    }
    if (!motivo_catalogo_id && !motivo_codigo) {
        return res.status(400).json({
            message: 'No se permiten mermas sin motivo clasificado. Seleccione un motivo del catálogo de mermas (CU 18 / CU 50)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Validar motivo en el catálogo predefinido de mermas
        let catQuery = "SELECT * FROM public.catalogo_motivo WHERE motivo_id = $1 AND motivo_estado = 'activo'";
        let catParam = [motivo_catalogo_id];
        if (!motivo_catalogo_id && motivo_codigo) {
            catQuery = "SELECT * FROM public.catalogo_motivo WHERE UPPER(motivo_codigo) = UPPER($1) AND motivo_estado = 'activo'";
            catParam = [String(motivo_codigo).trim()];
        }
        const { rows: catRows } = await client.query(catQuery, catParam);
        if (catRows.length === 0 || catRows[0].motivo_categoria !== 'merma') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'El motivo seleccionado no existe o no pertenece al catálogo activo de motivos de merma'
            });
        }
        const motivoCatalogo = catRows[0];
        const enumMotivo = mapearCodigoMotivoAEnumMerma(motivoCatalogo.motivo_codigo, motivoCatalogo.motivo_nombre);

        let costoUnitarioCalculado = costo_unitario !== null && costo_unitario !== undefined && costo_unitario !== ''
            ? Number(costo_unitario)
            : 0;
        let movimientoId = null;
        let descripcionItem = '';

        // Caso A: Merma sobre producto / lote
        if (producto_id) {
            const { rows: prodRows } = await client.query(
                'SELECT producto_id, producto_codigo, producto_nombre, producto_precio, producto_stock_actual, producto_tipo_control_stock FROM public.producto WHERE producto_id = $1 FOR UPDATE',
                [producto_id]
            );
            if (prodRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Producto no encontrado' });
            }
            const producto = prodRows[0];
            descripcionItem = `${producto.producto_codigo} - ${producto.producto_nombre}`;

            if (producto.producto_tipo_control_stock === 'lote' && !lote_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Debe seleccionar el lote afectado para registrar la merma de este producto' });
            }

            let lote = null;
            if (lote_id) {
                const { rows: loteRows } = await client.query(
                    'SELECT lote_id, lote_codigo, proveedor_id, lote_cantidad_disponible, COALESCE(lote_costo_unitario, 0) AS lote_costo_unitario FROM public.lote WHERE lote_id = $1 AND producto_id = $2 FOR UPDATE',
                    [lote_id, producto_id]
                );
                if (loteRows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'El lote seleccionado no corresponde al producto indicado' });
                }
                lote = loteRows[0];
                if (Number(lote.lote_cantidad_disponible) < cantidadPerdida) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        message: `Stock insuficiente en el lote ${lote.lote_codigo} para registrar la merma (disponible: ${lote.lote_cantidad_disponible})`
                    });
                }
                await client.query(
                    'UPDATE public.lote SET lote_cantidad_disponible = lote_cantidad_disponible - $1 WHERE lote_id = $2',
                    [cantidadPerdida, lote.lote_id]
                );
                if (!costoUnitarioCalculado || costoUnitarioCalculado <= 0) {
                    costoUnitarioCalculado = Number(lote.lote_costo_unitario) > 0
                        ? Number(lote.lote_costo_unitario)
                        : Number(producto.producto_precio || 0);
                }
            } else {
                if (Number(producto.producto_stock_actual) < cantidadPerdida) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        message: `Stock insuficiente del producto para registrar la merma (disponible: ${producto.producto_stock_actual})`
                    });
                }
                if (!costoUnitarioCalculado || costoUnitarioCalculado <= 0) {
                    costoUnitarioCalculado = Number(producto.producto_precio || 0);
                }
            }

            await client.query(
                'UPDATE public.producto SET producto_stock_actual = GREATEST(producto_stock_actual - $1, 0), producto_actualizado_en = now() WHERE producto_id = $2',
                [cantidadPerdida, producto_id]
            );

            const costoTotal = Number((cantidadPerdida * costoUnitarioCalculado).toFixed(2));
            const obsTexto = `[${motivoCatalogo.motivo_codigo} - ${motivoCatalogo.motivo_nombre}]${observacion ? ' ' + String(observacion).trim() : ''}`;

            const { rows: movRows } = await client.query(`
                INSERT INTO public.movimiento_stock
                (
                    movimiento_tipo,
                    movimiento_motivo,
                    motivo_catalogo_id,
                    movimiento_fecha,
                    movimiento_cantidad,
                    movimiento_costo_unitario,
                    movimiento_costo_total,
                    movimiento_observacion,
                    producto_id,
                    lote_id,
                    proveedor_id,
                    usuario_id
                )
                VALUES ('salida', 'merma', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING movimiento_id
            `, [
                motivoCatalogo.motivo_id,
                fecha,
                cantidadPerdida,
                costoUnitarioCalculado,
                costoTotal,
                obsTexto,
                producto_id,
                lote ? lote.lote_id : null,
                lote ? lote.proveedor_id : null,
                req.user?.id || null
            ]);
            movimientoId = movRows[0].movimiento_id;
        }

        // Caso B: Merma sobre insumo directo (CU 50)
        if (!producto_id && insumo_id) {
            const { rows: insRows } = await client.query(
                'SELECT insumo_id, insumo_nombre, insumo_stock_actual FROM public.insumo WHERE insumo_id = $1 FOR UPDATE',
                [insumo_id]
            );
            if (insRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Insumo no encontrado' });
            }
            const insumo = insRows[0];
            descripcionItem = `Insumo: ${insumo.insumo_nombre}`;

            if (Number(insumo.insumo_stock_actual) < cantidadPerdida) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `Stock insuficiente del insumo "${insumo.insumo_nombre}" (disponible: ${insumo.insumo_stock_actual})`
                });
            }

            await client.query(
                'UPDATE public.insumo SET insumo_stock_actual = GREATEST(insumo_stock_actual - $1, 0) WHERE insumo_id = $2',
                [Math.round(cantidadPerdida), insumo_id]
            );
        }

        const costoTotalFinal = Number((cantidadPerdida * costoUnitarioCalculado).toFixed(2));
        const fechaSoloDia = String(fecha).slice(0, 10);

        const { rows: mermaRows } = await client.query(`
            INSERT INTO public.merma
            (
                merma_cantidad,
                merma_fecha,
                merma_motivo,
                motivo_catalogo_id,
                merma_observacion,
                merma_costo_unitario,
                merma_costo_total,
                producto_id,
                lote_id,
                insumo_id,
                usuario_id,
                movimiento_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            cantidadPerdida,
            fechaSoloDia,
            enumMotivo,
            motivoCatalogo.motivo_id,
            observacion ? String(observacion).trim().slice(0, 255) : motivoCatalogo.motivo_nombre,
            costoUnitarioCalculado,
            costoTotalFinal,
            producto_id || null,
            lote_id || null,
            insumo_id || null,
            req.user?.id || null,
            movimientoId
        ]);

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'registro_merma_inventario',
            modulo: 'mermas',
            accion: 'REGISTRAR_MERMA',
            resultado: 'exitoso',
            detalle: `Merma registrada (${motivoCatalogo.motivo_codigo} - ${motivoCatalogo.motivo_nombre}) en ${descripcionItem}. Cantidad: ${cantidadPerdida}, Costo pérdida: $${costoTotalFinal}`
        });

        res.status(201).json({
            message: 'Merma registrada, clasificada y descontada del inventario con su costo asociado',
            merma: mermaRows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar merma', error: error.message });
    } finally {
        client.release();
    }
};

// Obtener listado y resumen valorizado de mermas (Panel de mermas e informe de costos por merma - CU 50)
const obtenerMermas = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                me.merma_id,
                me.merma_cantidad,
                me.merma_fecha,
                me.merma_motivo::text AS merma_motivo,
                me.motivo_catalogo_id,
                cm.motivo_codigo,
                cm.motivo_nombre AS motivo_catalogo_nombre,
                me.merma_observacion,
                COALESCE(me.merma_costo_unitario, 0) AS merma_costo_unitario,
                COALESCE(me.merma_costo_total, 0) AS merma_costo_total,
                me.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                um.unidad_medida_codigo,
                me.lote_id,
                l.lote_codigo,
                me.insumo_id,
                ins.insumo_nombre,
                me.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                u.usuario_correo,
                me.movimiento_id,
                me.creado_en
            FROM public.merma me
            LEFT JOIN public.catalogo_motivo cm ON cm.motivo_id = me.motivo_catalogo_id
            LEFT JOIN public.producto p ON p.producto_id = me.producto_id
            LEFT JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.lote l ON l.lote_id = me.lote_id
            LEFT JOIN public.insumo ins ON ins.insumo_id = me.insumo_id
            LEFT JOIN public.usuario u ON u.usuario_id = me.usuario_id
            ORDER BY me.merma_fecha DESC, me.merma_id DESC
        `);

        const resumenPorMotivo = {};
        let costoTotalAcumulado = 0;
        let cantidadTotalPerdida = 0;

        for (const r of rows) {
            const clave = r.motivo_catalogo_nombre || r.merma_motivo || 'Sin clasificar';
            const costo = Number(r.merma_costo_total || 0);
            const cant = Number(r.merma_cantidad || 0);
            costoTotalAcumulado += costo;
            cantidadTotalPerdida += cant;
            if (!resumenPorMotivo[clave]) {
                resumenPorMotivo[clave] = { motivo: clave, registros: 0, cantidad_total: 0, costo_total: 0 };
            }
            resumenPorMotivo[clave].registros += 1;
            resumenPorMotivo[clave].cantidad_total = Number((resumenPorMotivo[clave].cantidad_total + cant).toFixed(2));
            resumenPorMotivo[clave].costo_total = Number((resumenPorMotivo[clave].costo_total + costo).toFixed(2));
        }

        res.json({
            mermas: rows,
            resumen: {
                total_registros: rows.length,
                cantidad_total_perdida: Number(cantidadTotalPerdida.toFixed(2)),
                costo_total_acumulado: Number(costoTotalAcumulado.toFixed(2)),
                por_motivo: Object.values(resumenPorMotivo)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener mermas y costos', error: error.message });
    }
};

// CU 15 (Subflujos CU 17 y CU 42): Consultar historial de movimientos general y por producto con filtros combinados
const obtenerMovimientos = async (req, res) => {
    const {
        producto_id,
        fecha_desde,
        fecha_hasta,
        tipo,
        motivo,
        motivo_catalogo_id,
        lote_id,
        lote_codigo,
        proveedor_id,
        usuario_id,
        q = '',
        limite = 200,
        con_resumen
    } = req.query;

    // Validar rango de fechas (Subflujos CU 17 y CU 42)
    if (fecha_desde && fecha_hasta) {
        const fDesde = new Date(`${String(fecha_desde).slice(0, 10)}T00:00:00Z`);
        const fHasta = new Date(`${String(fecha_hasta).slice(0, 10)}T23:59:59Z`);
        if (Number.isNaN(fDesde.getTime()) || Number.isNaN(fHasta.getTime())) {
            return res.status(400).json({ message: 'Las fechas ingresadas para la consulta de movimientos no son válidas' });
        }
        if (fHasta < fDesde) {
            return res.status(400).json({
                message: 'El rango de fechas es inválido: la fecha final no puede ser menor que la fecha inicial (CU 15)'
            });
        }
    }

    const params = [];
    const condiciones = [];

    if (producto_id) {
        params.push(Number(producto_id));
        condiciones.push(`m.producto_id = $${params.length}`);
    }
    if (fecha_desde) {
        params.push(String(fecha_desde).slice(0, 10));
        condiciones.push(`m.movimiento_fecha::date >= $${params.length}::date`);
    }
    if (fecha_hasta) {
        params.push(String(fecha_hasta).slice(0, 10));
        condiciones.push(`m.movimiento_fecha::date <= $${params.length}::date`);
    }
    if (tipo && tipo !== 'todos') {
        params.push(String(tipo).trim().toLowerCase());
        condiciones.push(`m.movimiento_tipo = $${params.length}`);
    }
    if (motivo && motivo !== 'todos') {
        if (motivo === 'recepcion') {
            condiciones.push(`m.movimiento_tipo = 'ingreso'`);
        } else {
            params.push(String(motivo).trim().toLowerCase());
            condiciones.push(`m.movimiento_motivo = $${params.length}`);
        }
    }
    if (motivo_catalogo_id) {
        params.push(Number(motivo_catalogo_id));
        condiciones.push(`m.motivo_catalogo_id = $${params.length}`);
    }
    if (lote_id) {
        params.push(Number(lote_id));
        condiciones.push(`m.lote_id = $${params.length}`);
    }
    if (lote_codigo && String(lote_codigo).trim()) {
        params.push(`%${String(lote_codigo).trim().toLowerCase()}%`);
        condiciones.push(`LOWER(l.lote_codigo) LIKE $${params.length}`);
    }
    if (proveedor_id) {
        params.push(Number(proveedor_id));
        condiciones.push(`m.proveedor_id = $${params.length}`);
    }
    if (usuario_id) {
        params.push(Number(usuario_id));
        condiciones.push(`(m.usuario_id = $${params.length} OR m.responsable_recepcion_id = $${params.length})`);
    }
    if (q && String(q).trim()) {
        params.push(`%${String(q).trim().toLowerCase()}%`);
        const idx = params.length;
        condiciones.push(`(
            LOWER(p.producto_codigo) LIKE $${idx} OR
            LOWER(p.producto_nombre) LIKE $${idx} OR
            LOWER(COALESCE(l.lote_codigo, '')) LIKE $${idx} OR
            LOWER(COALESCE(pr.proveedor_nombre, '')) LIKE $${idx} OR
            LOWER(COALESCE(m.movimiento_documento_respaldo, '')) LIKE $${idx} OR
            LOWER(COALESCE(m.movimiento_observacion, '')) LIKE $${idx} OR
            LOWER(COALESCE(cm.motivo_nombre, '')) LIKE $${idx}
        )`);
    }

    const limNum = Math.min(Math.max(parseInt(limite, 10) || 200, 1), 1000);
    params.push(limNum);
    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const { rows } = await db.query(`
            SELECT
                m.movimiento_id,
                m.movimiento_tipo,
                m.movimiento_motivo,
                m.motivo_catalogo_id,
                cm.motivo_codigo,
                cm.motivo_nombre AS motivo_catalogo_nombre,
                m.movimiento_fecha,
                m.movimiento_cantidad,
                m.movimiento_costo_unitario,
                m.movimiento_costo_total,
                m.movimiento_documento_respaldo,
                m.movimiento_estado_recepcion,
                m.movimiento_observacion,
                m.es_excepcion_stock,
                m.referencia_autorizacion,
                m.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                um.unidad_medida_codigo,
                m.lote_id,
                l.lote_codigo,
                m.proveedor_id,
                pr.proveedor_nombre,
                m.usuario_id,
                m.responsable_recepcion_id,
                u.usuario_correo,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                TRIM(CONCAT(ur.usuario_nombres, ' ', ur.usuario_apellido_paterno)) AS responsable_recepcion_nombre
            FROM public.movimiento_stock m
            JOIN public.producto p ON p.producto_id = m.producto_id
            LEFT JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.catalogo_motivo cm ON cm.motivo_id = m.motivo_catalogo_id
            LEFT JOIN public.lote l ON l.lote_id = m.lote_id
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = m.proveedor_id
            LEFT JOIN public.usuario u ON u.usuario_id = m.usuario_id
            LEFT JOIN public.usuario ur ON ur.usuario_id = m.responsable_recepcion_id
            ${whereSql}
            ORDER BY m.movimiento_fecha DESC, m.movimiento_id DESC
            LIMIT $${params.length}
        `, params);

        if (con_resumen === 'true') {
            let totalIngresosCant = 0;
            let totalSalidasCant = 0;
            let totalIngresosCosto = 0;
            let totalSalidasCosto = 0;

            for (const r of rows) {
                const cant = Number(r.movimiento_cantidad || 0);
                const costo = Number(r.movimiento_costo_total || 0);
                if (r.movimiento_tipo === 'ingreso') {
                    totalIngresosCant += cant;
                    totalIngresosCosto += costo;
                } else {
                    totalSalidasCant += cant;
                    totalSalidasCosto += costo;
                }
            }

            return res.json({
                filtros_aplicados: {
                    producto_id: producto_id ? Number(producto_id) : null,
                    fecha_desde: fecha_desde || null,
                    fecha_hasta: fecha_hasta || null,
                    tipo: tipo || 'todos',
                    motivo: motivo || 'todos',
                    lote_id: lote_id ? Number(lote_id) : null,
                    lote_codigo: lote_codigo || null,
                    proveedor_id: proveedor_id ? Number(proveedor_id) : null,
                    usuario_id: usuario_id ? Number(usuario_id) : null,
                    q: q || null
                },
                resumen: {
                    total_movimientos: rows.length,
                    unidades_ingresadas: Number(totalIngresosCant.toFixed(2)),
                    unidades_salidas: Number(totalSalidasCant.toFixed(2)),
                    balance_unidades: Number((totalIngresosCant - totalSalidasCant).toFixed(2)),
                    costo_total_ingresos: Number(totalIngresosCosto.toFixed(2)),
                    costo_total_salidas: Number(totalSalidasCosto.toFixed(2))
                },
                movimientos: rows
            });
        }

        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener movimientos', error: error.message });
    }
};

// =========================================================================
// CU 18: Administrar catálogos operativos (Subflujos CU 45, CU 46, CU 47, CU 54)
// =========================================================================
const crearMotivoCatalogo = async (req, res) => {
    const {
        codigo,
        nombre,
        categoria,
        descripcion = '',
        estado = 'activo'
    } = req.body;

    if (!codigo || !nombre || !categoria) {
        return res.status(400).json({
            message: 'Debe indicar identificador (código), nombre y categoría para crear el motivo del catálogo (CU 45)'
        });
    }

    const catLimpia = String(categoria).trim().toLowerCase();
    if (!CATEGORIAS_CATALOGO_PERMITIDAS.includes(catLimpia)) {
        return res.status(400).json({
            message: `Categoría de catálogo no válida (${CATEGORIAS_CATALOGO_PERMITIDAS.join(', ')})`
        });
    }
    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de motivo no válido' });
    }

    const codLimpio = String(codigo).trim().toUpperCase();
    const nomLimpio = String(nombre).trim();
    const descLimpia = descripcion ? String(descripcion).trim() : null;

    try {
        const { rows: dup } = await db.query(
            'SELECT motivo_id FROM public.catalogo_motivo WHERE UPPER(motivo_codigo) = $1 OR LOWER(motivo_nombre) = LOWER($2)',
            [codLimpio, nomLimpio]
        );
        if (dup.length > 0) {
            return res.status(400).json({
                message: 'Ya existe un motivo en el catálogo con ese código o nombre (CU 45 / CU 54)'
            });
        }

        const { rows } = await db.query(`
            INSERT INTO public.catalogo_motivo
            (motivo_codigo, motivo_nombre, motivo_categoria, motivo_descripcion, motivo_estado)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [codLimpio, nomLimpio, catLimpia, descLimpia, estado]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_motivo_catalogo',
            modulo: 'movimientos',
            accion: 'CREAR_MOTIVO_CATALOGO',
            resultado: 'exitoso',
            detalle: `Motivo creado en catálogo operativo: ${codLimpio} - ${nomLimpio} (${catLimpia})`
        });

        res.status(201).json({
            message: 'Motivo registrado en el catálogo operativo correctamente (CU 45 / CU 54)',
            motivo: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear motivo del catálogo', error: error.message });
    }
};

const actualizarMotivoCatalogo = async (req, res) => {
    const { id } = req.params;
    const { codigo, nombre, categoria, descripcion, estado } = req.body;

    if (!nombre || !categoria) {
        return res.status(400).json({ message: 'Debe indicar nombre y categoría para actualizar el motivo (CU 46)' });
    }

    const catLimpia = String(categoria).trim().toLowerCase();
    if (!CATEGORIAS_CATALOGO_PERMITIDAS.includes(catLimpia)) {
        return res.status(400).json({ message: 'Categoría de catálogo no válida' });
    }
    if (estado !== undefined && !['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de motivo no válido' });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.catalogo_motivo WHERE motivo_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Motivo de catálogo no encontrado' });
        }
        const actual = actualRows[0];
        const codFinal = codigo ? String(codigo).trim().toUpperCase() : actual.motivo_codigo;
        const nomFinal = String(nombre).trim();
        const descFinal = descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : actual.motivo_descripcion;
        const estFinal = estado || actual.motivo_estado;

        const { rows: dup } = await db.query(
            'SELECT motivo_id FROM public.catalogo_motivo WHERE (UPPER(motivo_codigo) = $1 OR LOWER(motivo_nombre) = LOWER($2)) AND motivo_id <> $3',
            [codFinal, nomFinal, id]
        );
        if (dup.length > 0) {
            return res.status(400).json({ message: 'Ya existe otro motivo con ese código o nombre' });
        }

        const { rows } = await db.query(`
            UPDATE public.catalogo_motivo
            SET motivo_codigo = $1,
                motivo_nombre = $2,
                motivo_categoria = $3,
                motivo_descripcion = $4,
                motivo_estado = $5
            WHERE motivo_id = $6
            RETURNING *
        `, [codFinal, nomFinal, catLimpia, descFinal, estFinal, id]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'actualizacion_motivo_catalogo',
            modulo: 'movimientos',
            accion: 'MODIFICAR_MOTIVO_CATALOGO',
            resultado: 'exitoso',
            detalle: `Motivo ID ${id} actualizado: ${codFinal} - ${nomFinal} (${catLimpia}, estado: ${estFinal})`
        });

        res.json({
            message: 'Motivo del catálogo actualizado correctamente (CU 46)',
            motivo: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar motivo del catálogo', error: error.message });
    }
};

const cambiarEstadoMotivoCatalogo = async (req, res) => {
    const { id } = req.params;
    const { estado = 'inactivo' } = req.body;

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado no válido (debe ser activo o inactivo)' });
    }

    try {
        const { rows } = await db.query(`
            UPDATE public.catalogo_motivo
            SET motivo_estado = $1
            WHERE motivo_id = $2
            RETURNING *
        `, [estado, id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Motivo no encontrado en el catálogo' });
        }

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_estado_motivo_catalogo',
            modulo: 'movimientos',
            accion: estado === 'inactivo' ? 'INACTIVAR_MOTIVO_CATALOGO' : 'ACTIVAR_MOTIVO_CATALOGO',
            resultado: 'exitoso',
            detalle: `Motivo ${rows[0].motivo_codigo} (${rows[0].motivo_nombre}) cambiado a estado ${estado} (CU 47)`
        });

        res.json({
            message: `Motivo del catálogo ${estado === 'inactivo' ? 'inactivado' : 'activado'} correctamente preservando la integridad histórica (CU 47)`,
            motivo: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cambiar estado del motivo', error: error.message });
    }
};

// Subflujo CU 47: Bloquear eliminación física de motivos del catálogo y exigir inactivación lógica
const eliminarMotivoCatalogo = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: usoRows } = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM public.movimiento_stock WHERE motivo_catalogo_id = $1) +
                (SELECT COUNT(*)::int FROM public.merma WHERE motivo_catalogo_id = $1) +
                (SELECT COUNT(*)::int FROM public.ajuste_inventario WHERE motivo_catalogo_id = $1) AS total_usos
        `, [id]);

        const usos = Number(usoRows[0]?.total_usos || 0);
        return res.status(400).json({
            message: `No se permite la eliminación física de motivos del catálogo (${usos} registro(s) histórico(s) asociado(s)). Utilice la opción de inactivación lógica para preservar la integridad histórica (CU 47).`,
            usos_historicos: usos,
            sugerencia_accion: 'inactivar'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al validar eliminación de motivo', error: error.message });
    }
};

// =========================================================================
// CU 12: Ajustar inventario mediante conteo y transferencias (Subflujos CU 14, 15, 16, 43, 53)
// =========================================================================
const obtenerUmbralAjusteCritico = async () => {
    try {
        const { rows } = await db.query(
            "SELECT valor FROM public.configuracion_sistema WHERE clave = 'umbral_porcentaje_ajuste_critico' LIMIT 1"
        );
        const val = rows.length > 0 ? Number(rows[0].valor) : 10;
        return Number.isFinite(val) && val > 0 ? val : 10;
    } catch (_) {
        return 10;
    }
};

// Subflujos CU 15 y CU 53: Obtener hoja de toma de inventario físico e historial de conteos registrados
const obtenerConteosFisicos = async (req, res) => {
    try {
        const umbralCritico = await obtenerUmbralAjusteCritico();
        const { rows: conteos } = await db.query(`
            SELECT
                c.conteo_id,
                c.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                um.unidad_medida_codigo,
                c.lote_id,
                l.lote_codigo,
                c.ubicacion_id,
                ub.ubicacion_codigo,
                ub.ubicacion_nombre,
                c.stock_teorico,
                c.cantidad_observada,
                c.diferencia,
                c.porcentaje_diferencia,
                c.estado_conteo,
                c.observacion,
                c.fecha_conteo,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre
            FROM public.conteo_fisico c
            JOIN public.producto p ON p.producto_id = c.producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.lote l ON l.lote_id = c.lote_id
            LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = c.ubicacion_id
            LEFT JOIN public.usuario u ON u.usuario_id = c.usuario_id
            ORDER BY c.fecha_conteo DESC, c.conteo_id DESC
        `);

        res.json({
            umbral_porcentaje_ajuste_critico: umbralCritico,
            conteos
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener conteos físicos', error: error.message });
    }
};

// Subflujo CU 15: Registrar Conteo Físico y comparar con stock teórico
const registrarConteoFisico = async (req, res) => {
    const {
        producto_id,
        lote_id = null,
        cantidad_observada,
        observacion = null
    } = req.body;

    const cantObs = Number(cantidad_observada);
    if (!producto_id || cantidad_observada === undefined || cantidad_observada === null || cantidad_observada === '' || !Number.isFinite(cantObs) || cantObs < 0) {
        return res.status(400).json({
            message: 'Debe seleccionar el producto (o lote) e ingresar una cantidad física observada mayor o igual a cero (CU 15)'
        });
    }

    try {
        const umbralCritico = await obtenerUmbralAjusteCritico();
        const { rows: prodRows } = await db.query(
            'SELECT producto_id, producto_codigo, producto_nombre, producto_stock_actual FROM public.producto WHERE producto_id = $1',
            [producto_id]
        );
        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado para conteo físico' });
        }
        const producto = prodRows[0];

        let stockTeorico = Number(producto.producto_stock_actual || 0);
        let ubicacionId = null;

        if (lote_id) {
            const { rows: loteRows } = await db.query(
                'SELECT lote_id, lote_codigo, lote_cantidad_disponible, ubicacion_id FROM public.lote WHERE lote_id = $1 AND producto_id = $2',
                [lote_id, producto_id]
            );
            if (loteRows.length === 0) {
                return res.status(400).json({ message: 'El lote seleccionado no corresponde al producto indicado' });
            }
            stockTeorico = Number(loteRows[0].lote_cantidad_disponible || 0);
            ubicacionId = loteRows[0].ubicacion_id || null;
        }

        const diferencia = Number((cantObs - stockTeorico).toFixed(2));
        const baseCalculo = stockTeorico > 0 ? stockTeorico : (cantObs > 0 ? cantObs : 1);
        const porcentajeDif = Number(((Math.abs(diferencia) / baseCalculo) * 100).toFixed(2));
        const estadoConteo = diferencia === 0 ? 'cuadrado' : 'pendiente_ajuste';
        const requiereAjusteCritico = diferencia !== 0 && (porcentajeDif >= umbralCritico || stockTeorico === 0);

        const { rows } = await db.query(`
            INSERT INTO public.conteo_fisico
            (
                producto_id,
                lote_id,
                ubicacion_id,
                stock_teorico,
                cantidad_observada,
                diferencia,
                porcentaje_diferencia,
                estado_conteo,
                observacion,
                usuario_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            producto_id,
            lote_id || null,
            ubicacionId,
            stockTeorico,
            cantObs,
            diferencia,
            porcentajeDif,
            estadoConteo,
            observacion ? String(observacion).trim() : null,
            req.user?.id || null
        ]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'registro_conteo_fisico',
            modulo: 'movimientos',
            accion: 'REGISTRAR_CONTEO_FISICO',
            resultado: 'exitoso',
            detalle: `Conteo físico #${rows[0].conteo_id} en ${producto.producto_codigo}: Teórico=${stockTeorico}, Observado=${cantObs}, Diferencia=${diferencia} (${porcentajeDif}%)`
        });

        res.status(201).json({
            message: diferencia === 0
                ? 'Conteo físico registrado: inventario cuadrado sin diferencias (CU 15)'
                : `Conteo físico registrado con diferencia de ${diferencia > 0 ? '+' : ''}${diferencia} (${porcentajeDif}%). Disponible para generar ajuste correctivo (CU 15).`,
            conteo: rows[0],
            requiere_observacion_critica: requiereAjusteCritico,
            umbral_critico: umbralCritico
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar conteo físico', error: error.message });
    }
};

// Subflujos CU 14 y CU 43: Registrar Ajuste de Inventario con validación de impacto porcentual y observación crítica
const obtenerAjustesInventario = async (req, res) => {
    try {
        const umbralCritico = await obtenerUmbralAjusteCritico();
        const { rows } = await db.query(`
            SELECT
                a.ajuste_id,
                a.conteo_id,
                a.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                um.unidad_medida_codigo,
                a.lote_id,
                l.lote_codigo,
                a.motivo_catalogo_id,
                cm.motivo_codigo,
                cm.motivo_nombre AS motivo_catalogo_nombre,
                a.stock_anterior,
                a.stock_nuevo,
                a.diferencia,
                a.porcentaje_impacto,
                a.es_ajuste_critico,
                a.observacion,
                a.movimiento_id,
                a.fecha_ajuste,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre
            FROM public.ajuste_inventario a
            JOIN public.producto p ON p.producto_id = a.producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.lote l ON l.lote_id = a.lote_id
            LEFT JOIN public.catalogo_motivo cm ON cm.motivo_id = a.motivo_catalogo_id
            LEFT JOIN public.usuario u ON u.usuario_id = a.usuario_id
            ORDER BY a.fecha_ajuste DESC, a.ajuste_id DESC
        `);
        res.json({
            umbral_porcentaje_ajuste_critico: umbralCritico,
            ajustes: rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener ajustes de inventario', error: error.message });
    }
};

const registrarAjusteInventario = async (req, res) => {
    const {
        conteo_id = null,
        producto_id,
        lote_id = null,
        stock_objetivo,
        diferencia_ajuste,
        motivo_catalogo_id,
        observacion = ''
    } = req.body;

    if (!producto_id || !motivo_catalogo_id) {
        return res.status(400).json({
            message: 'Debe indicar el producto afectado y seleccionar un motivo obligatorio del catálogo para realizar el ajuste (CU 14)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const umbralCritico = await obtenerUmbralAjusteCritico();

        const { rows: catRows } = await client.query(
            "SELECT * FROM public.catalogo_motivo WHERE motivo_id = $1 AND motivo_estado = 'activo'",
            [motivo_catalogo_id]
        );
        if (catRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'El motivo seleccionado no existe o se encuentra inactivo en el catálogo operativo (CU 14 / CU 18)'
            });
        }
        const motivoCat = catRows[0];

        const { rows: prodRows } = await client.query(
            'SELECT producto_id, producto_codigo, producto_nombre, producto_precio, producto_stock_actual, producto_tipo_control_stock FROM public.producto WHERE producto_id = $1 FOR UPDATE',
            [producto_id]
        );
        if (prodRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const producto = prodRows[0];

        let lote = null;
        let stockAnterior = Number(producto.producto_stock_actual || 0);

        if (lote_id) {
            const { rows: loteRows } = await client.query(
                'SELECT lote_id, lote_codigo, lote_cantidad_disponible, lote_costo_unitario, proveedor_id FROM public.lote WHERE lote_id = $1 AND producto_id = $2 FOR UPDATE',
                [lote_id, producto_id]
            );
            if (loteRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'El lote seleccionado no pertenece al producto indicado' });
            }
            lote = loteRows[0];
            stockAnterior = Number(lote.lote_cantidad_disponible || 0);
        }

        let stockNuevo = null;
        let diferencia = null;

        if (stock_objetivo !== undefined && stock_objetivo !== null && stock_objetivo !== '') {
            stockNuevo = Number(stock_objetivo);
            diferencia = Number((stockNuevo - stockAnterior).toFixed(2));
        } else if (diferencia_ajuste !== undefined && diferencia_ajuste !== null && diferencia_ajuste !== '') {
            diferencia = Number(diferencia_ajuste);
            stockNuevo = Number((stockAnterior + diferencia).toFixed(2));
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Debe indicar el nuevo stock físico o la diferencia a ajustar (CU 14)' });
        }

        if (!Number.isFinite(stockNuevo) || stockNuevo < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El stock resultante del ajuste no puede ser negativo (CU 14)' });
        }
        if (diferencia === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'La diferencia del ajuste es cero; no hay modificación de stock que aplicar' });
        }

        // Subflujo CU 43: Calcular impacto porcentual respecto del stock teórico y comparar con umbral configurado
        const baseRef = stockAnterior > 0 ? stockAnterior : (stockNuevo > 0 ? stockNuevo : 1);
        const porcentajeImpacto = Number(((Math.abs(diferencia) / baseRef) * 100).toFixed(2));
        const esAjusteCritico = porcentajeImpacto >= umbralCritico || stockAnterior === 0;
        const obsLimpia = String(observacion || '').trim();

        if (esAjusteCritico && obsLimpia.length < 10) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Ajuste crítico detectado: la variación de ${porcentajeImpacto}% supera el umbral configurado (${umbralCritico}%). Debe ingresar una observación justificativa detallada de al menos 10 caracteres (CU 43).`,
                es_ajuste_critico: true,
                porcentaje_impacto: porcentajeImpacto,
                umbral_configurado: umbralCritico
            });
        }
        if (!obsLimpia) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Todo ajuste de inventario requiere una justificación u observación asociada (CU 14)'
            });
        }

        if (lote) {
            await client.query(
                'UPDATE public.lote SET lote_cantidad_disponible = $1 WHERE lote_id = $2',
                [stockNuevo, lote.lote_id]
            );
            await client.query(
                'UPDATE public.producto SET producto_stock_actual = GREATEST(producto_stock_actual + $1, 0), producto_actualizado_en = now() WHERE producto_id = $2',
                [diferencia, producto_id]
            );
        } else {
            await client.query(
                'UPDATE public.producto SET producto_stock_actual = $1, producto_actualizado_en = now() WHERE producto_id = $2',
                [stockNuevo, producto_id]
            );
        }

        const tipoMov = diferencia > 0 ? 'ingreso' : 'salida';
        const cantAbs = Math.abs(diferencia);
        const costoUnit = lote && Number(lote.lote_costo_unitario) > 0
            ? Number(lote.lote_costo_unitario)
            : Number(producto.producto_precio || 0);
        const costoTotal = Number((cantAbs * costoUnit).toFixed(2));

        const detalleMov = `[AJUSTE INVENTARIO ${esAjusteCritico ? 'CRÍTICO ' : ''}${diferencia > 0 ? '+' : ''}${diferencia} (${porcentajeImpacto}%) · ${motivoCat.motivo_codigo}] ${obsLimpia}`;

        const { rows: movRows } = await client.query(`
            INSERT INTO public.movimiento_stock
            (
                movimiento_tipo,
                movimiento_motivo,
                motivo_catalogo_id,
                movimiento_fecha,
                movimiento_cantidad,
                movimiento_costo_unitario,
                movimiento_costo_total,
                movimiento_observacion,
                producto_id,
                lote_id,
                proveedor_id,
                usuario_id
            )
            VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING movimiento_id
        `, [
            tipoMov,
            tipoMov === 'salida' ? 'descarte' : null,
            motivoCat.motivo_id,
            cantAbs,
            costoUnit,
            costoTotal,
            detalleMov,
            producto_id,
            lote ? lote.lote_id : null,
            lote ? lote.proveedor_id : null,
            req.user?.id || null
        ]);

        const { rows: ajuRows } = await client.query(`
            INSERT INTO public.ajuste_inventario
            (
                conteo_id,
                producto_id,
                lote_id,
                motivo_catalogo_id,
                stock_anterior,
                stock_nuevo,
                diferencia,
                porcentaje_impacto,
                es_ajuste_critico,
                observacion,
                usuario_id,
                movimiento_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            conteo_id || null,
            producto_id,
            lote ? lote.lote_id : null,
            motivoCat.motivo_id,
            stockAnterior,
            stockNuevo,
            diferencia,
            porcentajeImpacto,
            esAjusteCritico,
            obsLimpia,
            req.user?.id || null,
            movRows[0].movimiento_id
        ]);

        if (conteo_id) {
            await client.query(
                "UPDATE public.conteo_fisico SET estado_conteo = 'ajustado' WHERE conteo_id = $1",
                [conteo_id]
            );
        }

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: esAjusteCritico ? 'ajuste_critico_inventario' : 'ajuste_inventario',
            modulo: 'movimientos',
            accion: 'REGISTRAR_AJUSTE_INVENTARIO',
            resultado: 'exitoso',
            detalle: `${detalleMov} (Stock: ${stockAnterior} -> ${stockNuevo})`
        });

        res.status(201).json({
            message: esAjusteCritico
                ? 'Ajuste crítico de inventario registrado con observación detallada y trazabilidad (CU 14 / CU 43)'
                : 'Ajuste correctivo de inventario registrado correctamente (CU 14)',
            ajuste: ajuRows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar ajuste de inventario', error: error.message });
    } finally {
        client.release();
    }
};

// Subflujo CU 16: Transfiriendo Internamente Inventario entre ubicaciones de bodega
const obtenerTransferenciasInternas = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                t.transferencia_id,
                t.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                um.unidad_medida_codigo,
                t.lote_origen_id,
                lo.lote_codigo AS lote_origen_codigo,
                t.lote_destino_id,
                ld.lote_codigo AS lote_destino_codigo,
                t.ubicacion_origen_id,
                uo.ubicacion_codigo AS ubicacion_origen_codigo,
                uo.ubicacion_nombre AS ubicacion_origen_nombre,
                t.ubicacion_destino_id,
                ud.ubicacion_codigo AS ubicacion_destino_codigo,
                ud.ubicacion_nombre AS ubicacion_destino_nombre,
                t.cantidad,
                t.observacion,
                t.fecha_transferencia,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre
            FROM public.transferencia_interna t
            JOIN public.producto p ON p.producto_id = t.producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.lote lo ON lo.lote_id = t.lote_origen_id
            LEFT JOIN public.lote ld ON ld.lote_id = t.lote_destino_id
            JOIN public.ubicacion_bodega uo ON uo.ubicacion_id = t.ubicacion_origen_id
            JOIN public.ubicacion_bodega ud ON ud.ubicacion_id = t.ubicacion_destino_id
            LEFT JOIN public.usuario u ON u.usuario_id = t.usuario_id
            ORDER BY t.fecha_transferencia DESC, t.transferencia_id DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener transferencias internas', error: error.message });
    }
};

const registrarTransferenciaInterna = async (req, res) => {
    const {
        producto_id,
        lote_id,
        ubicacion_origen_id,
        ubicacion_destino_id,
        cantidad,
        observacion = null
    } = req.body;

    const cantTransferir = Number(cantidad);
    if (!lote_id || !ubicacion_destino_id || !Number.isFinite(cantTransferir) || cantTransferir <= 0) {
        return res.status(400).json({
            message: 'Debe seleccionar el lote de origen, la ubicación de destino y una cantidad mayor a cero para transferir (CU 16)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: loteRows } = await client.query(`
            SELECT
                l.*,
                p.producto_codigo,
                p.producto_nombre
            FROM public.lote l
            JOIN public.producto p ON p.producto_id = l.producto_id
            WHERE l.lote_id = $1
            FOR UPDATE OF l
        `, [lote_id]);

        if (loteRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'El lote seleccionado para transferencia no existe' });
        }
        const loteOrigen = loteRows[0];
        const prodIdFinal = producto_id ? Number(producto_id) : Number(loteOrigen.producto_id);
        const ubiOrigenIdFinal = ubicacion_origen_id ? Number(ubicacion_origen_id) : Number(loteOrigen.ubicacion_id);
        const ubiDestinoIdFinal = Number(ubicacion_destino_id);

        if (!ubiOrigenIdFinal) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Debe indicar la ubicación de origen del lote a transferir (CU 16)' });
        }

        // Validar que origen y destino sean distintos (Subflujo CU 16)
        if (ubiOrigenIdFinal === ubiDestinoIdFinal) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'La ubicación de destino debe ser distinta a la ubicación de origen (CU 16)'
            });
        }

        // Validar que ambas ubicaciones existan y estén activas
        const { rows: ubiRows } = await client.query(
            "SELECT ubicacion_id, ubicacion_codigo, ubicacion_nombre FROM public.ubicacion_bodega WHERE ubicacion_id IN ($1, $2) AND ubicacion_estado = 'activo'",
            [ubiOrigenIdFinal, ubiDestinoIdFinal]
        );
        if (ubiRows.length < 2) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Tanto la ubicación de origen como la ubicación de destino deben existir y encontrarse activas (CU 16)'
            });
        }
        const ubiOrigen = ubiRows.find(u => Number(u.ubicacion_id) === ubiOrigenIdFinal);
        const ubiDestino = ubiRows.find(u => Number(u.ubicacion_id) === ubiDestinoIdFinal);

        // Verificar stock disponible en origen (Subflujo CU 16)
        const dispOrigen = Number(loteOrigen.lote_cantidad_disponible || 0);
        if (dispOrigen < cantTransferir) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Stock insuficiente en la ubicación de origen (disponible en lote ${loteOrigen.lote_codigo}: ${dispOrigen}, solicitado transferir: ${cantTransferir}) (CU 16)`
            });
        }

        let loteDestinoId = loteOrigen.lote_id;

        if (cantTransferir === dispOrigen) {
            // Transferencia total del saldo disponible del lote a la nueva ubicación
            await client.query(
                'UPDATE public.lote SET ubicacion_id = $1 WHERE lote_id = $2',
                [ubiDestinoIdFinal, loteOrigen.lote_id]
            );
        } else {
            // Transferencia parcial: descontar en lote origen y trasladar al sub-lote en ubicación destino
            await client.query(
                'UPDATE public.lote SET lote_cantidad_disponible = lote_cantidad_disponible - $1 WHERE lote_id = $2',
                [cantTransferir, loteOrigen.lote_id]
            );

            const codigoSubLote = `${loteOrigen.lote_codigo}-${ubiDestino.ubicacion_codigo}`.slice(0, 50);
            const { rows: subExistente } = await client.query(
                'SELECT lote_id FROM public.lote WHERE lote_codigo = $1 AND producto_id = $2 AND ubicacion_id = $3 FOR UPDATE',
                [codigoSubLote, prodIdFinal, ubiDestinoIdFinal]
            );

            if (subExistente.length > 0) {
                loteDestinoId = subExistente[0].lote_id;
                await client.query(
                    'UPDATE public.lote SET lote_cantidad_ingresada = lote_cantidad_ingresada + $1, lote_cantidad_disponible = lote_cantidad_disponible + $1 WHERE lote_id = $2',
                    [cantTransferir, loteDestinoId]
                );
            } else {
                const { rows: nuevoSub } = await client.query(`
                    INSERT INTO public.lote
                    (
                        lote_codigo,
                        lote_cantidad_ingresada,
                        lote_cantidad_disponible,
                        lote_costo_unitario,
                        lote_documento_respaldo,
                        lote_estado_recepcion,
                        lote_fecha_recepcion,
                        lote_fecha_vencimiento,
                        producto_id,
                        proveedor_id,
                        ubicacion_id,
                        responsable_recepcion_id
                    )
                    VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING lote_id
                `, [
                    codigoSubLote,
                    cantTransferir,
                    loteOrigen.lote_costo_unitario || 0,
                    loteOrigen.lote_documento_respaldo,
                    loteOrigen.lote_estado_recepcion || 'conforme',
                    loteOrigen.lote_fecha_recepcion,
                    loteOrigen.lote_fecha_vencimiento,
                    prodIdFinal,
                    loteOrigen.proveedor_id,
                    ubiDestinoIdFinal,
                    req.user?.id || loteOrigen.responsable_recepcion_id
                ]);
                loteDestinoId = nuevoSub[0].lote_id;
            }
        }

        const { rows: transRows } = await client.query(`
            INSERT INTO public.transferencia_interna
            (
                producto_id,
                lote_origen_id,
                lote_destino_id,
                ubicacion_origen_id,
                ubicacion_destino_id,
                cantidad,
                observacion,
                usuario_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            prodIdFinal,
            loteOrigen.lote_id,
            loteDestinoId,
            ubiOrigenIdFinal,
            ubiDestinoIdFinal,
            cantTransferir,
            observacion ? String(observacion).trim() : null,
            req.user?.id || null
        ]);

        // Registrar trazabilidad en historial de movimientos sin alterar el stock global del producto (Documento 0 D.5)
        const detalleTrans = `[TRANSFERENCIA INTERNA #${transRows[0].transferencia_id}] Origen: ${ubiOrigen.ubicacion_codigo} (${ubiOrigen.ubicacion_nombre}) -> Destino: ${ubiDestino.ubicacion_codigo} (${ubiDestino.ubicacion_nombre}). Lote: ${loteOrigen.lote_codigo}.${observacion ? ' Obs: ' + String(observacion).trim() : ''}`;

        await client.query(`
            INSERT INTO public.movimiento_stock
            (
                movimiento_tipo,
                movimiento_fecha,
                movimiento_cantidad,
                movimiento_costo_unitario,
                movimiento_costo_total,
                movimiento_observacion,
                producto_id,
                lote_id,
                proveedor_id,
                usuario_id
            )
            VALUES ('ingreso', now(), $1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            cantTransferir,
            loteOrigen.lote_costo_unitario || 0,
            Number((cantTransferir * Number(loteOrigen.lote_costo_unitario || 0)).toFixed(2)),
            detalleTrans,
            prodIdFinal,
            loteDestinoId,
            loteOrigen.proveedor_id,
            req.user?.id || null
        ]);

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'transferencia_interna_inventario',
            modulo: 'movimientos',
            accion: 'TRANSFERIR_INVENTARIO_INTERNO',
            resultado: 'exitoso',
            detalle: detalleTrans
        });

        res.status(201).json({
            message: `Transferencia interna de ${cantTransferir} unidad(es) desde ${ubiOrigen.ubicacion_codigo} hacia ${ubiDestino.ubicacion_codigo} registrada correctamente (CU 16)`,
            transferencia: transRows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar transferencia interna', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerMotivosCatalogo,
    crearMotivoCatalogo,
    actualizarMotivoCatalogo,
    cambiarEstadoMotivoCatalogo,
    eliminarMotivoCatalogo,
    validarDisponibilidadStock,
    registrarIngreso,
    registrarSalida,
    registrarMerma,
    obtenerMermas,
    obtenerMovimientos,
    obtenerConteosFisicos,
    registrarConteoFisico,
    obtenerAjustesInventario,
    registrarAjusteInventario,
    obtenerTransferenciasInternas,
    registrarTransferenciaInterna
};
