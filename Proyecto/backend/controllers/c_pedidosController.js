const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

/**
 * =============================================================================
 * PARKFLOW - KIDZANIA SANTIAGO
 * CONTROLADOR DE PEDIDOS Y CANCELACIONES (MÓDULO K)
 * CU 24: Cancelar pedidos o ítems (CU original 55)
 * =============================================================================
 */

/**
 * Cancelar un pedido completo (CU 24 / Subflujo CU 55)
 * Precondición: El pedido existe, el pedido no ha sido entregado y el usuario debe estar autenticado.
 * POST /api/pedidos/:id/cancelar
 */
const cancelarPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo_cancelacion } = req.body;
        const usuarioId = req.user?.usuario_id || req.body.usuario_id;

        // Validación: Motivo de cancelación obligatorio (CU 55 Paso 3 y 4)
        if (!motivo_cancelacion || String(motivo_cancelacion).trim().length < 3) {
            return res.status(400).json({
                message: 'El motivo de cancelación es obligatorio y debe contener al menos 3 caracteres (CU 55)'
            });
        }

        // 1. Verificar existencia del pedido
        const { rows: pRows } = await db.query(`
            SELECT pedido_id, numero_pedido, estado_pedido, puesto_id, venta_id
            FROM public.pedido_comanda
            WHERE pedido_id = $1
        `, [id]);

        if (pRows.length === 0) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        const pedido = pRows[0];

        // 2. Precondición CU 55: No se puede cancelar si el pedido ya fue entregado
        if (pedido.estado_pedido === 'entregado') {
            return res.status(400).json({
                message: 'Operación denegada: No se puede cancelar un pedido que ya ha sido entregado al cliente (Precondición CU 55)'
            });
        }

        if (pedido.estado_pedido === 'cancelado') {
            return res.status(400).json({
                message: `El pedido ${pedido.numero_pedido} ya se encuentra previamente cancelado`
            });
        }

        const motivoLimpio = String(motivo_cancelacion).trim();

        // 3. Actualizar cabecera a cancelado con usuario responsable y timestamp (CU 55 Paso 6.1 y 6.2)
        const { rows: actRows } = await db.query(`
            UPDATE public.pedido_comanda
            SET estado_pedido = 'cancelado',
                motivo_cancelacion = $1,
                cancelado_por_usuario_id = $2,
                fecha_hora_cancelacion = now()
            WHERE pedido_id = $3
            RETURNING *
        `, [motivoLimpio, usuarioId, id]);

        // 4. Actualizar todos los ítems del detalle a cancelado
        await db.query(`
            UPDATE public.pedido_comanda_detalle
            SET estado_item = 'cancelado',
                motivo_cancelacion = $1
            WHERE pedido_id = $2 AND estado_item != 'cancelado'
        `, [motivoLimpio, id]);

        // 5. Auditoría obligatoria
        await registrarAuditoria({
            usuario_id: usuarioId,
            actor_usuario_id: usuarioId,
            evento_tipo: 'CANCELACION_PEDIDO',
            modulo: 'pedidos',
            accion: 'CANCELAR_PEDIDO',
            resultado: 'exitoso',
            detalle: `Pedido ${pedido.numero_pedido} cancelado por usuario ID ${usuarioId}. Motivo: "${motivoLimpio}"`
        });

        res.json({
            message: `Pedido ${pedido.numero_pedido} cancelado exitosamente`,
            pedido: actRows[0]
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al cancelar pedido',
            error: error.message
        });
    }
};

/**
 * Cancelar un ítem específico dentro de un pedido (CU 24 / Subflujo CU 55)
 * POST /api/pedidos/:id/items/:detalleId/cancelar
 */
