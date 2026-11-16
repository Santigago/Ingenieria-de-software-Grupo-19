const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

/**
 * =============================================================================
 * PARKFLOW - KIDZANIA SANTIAGO
 * CONTROLADOR DE COCINA, COMANDAS Y TIEMPOS OPERATIVOS (MÓDULOS K Y L)
 * CU 28: Enrutar pedidos y generar comandas digitales (CU orig. 56, 57)
 * CU 29: Consultar y actualizar estado de pedidos en cocina (CU orig. 60, 61)
 * CU 30: Registrar tiempos operativos e incidencias (CU orig. 59, 62)
 * =============================================================================
 */

/**
 * Función central de enrutamiento y generación de comanda digital (CU 28 / CU orig. 56 y 57).
 * Puede ser invocada internamente al registrar una venta en POS o vía API directa.
 */
async function enrutarYGenerarComanda({
    venta_id = null,
    puesto_id,
    cajero_id,
    mesa_id = null,
    prioridad = 'normal',
    observaciones = null,
    items = []
}) {
    if (!puesto_id || !cajero_id) {
        throw new Error('Puesto de venta y cajero son requeridos para emitir la comanda');
    }

    if (!Array.isArray(items) || items.length === 0) {
        return {
            comanda_generada: false,
            razon: 'El pedido no contiene ítems',
            pedido_id: null
        };
    }

    // 1. Filtrar o verificar productos que requieren cocina
    // Buscamos productos en la BD para verificar el flag requiere_cocina
    const codigosOIds = items.map(it => it.producto_id || it.id).filter(Boolean);
    let mapaRequiereCocina = {};

    if (codigosOIds.length > 0) {
        const { rows: prodsDb } = await db.query(`
            SELECT producto_id, producto_codigo, producto_nombre, requiere_cocina, producto_tipo_negocio
            FROM public.producto
            WHERE producto_id = ANY($1::int[])
        `, [codigosOIds]);

        for (const p of prodsDb) {
            // Requiere cocina si el flag está activo o es comida preparada no snack
            mapaRequiereCocina[p.producto_id] = Boolean(p.requiere_cocina);
        }
    }

    // Filtrar ítems de comanda
    const itemsCocina = items.map(it => {
        const pId = it.producto_id || it.id;
        const reqCocina = it.requiere_cocina !== undefined 
            ? Boolean(it.requiere_cocina) 
            : Boolean(mapaRequiereCocina[pId]);
        return {
            ...it,
            producto_id: pId,
            requiere_cocina: reqCocina
        };
    });

    // CU 28 Paso 1 / Flujo Alternativo: Si ningún ítem requiere preparación en cocina, no se crea comanda
    const hayItemsCocina = itemsCocina.some(it => it.requiere_cocina);
    if (!hayItemsCocina) {
        return {
            comanda_generada: false,
            razon: 'La orden no incluye productos que requieran preparación en cocina',
            pedido_id: null
        };
    }

    // 2. Generar correlativo secuencial diario de comanda (ORD-YYYYMMDD-XXXX)
    const hoyStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows: countRows } = await db.query(`
        SELECT COUNT(*)::int AS total_hoy
        FROM public.pedido_comanda
        WHERE fecha_hora_creacion::date = CURRENT_DATE
    `);
    const correlativo = String((countRows[0]?.total_hoy || 0) + 1).padStart(4, '0');
    const numeroPedido = `ORD-${hoyStr}-${correlativo}`;

    // 3. Crear cabecera del pedido comanda
    const { rows: pedidoRows } = await db.query(`
        INSERT INTO public.pedido_comanda (
            numero_pedido,
            venta_id,
            puesto_id,
            cajero_id,
            mesa_id,
            estado_pedido,
            prioridad,
            observaciones,
            fecha_hora_creacion
        ) VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, now())
        RETURNING *
    `, [
        numeroPedido,
        venta_id,
        puesto_id,
        cajero_id,
        mesa_id,
        prioridad || 'normal',
        observaciones || null
    ]);

    const pedidoCreado = pedidoRows[0];

    // 4. Insertar los ítems en el detalle de la comanda
    const detalleInsertados = [];
    for (const item of itemsCocina) {
        const { rows: detRows } = await db.query(`
            INSERT INTO public.pedido_comanda_detalle (
                pedido_id,
                producto_id,
                producto_codigo,
                producto_nombre,
                cantidad,
                requiere_cocina,
                estado_item,
                nota_preparacion
            ) VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7)
            RETURNING *
        `, [
            pedidoCreado.pedido_id,
            item.producto_id,
            item.producto_codigo || item.codigo || 'SIN-COD',
            item.producto_nombre || item.nombre || 'Producto Preparado',
            Number(item.cantidad || 1),
            Boolean(item.requiere_cocina),
            item.nota_preparacion || item.observacion || null
        ]);
        detalleInsertados.push(detRows[0]);
    }

    // 5. Auditoría
    await registrarAuditoria({
        usuario_id: cajero_id,
        actor_usuario_id: cajero_id,
        evento_tipo: 'PEDIDO_COCINA',
        modulo: 'cocina',
        accion: 'CREAR_COMANDA_DIGITAL',
        resultado: 'exitoso',
        detalle: `Comanda ${numeroPedido} generada con ${detalleInsertados.length} ítems para puesto ${puesto_id} (Venta ID: ${venta_id || 'N/A'})`
    });

    return {
        comanda_generada: true,
        pedido_id: pedidoCreado.pedido_id,
        numero_pedido: pedidoCreado.numero_pedido,
        estado_pedido: pedidoCreado.estado_pedido,
        prioridad: pedidoCreado.prioridad,
        fecha_hora_creacion: pedidoCreado.fecha_hora_creacion,
        total_items: detalleInsertados.length,
        items_cocina: detalleInsertados
    };
}

