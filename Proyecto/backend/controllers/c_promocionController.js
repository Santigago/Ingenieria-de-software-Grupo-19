const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

const TIPOS_DESCUENTO = ['porcentaje', 'monto_fijo', '2x1', 'combo'];
const AMBITOS_APLICA = ['total_venta', 'categoria', 'producto'];

// =============================================================================
// CU 22 (Subflujo CU 31): Consultar listado de promociones y descuentos
// =============================================================================
const obtenerPromociones = async (req, res) => {
    const { estado, tipo_descuento, solo_activas } = req.query;

    try {
        let sql = `
            SELECT
                p.*,
                c.categoria_nombre,
                COUNT(pp.producto_id)::int AS productos_asociados_count,
                (p.fecha_fin IS NULL OR p.fecha_fin >= now()) AND (p.fecha_inicio <= now()) AND (p.estado = 'activo') AS esta_vigente_hoy
            FROM public.promocion p
            LEFT JOIN public.categoria_producto c ON c.categoria_id = p.categoria_id
            LEFT JOIN public.promocion_producto pp ON pp.promocion_id = p.promocion_id
            WHERE 1=1
        `;
        const params = [];

        if (estado) {
            params.push(estado);
            sql += ` AND p.estado = $${params.length}`;
        }
        if (tipo_descuento) {
            params.push(tipo_descuento);
            sql += ` AND p.tipo_descuento = $${params.length}`;
        }
        if (solo_activas === 'true') {
            sql += ` AND p.estado = 'activo' AND (p.fecha_fin IS NULL OR p.fecha_fin >= now()) AND (p.fecha_inicio <= now())`;
        }

        sql += ` GROUP BY p.promocion_id, c.categoria_nombre ORDER BY p.creado_en DESC`;

        const { rows } = await db.query(sql, params);
        res.json(rows.map(r => ({
            ...r,
            valor_descuento: Number(r.valor_descuento || 0),
            monto_minimo_compra: Number(r.monto_minimo_compra || 0)
        })));
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar promociones comerciales', error: error.message });
    }
};