const cancelarItemPedido = async (req, res) => {
    try {
        const { id, detalleId } = req.params;
        const { motivo_cancelacion } = req.body;
        const usuarioId = req.user?.usuario_id || req.body.usuario_id;

        if (!motivo_cancelacion || String(motivo_cancelacion).trim().length < 3) {
            return res.status(400).json({
                message: 'El motivo de cancelación del ítem es obligatorio (CU 55)'
            });
        }

        // 1. Verificar pedido
        const { rows: pRows } = await db.query('SELECT pedido_id, numero_pedido, estado_pedido FROM public.pedido_comanda WHERE pedido_id = $1', [id]);
        if (pRows.length === 0) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }
        const pedido = pRows[0];

        if (pedido.estado_pedido === 'entregado') {
            return res.status(400).json({ message: 'No se puede cancelar ítems de un pedido ya entregado' });
        }

        // 2. Verificar ítem
        const { rows: dRows } = await db.query('SELECT * FROM public.pedido_comanda_detalle WHERE detalle_id = $1 AND pedido_id = $2', [detalleId, id]);
        if (dRows.length === 0) {
            return res.status(404).json({ message: 'Ítem no encontrado en el pedido especificado' });
        }
        const itemActual = dRows[0];

        if (itemActual.estado_item === 'cancelado') {
            return res.status(400).json({ message: 'Este ítem ya se encuentra cancelado' });
        }

        const motivoLimpio = String(motivo_cancelacion).trim();

        // 3. Cancelar ítem individual
        const { rows: actItem } = await db.query(`
            UPDATE public.pedido_comanda_detalle
            SET estado_item = 'cancelado',
                motivo_cancelacion = $1
            WHERE detalle_id = $2 AND pedido_id = $3
            RETURNING *
        `, [motivoLimpio, detalleId, id]);

        // 4. Verificar si todos los ítems del pedido quedaron cancelados
        const { rows: pendientes } = await db.query(`
            SELECT COUNT(*)::int AS restantes
            FROM public.pedido_comanda_detalle
            WHERE pedido_id = $1 AND estado_item != 'cancelado'
        `, [id]);

        let pedidoCanceladoTotal = false;
        if (pendientes[0]?.restantes === 0) {
            pedidoCanceladoTotal = true;
            await db.query(`
                UPDATE public.pedido_comanda
                SET estado_pedido = 'cancelado',
                    motivo_cancelacion = $1,
                    cancelado_por_usuario_id = $2,
                    fecha_hora_cancelacion = now()
                WHERE pedido_id = $3
            `, [`Todos los ítems cancelados: ${motivoLimpio}`, usuarioId, id]);
        }

        // Auditoría
        await registrarAuditoria({
            usuario_id: usuarioId,
            actor_usuario_id: usuarioId,
            evento_tipo: 'CANCELACION_ITEM_PEDIDO',
            modulo: 'pedidos',
            accion: 'CANCELAR_ITEM_PEDIDO',
            resultado: 'exitoso',
            detalle: `Ítem "${itemActual.producto_nombre}" (ID ${detalleId}) cancelado en pedido ${pedido.numero_pedido}. Motivo: "${motivoLimpio}"`
        });

        res.json({
            message: `Ítem "${itemActual.producto_nombre}" cancelado exitosamente`,
            item: actItem[0],
            pedido_cancelado_total: pedidoCanceladoTotal
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al cancelar ítem de pedido',
            error: error.message
        });
    }
};

/**
 * Consultar detalle completo de un pedido con ítems y trazabilidad de cancelación
 * GET /api/pedidos/:id
 */
const consultarPedidoPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const { rows: pRows } = await db.query(`
            SELECT
                p.*,
                pv.puesto_nombre,
                pv.puesto_codigo,
                TRIM(CONCAT(uc.usuario_nombres, ' ', uc.usuario_apellido_paterno)) AS cajero_nombre,
                TRIM(CONCAT(uk.usuario_nombres, ' ', uk.usuario_apellido_paterno)) AS cocinero_nombre,
                TRIM(CONCAT(ux.usuario_nombres, ' ', ux.usuario_apellido_paterno)) AS cancelado_por_nombre
            FROM public.pedido_comanda p
            JOIN public.puesto_venta pv ON pv.puesto_id = p.puesto_id
            JOIN public.usuario uc ON uc.usuario_id = p.cajero_id
            LEFT JOIN public.usuario uk ON uk.usuario_id = p.cocinero_id
            LEFT JOIN public.usuario ux ON ux.usuario_id = p.cancelado_por_usuario_id
            WHERE p.pedido_id = $1
        `, [id]);

        if (pRows.length === 0) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        const { rows: items } = await db.query(`
            SELECT *
            FROM public.pedido_comanda_detalle
            WHERE pedido_id = $1
            ORDER BY detalle_id ASC
        `, [id]);

        res.json({
            ...pRows[0],
            items
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al consultar pedido',
            error: error.message
        });
    }
};

module.exports = {
    cancelarPedido,
    cancelarItemPedido,
    consultarPedidoPorId
};