/**
 * Endpoint manual para enrutar pedido y generar comanda digital (CU 28)
 * POST /api/cocina/pedidos/enrutar
 */
const enrutarPedidoExpress = async (req, res) => {
    try {
        const {
            venta_id,
            puesto_id,
            mesa_id,
            prioridad = 'normal',
            observaciones,
            items = []
        } = req.body;

        // El token JWT guarda el usuario en "id" (ver c_authController)
        const cajero_id = req.user?.id || req.user?.usuario_id || req.body.cajero_id;

        const resultado = await enrutarYGenerarComanda({
            venta_id,
            puesto_id,
            cajero_id,
            mesa_id,
            prioridad,
            observaciones,
            items
        });

        res.status(resultado.comanda_generada ? 201 : 200).json(resultado);
    } catch (error) {
        res.status(500).json({
            message: 'Error al enrutar pedido y generar comanda digital',
            error: error.message
        });
    }
};

/**
 * Consultar comandas de cocina con filtros, orden FIFO y semáforo de urgencia (CU 29 / CU orig. 60)
 * GET /api/cocina/pedidos
 */
const obtenerComandasCocina = async (req, res) => {
    try {
        const {
            estado,       // 'pendiente', 'en_preparacion', 'listo', 'entregado', 'activos'
            puesto_id,
            fecha_desde,
            fecha_hasta,
            orden = 'FIFO' // 'FIFO' o 'LIFO'
        } = req.query;

        let condiciones = [];
        let params = [];

        // Filtro por estado
        if (estado === 'activos') {
            condiciones.push("p.estado_pedido IN ('pendiente', 'en_preparacion')");
        } else if (estado === 'por_entregar') {
            condiciones.push("p.estado_pedido IN ('listo')");
        } else if (estado && estado !== 'todos') {
            params.push(estado);
            condiciones.push(`p.estado_pedido = $${params.length}`);
        }

        // Filtro por puesto
        if (puesto_id) {
            params.push(Number(puesto_id));
            condiciones.push(`p.puesto_id = $${params.length}`);
        }

        // Filtro por fechas
        if (fecha_desde) {
            params.push(fecha_desde);
            condiciones.push(`p.fecha_hora_creacion >= $${params.length}::timestamp`);
        }
        if (fecha_hasta) {
            params.push(fecha_hasta);
            condiciones.push(`p.fecha_hora_creacion <= $${params.length}::timestamp`);
        }

        const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
        const orderSql = orden === 'LIFO' 
            ? 'ORDER BY p.prioridad = \'urgente\' DESC, p.fecha_hora_creacion DESC' 
            : 'ORDER BY p.prioridad = \'urgente\' DESC, p.fecha_hora_creacion ASC';

        const { rows: comandas } = await db.query(`
            SELECT
                p.pedido_id,
                p.numero_pedido,
                p.venta_id,
                p.puesto_id,
                pv.puesto_nombre,
                pv.puesto_codigo,
                p.cajero_id,
                TRIM(CONCAT(uc.usuario_nombres, ' ', uc.usuario_apellido_paterno)) AS cajero_nombre,
                p.cocinero_id,
                TRIM(CONCAT(uk.usuario_nombres, ' ', uk.usuario_apellido_paterno)) AS cocinero_nombre,
                p.mesa_id,
                m.mesa_numero,
                p.estado_pedido,
                p.prioridad,
                p.observaciones,
                p.fecha_hora_creacion,
                p.hora_inicio_preparacion,
                p.hora_listo,
                p.hora_entrega,
                p.tiempo_preparacion_segundos,
                p.tiempo_entrega_segundos,
                ROUND(EXTRACT(EPOCH FROM (now() - p.fecha_hora_creacion)) / 60)::int AS minutos_desde_creacion,
                ROUND(EXTRACT(EPOCH FROM (COALESCE(p.hora_listo, now()) - COALESCE(p.hora_inicio_preparacion, p.fecha_hora_creacion))) / 60)::int AS minutos_en_preparacion,
                COUNT(DISTINCT pi.incidencia_id)::int AS total_incidencias
            FROM public.pedido_comanda p
            JOIN public.puesto_venta pv ON pv.puesto_id = p.puesto_id
            JOIN public.usuario uc ON uc.usuario_id = p.cajero_id
            LEFT JOIN public.usuario uk ON uk.usuario_id = p.cocinero_id
            LEFT JOIN public.mesa m ON m.mesa_id = p.mesa_id
            LEFT JOIN public.pedido_incidencia pi ON pi.pedido_id = p.pedido_id
            ${whereSql}
            GROUP BY p.pedido_id, pv.puesto_id, uc.usuario_id, uk.usuario_id, m.mesa_id
            ${orderSql}
        `, params);

        // Obtener detalles de cada pedido
        if (comandas.length > 0) {
            const pedidoIds = comandas.map(c => c.pedido_id);
            const { rows: detalles } = await db.query(`
                SELECT
                    detalle_id,
                    pedido_id,
                    producto_id,
                    producto_codigo,
                    producto_nombre,
                    cantidad,
                    requiere_cocina,
                    estado_item,
                    nota_preparacion
                FROM public.pedido_comanda_detalle
                WHERE pedido_id = ANY($1::int[])
                ORDER BY detalle_id ASC
            `, [pedidoIds]);

            const mapaDetalles = {};
            for (const d of detalles) {
                if (!mapaDetalles[d.pedido_id]) mapaDetalles[d.pedido_id] = [];
                mapaDetalles[d.pedido_id].push(d);
            }

            // Calcular semáforo de urgencia visual
            for (const c of comandas) {
                c.items = mapaDetalles[c.pedido_id] || [];
                const mins = c.minutos_desde_creacion || 0;
                if (c.estado_pedido === 'entregado' || c.estado_pedido === 'cancelado') {
                    c.semaforo_urgencia = 'completado';
                } else if (c.estado_pedido === 'listo') {
                    c.semaforo_urgencia = 'listo_retiro';
                } else if (mins > 10) {
                    c.semaforo_urgencia = 'critico'; // Rojo
                } else if (mins >= 5) {
                    c.semaforo_urgencia = 'alerta';  // Amarillo
                } else {
                    c.semaforo_urgencia = 'normal';  // Verde
                }
            }
        }

        res.json(comandas);
    } catch (error) {
        res.status(500).json({
            message: 'Error al consultar comandas de cocina',
            error: error.message
        });
    }
};