// =============================================================================
// CU 22 (Subflujo CU 31): Obtener detalle de una promoción específica
// =============================================================================
const obtenerPromocionPorId = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await db.query(`
            SELECT
                p.*,
                c.categoria_nombre
            FROM public.promocion p
            LEFT JOIN public.categoria_producto c ON c.categoria_id = p.categoria_id
            WHERE p.promocion_id = $1
        `, [Number(id)]);

        if (rows.length === 0) {
            return res.status(404).json({ message: `Promoción con ID ${id} no encontrada` });
        }

        const promo = rows[0];

        // Obtener productos específicos si aplica a nivel de producto
        const { rows: prods } = await db.query(`
            SELECT p.producto_id, p.producto_codigo, p.producto_nombre, p.producto_precio, p.producto_tipo_negocio
            FROM public.promocion_producto pp
            JOIN public.producto p ON p.producto_id = pp.producto_id
            WHERE pp.promocion_id = $1
            ORDER BY p.producto_nombre ASC
        `, [promo.promocion_id]);

        res.json({
            ...promo,
            valor_descuento: Number(promo.valor_descuento || 0),
            monto_minimo_compra: Number(promo.monto_minimo_compra || 0),
            productos_asociados: prods.map(p => ({ ...p, producto_precio: Number(p.producto_precio) }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener detalle de la promoción', error: error.message });
    }
};

// =============================================================================
// CU 22 (Subflujo CU 31): Crear nueva promoción o descuento comercial
// =============================================================================
const crearPromocion = async (req, res) => {
    const {
        promocion_codigo,
        promocion_nombre,
        promocion_descripcion = null,
        tipo_descuento = 'porcentaje',
        valor_descuento = 0,
        fecha_inicio = null,
        fecha_fin = null,
        es_acumulable = false,
        aplica_a = 'total_venta',
        categoria_id = null,
        monto_minimo_compra = 0,
        productos_ids = []
    } = req.body;

    if (!promocion_codigo || !promocion_nombre) {
        return res.status(400).json({ message: 'El código y nombre de la promoción son obligatorios (CU 31)' });
    }

    if (!TIPOS_DESCUENTO.includes(tipo_descuento)) {
        return res.status(400).json({ message: `Tipo de descuento inválido. Permitidos: ${TIPOS_DESCUENTO.join(', ')}` });
    }

    if (!AMBITOS_APLICA.includes(aplica_a)) {
        return res.status(400).json({ message: `Ámbito de aplicación inválido. Permitidos: ${AMBITOS_APLICA.join(', ')}` });
    }

    const valorNum = Number(valor_descuento);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
        return res.status(400).json({ message: 'El valor de descuento debe ser un número mayor o igual a cero' });
    }

    if (tipo_descuento === 'porcentaje' && valorNum > 100) {
        return res.status(400).json({ message: 'El descuento porcentual no puede exceder el 100%' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const codigoNorm = promocion_codigo.trim().toUpperCase();

        const { rows: existente } = await client.query(
            'SELECT promocion_id FROM public.promocion WHERE UPPER(promocion_codigo) = $1',
            [codigoNorm]
        );
        if (existente.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `Ya existe una promoción registrada con el código "${codigoNorm}"` });
        }

        const { rows: nueva } = await client.query(`
            INSERT INTO public.promocion (
                promocion_codigo,
                promocion_nombre,
                promocion_descripcion,
                tipo_descuento,
                valor_descuento,
                fecha_inicio,
                fecha_fin,
                es_acumulable,
                aplica_a,
                categoria_id,
                monto_minimo_compra,
                estado
            ) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, now()), $7::timestamp, $8, $9, $10, $11, 'activo')
            RETURNING *
        `, [
            codigoNorm,
            promocion_nombre.trim(),
            promocion_descripcion ? promocion_descripcion.trim() : null,
            tipo_descuento,
            valorNum,
            fecha_inicio,
            fecha_fin,
            Boolean(es_acumulable),
            aplica_a,
            categoria_id ? Number(categoria_id) : null,
            Number(monto_minimo_compra || 0)
        ]);

        const promoCreada = nueva[0];

        // Asociar productos si aplica a nivel de producto
        if (aplica_a === 'producto' && Array.isArray(productos_ids) && productos_ids.length > 0) {
            for (const pid of productos_ids) {
                await client.query(`
                    INSERT INTO public.promocion_producto (promocion_id, producto_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [promoCreada.promocion_id, Number(pid)]);
            }
        }

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_promocion',
            modulo: 'pos',
            accion: 'CREAR_PROMOCION',
            resultado: 'exitoso',
            detalle: `Promoción "${codigoNorm}" creada: Tipo=${tipo_descuento}, Valor=${valorNum}, Acumulable=${Boolean(es_acumulable)} (CU 31)`
        });

        res.status(201).json({
            message: `Promoción "${promoCreada.promocion_nombre}" (${codigoNorm}) creada exitosamente`,
            promocion: promoCreada
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar la promoción', error: error.message });
    } finally {
        client.release();
    }
};

// =============================================================================
// CU 22 (Subflujo CU 31): Actualizar datos de una promoción existente
// =============================================================================
const actualizarPromocion = async (req, res) => {
    const { id } = req.params;
    const {
        promocion_nombre,
        promocion_descripcion,
        tipo_descuento,
        valor_descuento,
        fecha_inicio,
        fecha_fin,
        es_acumulable,
        aplica_a,
        categoria_id,
        monto_minimo_compra
    } = req.body;

    try {
        const { rows } = await db.query(`
            UPDATE public.promocion
            SET promocion_nombre = COALESCE($1, promocion_nombre),
                promocion_descripcion = COALESCE($2, promocion_descripcion),
                tipo_descuento = COALESCE($3, tipo_descuento),
                valor_descuento = COALESCE($4, valor_descuento),
                fecha_inicio = COALESCE($5::timestamp, fecha_inicio),
                fecha_fin = $6::timestamp,
                es_acumulable = COALESCE($7, es_acumulable),
                aplica_a = COALESCE($8, aplica_a),
                categoria_id = $9,
                monto_minimo_compra = COALESCE($10, monto_minimo_compra),
                actualizado_en = now()
            WHERE promocion_id = $11
            RETURNING *
        `, [
            promocion_nombre,
            promocion_descripcion,
            tipo_descuento,
            valor_descuento !== undefined ? Number(valor_descuento) : null,
            fecha_inicio,
            fecha_fin,
            es_acumulable,
            aplica_a,
            categoria_id ? Number(categoria_id) : null,
            monto_minimo_compra !== undefined ? Number(monto_minimo_compra) : null,
            Number(id)
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ message: `Promoción con ID ${id} no encontrada` });
        }

        res.json({
            message: 'Promoción actualizada con éxito',
            promocion: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar promoción', error: error.message });
    }
};

// =============================================================================
// CU 22 (Subflujo CU 31): Cambiar estado (activo/inactivo) de una promoción
// =============================================================================
const cambiarEstadoPromocion = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido. Debe ser "activo" o "inactivo"' });
    }

    try {
        const { rows } = await db.query(`
            UPDATE public.promocion
            SET estado = $1, actualizado_en = now()
            WHERE promocion_id = $2
            RETURNING *
        `, [estado, Number(id)]);

        if (rows.length === 0) {
            return res.status(404).json({ message: `Promoción con ID ${id} no encontrada` });
        }

        res.json({
            message: `Promoción ${estado === 'activo' ? 'activada' : 'inactivada'} exitosamente`,
            promocion: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cambiar estado de la promoción', error: error.message });
    }
};

// =============================================================================
// CU 22 (Subflujos CU 65 y CU 66): Validar código de promoción y calcular descuento en tiempo real
// Validación de vigencia, compra mínima y regla de incompatibilidad / no acumulación.
// =============================================================================
const validarYAplicarPromocion = async (req, res) => {
    const {
        codigo_promocion,
        items = [],
        promocion_existente_codigo = null
    } = req.body;

    if (!codigo_promocion || !codigo_promocion.trim()) {
        return res.status(400).json({ message: 'Debe ingresar un código de promoción para validar (CU 65)' });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'El carrito no contiene productos para evaluar la promoción (CU 65)' });
    }

    try {
        const cod = codigo_promocion.trim().toUpperCase();

        const { rows: pRows } = await db.query(`
            SELECT
                p.*,
                c.categoria_nombre
            FROM public.promocion p
            LEFT JOIN public.categoria_producto c ON c.categoria_id = p.categoria_id
            WHERE UPPER(p.promocion_codigo) = $1
        `, [cod]);

        if (pRows.length === 0) {
            return res.status(404).json({
                valida: false,
                message: `El código de promoción "${cod}" no existe en el sistema (CU 65)`
            });
        }

        const promo = pRows[0];

        // 1. Validar estado y fechas de vigencia (CU 65)
        if (promo.estado !== 'activo') {
            return res.status(400).json({
                valida: false,
                message: `La promoción "${promo.promocion_nombre}" se encuentra inactiva (CU 65)`
            });
        }

        const ahora = new Date();
        if (promo.fecha_inicio && new Date(promo.fecha_inicio) > ahora) {
            return res.status(400).json({
                valida: false,
                message: `La promoción "${promo.promocion_nombre}" aún no inicia su vigencia (inicia el ${new Date(promo.fecha_inicio).toLocaleDateString()}) (CU 65)`
            });
        }

        if (promo.fecha_fin && new Date(promo.fecha_fin) < ahora) {
            return res.status(400).json({
                valida: false,
                message: `La promoción "${promo.promocion_nombre}" ha expirado (venció el ${new Date(promo.fecha_fin).toLocaleDateString()}) (CU 65)`
            });
        }

        // 2. Subflujo CU 66: Regla de incompatibilidad / no acumulación de descuentos
        if (promocion_existente_codigo && promocion_existente_codigo.toUpperCase() !== cod) {
            // Verificar si alguna de las promociones no es acumulable
            if (!promo.es_acumulable) {
                return res.status(400).json({
                    valida: false,
                    es_incompatible: true,
                    message: `La promoción "${promo.promocion_nombre}" NO es acumulable con otras promociones o cupones ya aplicados (${promocion_existente_codigo}) (Subflujo CU 66)`
                });
            }
        }

        // 3. Calcular montos aplicables según los ítems del carrito
        let subtotalTotalBruto = 0;
        let baseParaDescuento = 0;

        // Cargar datos de categoría y productos para verificar aplicación
        const { rows: prodData } = await db.query(`
            SELECT producto_id, categoria_id, producto_precio, producto_nombre
            FROM public.producto
            WHERE producto_id = ANY($1)
        `, [items.map(i => Number(i.producto_id))]);

        const prodMap = new Map(prodData.map(p => [p.producto_id, p]));

        // Obtener productos asociados a la promo si aplica_a == 'producto'
        let pIdsPermitidos = new Set();
        if (promo.aplica_a === 'producto') {
            const { rows: relRows } = await db.query(
                'SELECT producto_id FROM public.promocion_producto WHERE promocion_id = $1',
                [promo.promocion_id]
            );
            pIdsPermitidos = new Set(relRows.map(r => r.producto_id));
        }

        for (const it of items) {
            const pid = Number(it.producto_id);
            const cant = Number(it.cantidad || 1);
            const prod = prodMap.get(pid);
            if (!prod) continue;

            const precio = Number(prod.producto_precio || it.precio_unitario || 0);
            const totalLinea = precio * cant;
            subtotalTotalBruto += totalLinea;

            if (promo.aplica_a === 'total_venta') {
                baseParaDescuento += totalLinea;
            } else if (promo.aplica_a === 'categoria') {
                if (Number(prod.categoria_id) === Number(promo.categoria_id)) {
                    baseParaDescuento += totalLinea;
                }
            } else if (promo.aplica_a === 'producto') {
                if (pIdsPermitidos.has(pid)) {
                    baseParaDescuento += totalLinea;
                }
            }
        }

        // 4. Validar monto mínimo de compra
        const minCompra = Number(promo.monto_minimo_compra || 0);
        if (subtotalTotalBruto < minCompra) {
            return res.status(400).json({
                valida: false,
                message: `La promoción requiere un monto mínimo de compra de $${minCompra.toLocaleString('es-CL')} (Total actual: $${subtotalTotalBruto.toLocaleString('es-CL')}) (CU 65)`
            });
        }

        if (baseParaDescuento === 0) {
            return res.status(400).json({
                valida: false,
                message: `Ningún producto del carrito califica para la promoción "${promo.promocion_nombre}" (${promo.aplica_a}) (CU 65)`
            });
        }

        // 5. Calcular monto exacto del descuento
        let montoDescuento = 0;
        const val = Number(promo.valor_descuento);

        if (promo.tipo_descuento === 'porcentaje') {
            montoDescuento = Math.round((baseParaDescuento * val) / 100);
        } else if (promo.tipo_descuento === 'monto_fijo') {
            montoDescuento = Math.min(Math.round(val), baseParaDescuento);
        } else if (promo.tipo_descuento === 'combo' || promo.tipo_descuento === '2x1') {
            montoDescuento = Math.min(Math.round(val || (baseParaDescuento * 0.5)), baseParaDescuento);
        }

        montoDescuento = Math.min(montoDescuento, subtotalTotalBruto);
        const nuevoTotal = Math.max(subtotalTotalBruto - montoDescuento, 0);

        res.json({
            valida: true,
            promocion: {
                promocion_id: promo.promocion_id,
                promocion_codigo: promo.promocion_codigo,
                promocion_nombre: promo.promocion_nombre,
                tipo_descuento: promo.tipo_descuento,
                valor_descuento: Number(promo.valor_descuento),
                es_acumulable: promo.es_acumulable,
                aplica_a: promo.aplica_a
            },
            calculo: {
                subtotal_bruto: subtotalTotalBruto,
                base_afecta_descuento: baseParaDescuento,
                monto_descuento: montoDescuento,
                nuevo_total: nuevoTotal
            },
            mensaje: `Promoción "${promo.promocion_nombre}" aplicada: -$${montoDescuento.toLocaleString('es-CL')} de descuento (Subflujo CU 65)`
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al validar código de promoción', error: error.message });
    }
};

module.exports = {
    obtenerPromociones,
    obtenerPromocionPorId,
    crearPromocion,
    actualizarPromocion,
    cambiarEstadoPromocion,
    validarYAplicarPromocion
};