/**
 * Actualizar estado del pedido (CU 29 / CU orig. 60 y 61)
 * Transiciones: 'pendiente' -> 'en_preparacion' -> 'listo' -> 'entregado' (o 'cancelado')
 * PATCH /api/cocina/pedidos/:id/estado
 */
const cambiarEstadoPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { nuevo_estado, cocinero_id = null, observaciones = null } = req.body;
        const actorId = req.user?.id || req.user?.usuario_id || cocinero_id;

        const ESTADOS_VALIDOS = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'];
        if (!ESTADOS_VALIDOS.includes(nuevo_estado)) {
            return res.status(400).json({
                message: `Estado no válido. Opciones permitidas: ${ESTADOS_VALIDOS.join(', ')}`
            });
        }

        // Consultar pedido actual
        const { rows: pRows } = await db.query('SELECT * FROM public.pedido_comanda WHERE pedido_id = $1', [id]);
        if (pRows.length === 0) {
            return res.status(404).json({ message: 'Comanda / Pedido no encontrado' });
        }
        const pedidoActual = pRows[0];

        // Validar transiciones coherentes
        const transicionesValidas = {
            pendiente: ['en_preparacion', 'cancelado'],
            en_preparacion: ['listo', 'cancelado'],
            listo: ['entregado', 'en_preparacion', 'cancelado'],
            entregado: [],
            cancelado: []
        };

        if (pedidoActual.estado_pedido !== nuevo_estado && !transicionesValidas[pedidoActual.estado_pedido]?.includes(nuevo_estado)) {
            return res.status(400).json({
                message: `Transición de estado inválida: no se puede pasar de '${pedidoActual.estado_pedido}' a '${nuevo_estado}'`
            });
        }

        let updateSql = '';
        let updateParams = [nuevo_estado, id];

        if (nuevo_estado === 'en_preparacion') {
            updateSql = `
                UPDATE public.pedido_comanda
                SET estado_pedido = $1,
                    hora_inicio_preparacion = COALESCE(hora_inicio_preparacion, now()),
                    cocinero_id = COALESCE($3, cocinero_id)
                WHERE pedido_id = $2
                RETURNING *
            `;
            updateParams.push(actorId);
        } else if (nuevo_estado === 'listo') {
            // CU 30: Medición automática del tiempo de preparación en segundos
            updateSql = `
                UPDATE public.pedido_comanda
                SET estado_pedido = $1,
                    hora_listo = now(),
                    tiempo_preparacion_segundos = GREATEST(
                        0,
                        ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(hora_inicio_preparacion, fecha_hora_creacion))))::int
                    )
                WHERE pedido_id = $2
                RETURNING *
            `;
        } else if (nuevo_estado === 'entregado') {
            // CU 30: Medición automática del tiempo de entrega en segundos
            updateSql = `
                UPDATE public.pedido_comanda
                SET estado_pedido = $1,
                    hora_entrega = now(),
                    tiempo_entrega_segundos = GREATEST(
                        0,
                        ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(hora_listo, fecha_hora_creacion))))::int
                    )
                WHERE pedido_id = $2
                RETURNING *
            `;
        } else {
            // pendiente o cancelado
            updateSql = `
                UPDATE public.pedido_comanda
                SET estado_pedido = $1,
                    observaciones = COALESCE($3, observaciones)
                WHERE pedido_id = $2
                RETURNING *
            `;
            updateParams.push(observaciones);
        }

        const { rows: actualizados } = await db.query(updateSql, updateParams);
        const pedidoFinal = actualizados[0];

        // Sincronizar estado de los ítems del detalle si cambia de estado macro
        if (['en_preparacion', 'listo', 'cancelado'].includes(nuevo_estado)) {
            await db.query(`
                UPDATE public.pedido_comanda_detalle
                SET estado_item = $1
                WHERE pedido_id = $2 AND estado_item != 'cancelado'
            `, [nuevo_estado, id]);
        }

        // Auditoría
        await registrarAuditoria({
            usuario_id: actorId,
            actor_usuario_id: actorId,
            evento_tipo: 'PEDIDO_COCINA',
            modulo: 'cocina',
            accion: 'CAMBIO_ESTADO_COMANDA',
            resultado: 'exitoso',
            detalle: `Pedido ${pedidoFinal.numero_pedido} cambió de ${pedidoActual.estado_pedido} a ${nuevo_estado}`
        });

        res.json({
            message: `Pedido ${pedidoFinal.numero_pedido} actualizado a estado: ${nuevo_estado}`,
            pedido: pedidoFinal
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al cambiar estado de la comanda en cocina',
            error: error.message
        });
    }
};

/**
 * Actualizar estado individual de un ítem de la comanda
 * PATCH /api/cocina/pedidos/:id/items/:detalleId/estado
 */
const cambiarEstadoItemComanda = async (req, res) => {
    try {
        const { id, detalleId } = req.params;
        const { estado_item } = req.body;

        const ESTADOS_ITEM = ['pendiente', 'en_preparacion', 'listo', 'cancelado'];
        if (!ESTADOS_ITEM.includes(estado_item)) {
            return res.status(400).json({ message: 'Estado de ítem no válido' });
        }

        const { rows } = await db.query(`
            UPDATE public.pedido_comanda_detalle
            SET estado_item = $1
            WHERE pedido_id = $2 AND detalle_id = $3
            RETURNING *
        `, [estado_item, id, detalleId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ítem de comanda no encontrado' });
        }

        res.json({
            message: 'Ítem actualizado exitosamente',
            item: rows[0]
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al actualizar ítem de comanda',
            error: error.message
        });
    }
};

/**
 * Registrar incidencia operativa en cocina (CU 30 / CU orig. 62)
 * POST /api/cocina/pedidos/:id/incidencias
 */
const registrarIncidenciaPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            tipo_incidencia,
            descripcion,
            tiempo_retraso_min = 0,
            accion_correctiva = null
        } = req.body;

        const usuario_id = req.user?.id || req.user?.usuario_id || req.body.usuario_id;
        if (!usuario_id) {
            return res.status(400).json({ message: 'Usuario operador es obligatorio para registrar incidencia' });
        }

        const TIPOS_VALIDOS = ['quiebre_insumo', 'error_preparacion', 'falla_equipamiento', 'demora_alta', 'otro'];
        if (!TIPOS_VALIDOS.includes(tipo_incidencia)) {
            return res.status(400).json({
                message: `Tipo de incidencia inválido. Permitidos: ${TIPOS_VALIDOS.join(', ')}`
            });
        }

        if (!descripcion || String(descripcion).trim().length < 5) {
            return res.status(400).json({
                message: 'La descripción de la incidencia debe tener al menos 5 caracteres'
            });
        }

        // Verificar que el pedido exista
        const { rows: pRows } = await db.query('SELECT pedido_id, numero_pedido FROM public.pedido_comanda WHERE pedido_id = $1', [id]);
        if (pRows.length === 0) {
            return res.status(404).json({ message: 'Pedido / Comanda no encontrada' });
        }
        const pedido = pRows[0];

        // Insertar incidencia
        const { rows: incRows } = await db.query(`
            INSERT INTO public.pedido_incidencia (
                pedido_id,
                usuario_id,
                tipo_incidencia,
                descripcion,
                tiempo_retraso_min,
                accion_correctiva,
                creado_en
            ) VALUES ($1, $2, $3, $4, $5, $6, now())
            RETURNING *
        `, [
            id,
            usuario_id,
            tipo_incidencia,
            descripcion.trim(),
            Math.max(0, Number(tiempo_retraso_min || 0)),
            accion_correctiva ? accion_correctiva.trim() : null
        ]);

        // Si la incidencia reporta retraso, elevar prioridad del pedido a 'urgente'
        if (Number(tiempo_retraso_min) > 0) {
            await db.query(`
                UPDATE public.pedido_comanda
                SET prioridad = 'urgente'
                WHERE pedido_id = $1
            `, [id]);
        }

        // Auditoría
        await registrarAuditoria({
            usuario_id,
            actor_usuario_id: usuario_id,
            evento_tipo: 'INCIDENCIA_COCINA',
            modulo: 'cocina',
            accion: 'REGISTRO_INCIDENCIA_COCINA',
            resultado: 'exitoso',
            detalle: `Incidencia '${tipo_incidencia}' registrada en pedido ${pedido.numero_pedido}. Retraso estimado: ${tiempo_retraso_min} min.`
        });

        res.status(201).json({
            message: 'Incidencia operativa registrada exitosamente',
            incidencia: incRows[0]
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al registrar incidencia operativa en cocina',
            error: error.message
        });
    }
};

/**
 * Obtener incidencias de un pedido
 * GET /api/cocina/pedidos/:id/incidencias
 */
const obtenerIncidenciasPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query(`
            SELECT
                i.incidencia_id,
                i.pedido_id,
                i.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                i.tipo_incidencia,
                i.descripcion,
                i.tiempo_retraso_min,
                i.accion_correctiva,
                i.creado_en
            FROM public.pedido_incidencia i
            JOIN public.usuario u ON u.usuario_id = i.usuario_id
            WHERE i.pedido_id = $1
            ORDER BY i.creado_en DESC
        `, [id]);

        res.json(rows);
    } catch (error) {
        res.status(500).json({
            message: 'Error al consultar incidencias del pedido',
            error: error.message
        });
    }
};

/**
 * Métricas operativas de tiempos y cumplimiento SLA de cocina (CU 30 / CU orig. 59)
 * GET /api/cocina/metricas
 */
const obtenerMetricasCocina = async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, puesto_id } = req.query;

        let condiciones = [];
        let params = [];

        if (puesto_id) {
            params.push(Number(puesto_id));
            condiciones.push(`puesto_id = $${params.length}`);
        }

        if (fecha_desde) {
            params.push(fecha_desde);
            condiciones.push(`fecha_hora_creacion >= $${params.length}::timestamp`);
        } else {
            // Por defecto hoy
            condiciones.push("fecha_hora_creacion::date = CURRENT_DATE");
        }

        if (fecha_hasta) {
            params.push(fecha_hasta);
            condiciones.push(`fecha_hora_creacion <= $${params.length}::timestamp`);
        }

        const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        // Consultas agrupadas
        const { rows: stats } = await db.query(`
            SELECT
                COUNT(*)::int AS total_pedidos,
                COUNT(*) FILTER (WHERE estado_pedido = 'pendiente')::int AS pedidos_pendientes,
                COUNT(*) FILTER (WHERE estado_pedido = 'en_preparacion')::int AS pedidos_en_preparacion,
                COUNT(*) FILTER (WHERE estado_pedido = 'listo')::int AS pedidos_listos,
                COUNT(*) FILTER (WHERE estado_pedido = 'entregado')::int AS pedidos_entregados,
                COUNT(*) FILTER (WHERE estado_pedido = 'cancelado')::int AS pedidos_cancelados,
                COALESCE(ROUND(AVG(tiempo_preparacion_segundos) FILTER (WHERE tiempo_preparacion_segundos > 0)), 0)::int AS tiempo_prom_preparacion_seg,
                COALESCE(ROUND(AVG(tiempo_entrega_segundos) FILTER (WHERE tiempo_entrega_segundos > 0)), 0)::int AS tiempo_prom_entrega_seg,
                COUNT(*) FILTER (WHERE tiempo_preparacion_segundos > 600)::int AS pedidos_fuera_sla_10min
            FROM public.pedido_comanda
            ${whereSql}
        `, params);

        const row = stats[0] || {};
        const total = row.total_pedidos || 0;
        const entregadosOListos = (row.pedidos_listos || 0) + (row.pedidos_entregados || 0);
        const fueraSla = row.pedidos_fuera_sla_10min || 0;
        const dentroSla = Math.max(0, entregadosOListos - fueraSla);
        const porcentajeSla = entregadosOListos > 0 ? Math.round((dentroSla / entregadosOListos) * 100) : 100;

        // Desglose de incidencias
        const { rows: incidenciasStats } = await db.query(`
            SELECT
                i.tipo_incidencia,
                COUNT(*)::int AS total_tipo,
                COALESCE(SUM(i.tiempo_retraso_min), 0)::int AS minutos_retraso_acumulados
            FROM public.pedido_incidencia i
            JOIN public.pedido_comanda p ON p.pedido_id = i.pedido_id
            ${whereSql}
            GROUP BY i.tipo_incidencia
        `, params);

        const formateaSegundos = (s) => {
            const m = Math.floor(s / 60);
            const seg = s % 60;
            return `${m}m ${seg}s`;
        };

        res.json({
            kpi: {
                total_pedidos: total,
                pendientes: row.pedidos_pendientes || 0,
                en_preparacion: row.pedidos_en_preparacion || 0,
                listos: row.pedidos_listos || 0,
                entregados: row.pedidos_entregados || 0,
                cancelados: row.pedidos_cancelados || 0,
                tiempo_prom_preparacion_seg: row.tiempo_prom_preparacion_seg,
                tiempo_prom_preparacion_formato: formateaSegundos(row.tiempo_prom_preparacion_seg),
                tiempo_prom_entrega_seg: row.tiempo_prom_entrega_seg,
                tiempo_prom_entrega_formato: formateaSegundos(row.tiempo_prom_entrega_seg),
                sla_cumplimiento_porcentaje: porcentajeSla,
                pedidos_fuera_sla: fueraSla
            },
            incidencias: {
                total_incidencias: incidenciasStats.reduce((acc, curr) => acc + curr.total_tipo, 0),
                desglose_por_tipo: incidenciasStats
            }
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al calcular métricas de tiempos operativos de cocina',
            error: error.message
        });
    }
};

module.exports = {
    enrutarYGenerarComanda,
    enrutarPedidoExpress,
    obtenerComandasCocina,
    cambiarEstadoPedido,
    cambiarEstadoItemComanda,
    registrarIncidenciaPedido,
    obtenerIncidenciasPedido,
    obtenerMetricasCocina
};

