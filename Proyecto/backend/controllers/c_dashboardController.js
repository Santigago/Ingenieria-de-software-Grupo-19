const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

const obtenerUmbralSistema = async () => {
    try {
        const { rows } = await db.query(
            "SELECT valor FROM public.configuracion_sistema WHERE clave = 'umbral_dias_vencimiento' LIMIT 1"
        );
        const val = rows.length > 0 ? parseInt(rows[0].valor, 10) : 7;
        return Number.isFinite(val) && val > 0 ? val : 7;
    } catch (_) {
        return 7;
    }
};

const validarRangoFechas = (fecha_desde, fecha_hasta) => {
    if (!fecha_desde || !fecha_hasta) return { valido: true };
    const fDesde = new Date(`${String(fecha_desde).slice(0, 10)}T00:00:00Z`);
    const fHasta = new Date(`${String(fecha_hasta).slice(0, 10)}T23:59:59Z`);
    if (Number.isNaN(fDesde.getTime()) || Number.isNaN(fHasta.getTime())) {
        return { valido: false, mensaje: 'Las fechas ingresadas para el período no son válidas' };
    }
    if (fHasta < fDesde) {
        return {
            valido: false,
            mensaje: 'El rango de fechas es inválido: la fecha final no puede ser menor que la fecha inicial (CU 88)'
        };
    }
    return { valido: true };
};

const escaparCeldaCsv = (valor) => {
    if (valor === null || valor === undefined) return '';
    const str = String(valor).replace(/\r?\n/g, ' ');
    if (str.includes(';') || str.includes('"') || str.includes(',')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// =========================================================================
// CU 33 (Subflujos CU 33, CU 75 y CU 88): Dashboard Ejecutivo e Indicadores Filtrables
// =========================================================================
const obtenerMetricasDashboard = async (req, res) => {
    const {
        fecha_desde,
        fecha_hasta,
        tipo_negocio = 'todos',
        puesto = 'todos'
    } = req.query;

    const valFechas = validarRangoFechas(fecha_desde, fecha_hasta);
    if (!valFechas.valido) {
        return res.status(400).json({ message: valFechas.mensaje });
    }

    const tipoNegocioFiltro = ['comida', 'merch'].includes(tipo_negocio)
        ? tipo_negocio
        : (puesto === 'puesto_comida' ? 'comida' : (puesto === 'tienda_merch' ? 'merch' : null));

    const fDesdeStr = fecha_desde ? String(fecha_desde).slice(0, 10) : null;
    const fHastaStr = fecha_hasta ? String(fecha_hasta).slice(0, 10) : null;

    try {
        const umbralDias = await obtenerUmbralSistema();

        const [
            productosActivosRes,
            unidadesRes,
            proveedoresRes,
            ubicacionesRes,
            porVencerRes,
            vencidosRes,
            salidasMesRes,
            stockCriticoRes,
            mesasRes
        ] = await Promise.all([
            db.query(
                tipoNegocioFiltro
                    ? "SELECT COUNT(*)::int AS total FROM public.producto WHERE producto_estado = 'activo' AND COALESCE(producto_tipo_negocio, 'comida') = $1"
                    : "SELECT COUNT(*)::int AS total FROM public.producto WHERE producto_estado = 'activo'",
                tipoNegocioFiltro ? [tipoNegocioFiltro] : []
            ),
            db.query("SELECT COUNT(*)::int AS total FROM public.unidad_medida_personalizada WHERE unidad_medida_estado = 'activo'"),
            db.query("SELECT COUNT(*)::int AS total FROM public.proveedor WHERE proveedor_estado = 'activo'"),
            db.query("SELECT COUNT(*)::int AS total FROM public.ubicacion_bodega WHERE ubicacion_estado = 'activo'"),
            db.query(
                `SELECT COUNT(*)::int AS total
                 FROM public.lote l
                 JOIN public.producto p ON p.producto_id = l.producto_id
                 WHERE l.lote_cantidad_disponible > 0
                   AND l.lote_fecha_vencimiento >= CURRENT_DATE
                   AND (l.lote_fecha_vencimiento - CURRENT_DATE) <= $1::int
                   ${tipoNegocioFiltro ? "AND COALESCE(p.producto_tipo_negocio, 'comida') = $2" : ''}`,
                tipoNegocioFiltro ? [umbralDias, tipoNegocioFiltro] : [umbralDias]
            ),
            db.query(
                `SELECT COUNT(*)::int AS total
                 FROM public.lote l
                 JOIN public.producto p ON p.producto_id = l.producto_id
                 WHERE l.lote_cantidad_disponible > 0
                   AND l.lote_fecha_vencimiento < CURRENT_DATE
                   ${tipoNegocioFiltro ? "AND COALESCE(p.producto_tipo_negocio, 'comida') = $1" : ''}`,
                tipoNegocioFiltro ? [tipoNegocioFiltro] : []
            ),
            db.query(
                "SELECT COALESCE(SUM(movimiento_cantidad), 0)::numeric(12,2) AS total FROM public.movimiento_stock WHERE movimiento_tipo = 'salida' AND movimiento_fecha >= date_trunc('month', CURRENT_DATE)"
            ),
            db.query(
                `SELECT COUNT(*)::int AS total
                 FROM public.producto
                 WHERE producto_estado = 'activo'
                   AND producto_stock_actual <= COALESCE(producto_stock_minimo, 5)
                   ${tipoNegocioFiltro ? "AND COALESCE(producto_tipo_negocio, 'comida') = $1" : ''}`,
                tipoNegocioFiltro ? [tipoNegocioFiltro] : []
            ),
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE mesa_estado <> 'inactiva')::int AS mesas_activas,
                    COUNT(*) FILTER (WHERE mesa_estado = 'ocupada')::int AS mesas_ocupadas
                FROM public.mesa
            `)
        ]);

        // Indicadores de Ventas del período (Subflujos CU 33, CU 75 y CU 88)
        const ventasParams = [];
        const ventasConds = ["m.movimiento_tipo = 'salida'", "m.movimiento_motivo = 'venta'"];
        if (fDesdeStr) {
            ventasParams.push(fDesdeStr);
            ventasConds.push(`m.movimiento_fecha::date >= $${ventasParams.length}::date`);
        }
        if (fHastaStr) {
            ventasParams.push(fHastaStr);
            ventasConds.push(`m.movimiento_fecha::date <= $${ventasParams.length}::date`);
        }
        if (tipoNegocioFiltro) {
            ventasParams.push(tipoNegocioFiltro);
            ventasConds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${ventasParams.length}`);
        }

        const { rows: ventasRows } = await db.query(`
            SELECT
                m.movimiento_id,
                m.movimiento_cantidad,
                COALESCE(m.movimiento_costo_total, m.movimiento_cantidad * p.producto_precio, 0)::numeric(14,2) AS monto_venta,
                ROUND(m.movimiento_cantidad * p.producto_precio, 2)::numeric(14,2) AS monto_precio_venta,
                COALESCE(p.producto_tipo_negocio, 'comida') AS tipo_negocio,
                CASE
                    WHEN COALESCE(p.producto_tipo_negocio, 'comida') = 'merch' THEN 'Tienda Merchandising'
                    ELSE 'Puesto de Comida'
                END AS puesto_venta
            FROM public.movimiento_stock m
            JOIN public.producto p ON p.producto_id = m.producto_id
            WHERE ${ventasConds.join(' AND ')}
        `, ventasParams);

        let ventasMontoTotal = 0;
        let ventasUnidadesTotal = 0;
        let ventasComidaMonto = 0;
        let ventasComidaUnidades = 0;
        let ventasMerchMonto = 0;
        let ventasMerchUnidades = 0;
        const mapaPuestos = {
            'Puesto de Comida': { puesto: 'Puesto de Comida', tipo_negocio: 'comida', transacciones: 0, unidades: 0, monto_total: 0 },
            'Tienda Merchandising': { puesto: 'Tienda Merchandising', tipo_negocio: 'merch', transacciones: 0, unidades: 0, monto_total: 0 }
        };

        for (const v of ventasRows) {
            const monto = Number(v.monto_precio_venta) > 0 ? Number(v.monto_precio_venta) : Number(v.monto_venta || 0);
            const cant = Number(v.movimiento_cantidad || 0);
            ventasMontoTotal += monto;
            ventasUnidadesTotal += cant;

            if (v.tipo_negocio === 'merch') {
                ventasMerchMonto += monto;
                ventasMerchUnidades += cant;
            } else {
                ventasComidaMonto += monto;
                ventasComidaUnidades += cant;
            }

            const pKey = v.puesto_venta;
            if (mapaPuestos[pKey]) {
                mapaPuestos[pKey].transacciones += 1;
                mapaPuestos[pKey].unidades = Number((mapaPuestos[pKey].unidades + cant).toFixed(2));
                mapaPuestos[pKey].monto_total = Number((mapaPuestos[pKey].monto_total + monto).toFixed(2));
            }
        }

        const cantidadVentas = ventasRows.length;
        const ticketPromedio = cantidadVentas > 0 ? Number((ventasMontoTotal / cantidadVentas).toFixed(2)) : 0;

        // Indicadores de Mermas acumuladas en el período (Subflujos CU 33, CU 73 y CU 75)
        const mermasParams = [];
        const mermasConds = [];
        if (fDesdeStr) {
            mermasParams.push(fDesdeStr);
            mermasConds.push(`me.merma_fecha >= $${mermasParams.length}::date`);
        }
        if (fHastaStr) {
            mermasParams.push(fHastaStr);
            mermasConds.push(`me.merma_fecha <= $${mermasParams.length}::date`);
        }
        if (tipoNegocioFiltro) {
            mermasParams.push(tipoNegocioFiltro);
            mermasConds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${mermasParams.length}`);
        }
        const mermasWhere = mermasConds.length > 0 ? `WHERE ${mermasConds.join(' AND ')}` : '';

        const { rows: mermasResumen } = await db.query(`
            SELECT
                COUNT(*)::int AS total_registros,
                COALESCE(SUM(me.merma_cantidad), 0)::numeric(12,2) AS total_unidades,
                COALESCE(SUM(me.merma_costo_total), 0)::numeric(14,2) AS total_costo
            FROM public.merma me
            LEFT JOIN public.producto p ON p.producto_id = me.producto_id
            ${mermasWhere}
        `, mermasParams);

        // Detalle de existencias filtradas por tipo de negocio / puesto
        const prodParams = [];
        const prodConds = [];
        if (tipoNegocioFiltro) {
            prodParams.push(tipoNegocioFiltro);
            prodConds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${prodParams.length}`);
        }
        const prodWhere = prodConds.length > 0 ? `WHERE ${prodConds.join(' AND ')}` : '';

        const { rows: existencias } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                p.producto_estado,
                p.producto_precio,
                p.producto_stock_actual,
                COALESCE(p.producto_stock_minimo, 5) AS producto_stock_minimo,
                (p.producto_stock_actual <= COALESCE(p.producto_stock_minimo, 5)) AS stock_critico,
                u.unidad_medida_codigo,
                COUNT(l.lote_id)::int AS lotes_registrados,
                MIN(l.lote_fecha_vencimiento) AS proximo_vencimiento
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.lote l ON l.producto_id = p.producto_id AND l.lote_cantidad_disponible > 0
            ${prodWhere}
            GROUP BY p.producto_id, u.unidad_medida_codigo
            ORDER BY p.producto_stock_actual ASC, p.producto_nombre ASC
        `, prodParams);

        res.json({
            filtros_aplicados: {
                fecha_desde: fDesdeStr,
                fecha_hasta: fHastaStr,
                tipo_negocio: tipoNegocioFiltro || 'todos',
                puesto: puesto || 'todos'
            },
            umbral_dias_vencimiento: umbralDias,
            resumen: {
                productos_activos: productosActivosRes.rows[0].total,
                unidades_activas: unidadesRes.rows[0].total,
                proveedores_activos: proveedoresRes.rows[0].total,
                ubicaciones_activas: ubicacionesRes.rows[0].total,
                productos_stock_critico: stockCriticoRes.rows[0].total,
                lotes_proximos_vencer: porVencerRes.rows[0].total,
                lotes_vencidos: vencidosRes.rows[0].total,
                salidas_mes: Number(salidasMesRes.rows[0].total),
                ventas_periodo_monto: Number(ventasMontoTotal.toFixed(2)),
                ventas_periodo_unidades: Number(ventasUnidadesTotal.toFixed(2)),
                cantidad_ventas: cantidadVentas,
                ticket_promedio: ticketPromedio,
                ventas_comida_monto: Number(ventasComidaMonto.toFixed(2)),
                ventas_comida_unidades: Number(ventasComidaUnidades.toFixed(2)),
                ventas_merch_monto: Number(ventasMerchMonto.toFixed(2)),
                ventas_merch_unidades: Number(ventasMerchUnidades.toFixed(2)),
                mermas_periodo_registros: Number(mermasResumen[0].total_registros || 0),
                mermas_periodo_unidades: Number(mermasResumen[0].total_unidades || 0),
                mermas_periodo_costo: Number(mermasResumen[0].total_costo || 0),
                mesas_activas: Number(mesasRes.rows[0]?.mesas_activas || 0),
                mesas_ocupadas: Number(mesasRes.rows[0]?.mesas_ocupadas || 0)
            },
            ventas_por_puesto: Object.values(mapaPuestos),
            detalles: existencias
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al generar el dashboard', error: error.message });
    }
};

// =========================================================================
// CU 33 (Subflujos CU 72, CU 73, CU 74 y CU 76): Generación y Exportación de Reportes
// =========================================================================
const generarReporteOperativo = async (req, res) => {
    const {
        tipo_reporte = 'ventas',
        fecha_desde,
        fecha_hasta,
        tipo_negocio = 'todos',
        puesto = 'todos',
        producto_id,
        categoria_id,
        proveedor_id,
        usuario_id,
        motivo,
        dias_vencimiento,
        formato = 'json'
    } = req.query;

    const valFechas = validarRangoFechas(fecha_desde, fecha_hasta);
    if (!valFechas.valido) {
        return res.status(400).json({ message: valFechas.mensaje });
    }

    const fDesdeStr = fecha_desde ? String(fecha_desde).slice(0, 10) : null;
    const fHastaStr = fecha_hasta ? String(fecha_hasta).slice(0, 10) : null;
    const tipoNegocioFiltro = ['comida', 'merch'].includes(tipo_negocio)
        ? tipo_negocio
        : (puesto === 'puesto_comida' ? 'comida' : (puesto === 'tienda_merch' ? 'merch' : null));

    try {
        const umbralDias = await obtenerUmbralSistema();
        let titulo = 'Reporte Operativo ParkFlow';
        let columnas = [];
        let filas = [];
        let kpis = {};

        if (tipo_reporte === 'ventas') {
            // Subflujo CU 72: Generando Reportes de Ventas
            titulo = 'Reporte de Ventas por Período, Puesto y Producto (CU 72)';
            const params = [];
            const conds = ["m.movimiento_tipo = 'salida'", "m.movimiento_motivo = 'venta'"];

            if (fDesdeStr) {
                params.push(fDesdeStr);
                conds.push(`m.movimiento_fecha::date >= $${params.length}::date`);
            }
            if (fHastaStr) {
                params.push(fHastaStr);
                conds.push(`m.movimiento_fecha::date <= $${params.length}::date`);
            }
            if (tipoNegocioFiltro) {
                params.push(tipoNegocioFiltro);
                conds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${params.length}`);
            }
            if (producto_id) {
                params.push(Number(producto_id));
                conds.push(`m.producto_id = $${params.length}`);
            }
            if (categoria_id) {
                params.push(Number(categoria_id));
                conds.push(`p.categoria_id = $${params.length}`);
            }
            if (usuario_id) {
                params.push(Number(usuario_id));
                conds.push(`m.usuario_id = $${params.length}`);
            }

            const { rows } = await db.query(`
                SELECT
                    m.movimiento_id AS folio_venta,
                    m.movimiento_fecha::date AS fecha,
                    TO_CHAR(m.movimiento_fecha, 'YYYY-MM-DD HH24:MI') AS fecha_hora,
                    CASE
                        WHEN COALESCE(p.producto_tipo_negocio, 'comida') = 'merch' THEN 'Tienda Merchandising'
                        ELSE 'Puesto de Comida'
                    END AS puesto_venta,
                    COALESCE(p.producto_tipo_negocio, 'comida') AS tipo_negocio,
                    p.producto_codigo,
                    p.producto_nombre,
                    p.producto_categoria,
                    um.unidad_medida_codigo,
                    l.lote_codigo,
                    m.movimiento_cantidad AS cantidad_vendida,
                    p.producto_precio AS precio_unitario_venta,
                    ROUND(m.movimiento_cantidad * p.producto_precio, 2) AS monto_total_venta,
                    COALESCE(m.movimiento_costo_total, 0) AS costo_inventario,
                    TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_responsable,
                    COALESCE(m.movimiento_observacion, 'Venta registrada') AS detalle
                FROM public.movimiento_stock m
                JOIN public.producto p ON p.producto_id = m.producto_id
                LEFT JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
                LEFT JOIN public.lote l ON l.lote_id = m.lote_id
                LEFT JOIN public.usuario u ON u.usuario_id = m.usuario_id
                WHERE ${conds.join(' AND ')}
                ORDER BY m.movimiento_fecha DESC, m.movimiento_id DESC
            `, params);

            const totalMonto = rows.reduce((acc, r) => acc + Number(r.monto_total_venta || 0), 0);
            const totalUnidades = rows.reduce((acc, r) => acc + Number(r.cantidad_vendida || 0), 0);
            const ticketProm = rows.length > 0 ? totalMonto / rows.length : 0;

            kpis = {
                transacciones_venta: rows.length,
                unidades_vendidas: Number(totalUnidades.toFixed(2)),
                monto_total_ventas: Number(totalMonto.toFixed(2)),
                ticket_promedio: Number(ticketProm.toFixed(2))
            };
            columnas = [
                { key: 'folio_venta', label: 'Folio' },
                { key: 'fecha_hora', label: 'Fecha / Hora' },
                { key: 'puesto_venta', label: 'Puesto de Venta' },
                { key: 'tipo_negocio', label: 'Línea Negocio' },
                { key: 'producto_codigo', label: 'Código' },
                { key: 'producto_nombre', label: 'Producto' },
                { key: 'producto_categoria', label: 'Categoría' },
                { key: 'lote_codigo', label: 'Lote' },
                { key: 'cantidad_vendida', label: 'Cantidad' },
                { key: 'precio_unitario_venta', label: 'Precio Unit. ($)' },
                { key: 'monto_total_venta', label: 'Total Venta ($)' },
                { key: 'cajero_responsable', label: 'Cajero / Usuario' }
            ];
            filas = rows;
        } else if (tipo_reporte === 'mermas') {
            // Subflujo CU 73: Generando Reportes de Mermas
            titulo = 'Reporte Valorizado de Mermas y Desperdicios (CU 73)';
            const params = [];
            const conds = [];

            if (fDesdeStr) {
                params.push(fDesdeStr);
                conds.push(`me.merma_fecha >= $${params.length}::date`);
            }
            if (fHastaStr) {
                params.push(fHastaStr);
                conds.push(`me.merma_fecha <= $${params.length}::date`);
            }
            if (tipoNegocioFiltro) {
                params.push(tipoNegocioFiltro);
                conds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${params.length}`);
            }
            if (producto_id) {
                params.push(Number(producto_id));
                conds.push(`me.producto_id = $${params.length}`);
            }
            if (usuario_id) {
                params.push(Number(usuario_id));
                conds.push(`me.usuario_id = $${params.length}`);
            }
            if (motivo && motivo !== 'todos') {
                params.push(String(motivo).trim().toLowerCase());
                conds.push(`(LOWER(me.merma_motivo::text) = $${params.length} OR LOWER(COALESCE(cm.motivo_codigo, '')) = $${params.length})`);
            }

            const whereSql = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
            const { rows } = await db.query(`
                SELECT
                    me.merma_id AS folio_merma,
                    TO_CHAR(me.merma_fecha, 'YYYY-MM-DD') AS fecha,
                    COALESCE(cm.motivo_codigo, UPPER(me.merma_motivo::text)) AS codigo_motivo,
                    COALESCE(cm.motivo_nombre, me.merma_motivo::text) AS motivo_merma,
                    COALESCE(p.producto_codigo, 'INSUMO') AS codigo_item,
                    COALESCE(p.producto_nombre, ins.insumo_nombre, '-') AS nombre_item,
                    COALESCE(p.producto_categoria, 'Insumo') AS categoria,
                    COALESCE(l.lote_codigo, '-') AS lote_codigo,
                    me.merma_cantidad AS cantidad_perdida,
                    COALESCE(me.merma_costo_unitario, 0) AS costo_unitario,
                    COALESCE(me.merma_costo_total, 0) AS costo_total_perdida,
                    TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_responsable,
                    COALESCE(me.merma_observacion, '-') AS observacion
                FROM public.merma me
                LEFT JOIN public.catalogo_motivo cm ON cm.motivo_id = me.motivo_catalogo_id
                LEFT JOIN public.producto p ON p.producto_id = me.producto_id
                LEFT JOIN public.insumo ins ON ins.insumo_id = me.insumo_id
                LEFT JOIN public.lote l ON l.lote_id = me.lote_id
                LEFT JOIN public.usuario u ON u.usuario_id = me.usuario_id
                ${whereSql}
                ORDER BY me.merma_fecha DESC, me.merma_id DESC
            `, params);

            const totalUnidades = rows.reduce((acc, r) => acc + Number(r.cantidad_perdida || 0), 0);
            const totalCosto = rows.reduce((acc, r) => acc + Number(r.costo_total_perdida || 0), 0);

            kpis = {
                registros_merma: rows.length,
                unidades_perdidas: Number(totalUnidades.toFixed(2)),
                costo_total_mermas: Number(totalCosto.toFixed(2))
            };
            columnas = [
                { key: 'folio_merma', label: 'Folio' },
                { key: 'fecha', label: 'Fecha' },
                { key: 'codigo_motivo', label: 'Cód. Motivo' },
                { key: 'motivo_merma', label: 'Motivo Clasificado' },
                { key: 'codigo_item', label: 'Código' },
                { key: 'nombre_item', label: 'Producto / Insumo' },
                { key: 'lote_codigo', label: 'Lote' },
                { key: 'cantidad_perdida', label: 'Cant. Perdida' },
                { key: 'costo_unitario', label: 'Costo Unit. ($)' },
                { key: 'costo_total_perdida', label: 'Costo Total ($)' },
                { key: 'usuario_responsable', label: 'Responsable' },
                { key: 'observacion', label: 'Observación' }
            ];
            filas = rows;
        } else if (tipo_reporte === 'vencimientos') {
            // Subflujo CU 74: Generando Reportes de Vencimiento
            const diasRef = dias_vencimiento !== undefined && dias_vencimiento !== ''
                ? Math.max(0, parseInt(dias_vencimiento, 10) || umbralDias)
                : umbralDias;
            titulo = `Reporte de Control de Vencimientos y Alertas (Umbral: ${diasRef} días) (CU 74)`;

            const params = [diasRef];
            const conds = ['l.lote_cantidad_disponible > 0', 'l.lote_fecha_vencimiento IS NOT NULL'];

            if (tipoNegocioFiltro) {
                params.push(tipoNegocioFiltro);
                conds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${params.length}`);
            }
            if (categoria_id) {
                params.push(Number(categoria_id));
                conds.push(`p.categoria_id = $${params.length}`);
            }
            if (proveedor_id) {
                params.push(Number(proveedor_id));
                conds.push(`l.proveedor_id = $${params.length}`);
            }
            if (producto_id) {
                params.push(Number(producto_id));
                conds.push(`l.producto_id = $${params.length}`);
            }
            if (fDesdeStr) {
                params.push(fDesdeStr);
                conds.push(`l.lote_fecha_vencimiento >= $${params.length}::date`);
            }
            if (fHastaStr) {
                params.push(fHastaStr);
                conds.push(`l.lote_fecha_vencimiento <= $${params.length}::date`);
            }

            const { rows } = await db.query(`
                SELECT
                    l.lote_codigo,
                    p.producto_codigo,
                    p.producto_nombre,
                    p.producto_categoria,
                    pr.proveedor_nombre,
                    COALESCE(ub.ubicacion_codigo || ' - ' || ub.ubicacion_nombre, 'Sin ubicación') AS ubicacion_bodega,
                    TO_CHAR(l.lote_fecha_recepcion, 'YYYY-MM-DD') AS fecha_ingreso,
                    TO_CHAR(l.lote_fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
                    (l.lote_fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                    CASE
                        WHEN l.lote_fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
                        WHEN (l.lote_fecha_vencimiento - CURRENT_DATE) <= 3 THEN 'CRÍTICO (<= 3 días)'
                        WHEN (l.lote_fecha_vencimiento - CURRENT_DATE) <= $1::int THEN 'POR VENCER'
                        ELSE 'VIGENTE'
                    END AS estado_alerta,
                    l.lote_cantidad_disponible AS stock_disponible,
                    COALESCE(l.lote_costo_unitario, 0) AS costo_unitario,
                    ROUND(COALESCE(l.lote_costo_unitario, 0) * l.lote_cantidad_disponible, 2) AS valor_inventario
                FROM public.lote l
                JOIN public.producto p ON p.producto_id = l.producto_id
                LEFT JOIN public.proveedor pr ON pr.proveedor_id = l.proveedor_id
                LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = l.ubicacion_id
                WHERE ${conds.join(' AND ')}
                ORDER BY l.lote_fecha_vencimiento ASC, l.lote_id ASC
            `, params);

            const vencidos = rows.filter(r => Number(r.dias_restantes) < 0).length;
            const porVencer = rows.filter(r => Number(r.dias_restantes) >= 0 && Number(r.dias_restantes) <= diasRef).length;
            const valorRiesgo = rows
                .filter(r => Number(r.dias_restantes) <= diasRef)
                .reduce((acc, r) => acc + Number(r.valor_inventario || 0), 0);

            kpis = {
                total_lotes_evaluados: rows.length,
                lotes_vencidos: vencidos,
                lotes_por_vencer: porVencer,
                valor_en_riesgo: Number(valorRiesgo.toFixed(2))
            };
            columnas = [
                { key: 'lote_codigo', label: 'Código Lote' },
                { key: 'producto_codigo', label: 'Cód. Producto' },
                { key: 'producto_nombre', label: 'Producto' },
                { key: 'producto_categoria', label: 'Categoría' },
                { key: 'proveedor_nombre', label: 'Proveedor' },
                { key: 'ubicacion_bodega', label: 'Ubicación' },
                { key: 'fecha_ingreso', label: 'Ingreso' },
                { key: 'fecha_vencimiento', label: 'Vencimiento' },
                { key: 'dias_restantes', label: 'Días Rest.' },
                { key: 'estado_alerta', label: 'Estado Alerta' },
                { key: 'stock_disponible', label: 'Stock Disp.' },
                { key: 'valor_inventario', label: 'Valor Stock ($)' }
            ];
            filas = rows;
        } else {
            // Existencias consolidadas de inventario (CU 21 / CU 75)
            titulo = 'Reporte Consolidado de Existencias de Inventario (CU 75)';
            const params = [];
            const conds = [];
            if (tipoNegocioFiltro) {
                params.push(tipoNegocioFiltro);
                conds.push(`COALESCE(p.producto_tipo_negocio, 'comida') = $${params.length}`);
            }
            if (categoria_id) {
                params.push(Number(categoria_id));
                conds.push(`p.categoria_id = $${params.length}`);
            }
            const whereSql = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

            const { rows } = await db.query(`
                SELECT
                    p.producto_codigo,
                    p.producto_nombre,
                    p.producto_categoria,
                    COALESCE(p.producto_tipo_negocio, 'comida') AS tipo_negocio,
                    p.producto_estado,
                    u.unidad_medida_codigo AS unidad,
                    p.producto_stock_actual AS stock_actual,
                    COALESCE(p.producto_stock_minimo, 5) AS stock_minimo,
                    CASE
                        WHEN p.producto_stock_actual <= COALESCE(p.producto_stock_minimo, 5) THEN 'CRÍTICO'
                        ELSE 'NORMAL'
                    END AS nivel_stock,
                    COUNT(l.lote_id)::int AS lotes_activos,
                    COALESCE(TO_CHAR(MIN(l.lote_fecha_vencimiento), 'YYYY-MM-DD'), '-') AS proximo_vencimiento,
                    ROUND(p.producto_stock_actual * p.producto_precio, 2) AS valor_referencial
                FROM public.producto p
                JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
                LEFT JOIN public.lote l ON l.producto_id = p.producto_id AND l.lote_cantidad_disponible > 0
                ${whereSql}
                GROUP BY p.producto_id, u.unidad_medida_codigo
                ORDER BY p.producto_stock_actual ASC, p.producto_nombre ASC
            `, params);

            const criticos = rows.filter(r => r.nivel_stock === 'CRÍTICO').length;
            const totalValor = rows.reduce((acc, r) => acc + Number(r.valor_referencial || 0), 0);

            kpis = {
                total_productos: rows.length,
                productos_stock_critico: criticos,
                valor_referencial_total: Number(totalValor.toFixed(2))
            };
            columnas = [
                { key: 'producto_codigo', label: 'Código' },
                { key: 'producto_nombre', label: 'Producto' },
                { key: 'producto_categoria', label: 'Categoría' },
                { key: 'tipo_negocio', label: 'Línea Negocio' },
                { key: 'unidad', label: 'Unidad' },
                { key: 'stock_actual', label: 'Stock Actual' },
                { key: 'stock_minimo', label: 'Stock Mín.' },
                { key: 'nivel_stock', label: 'Nivel Stock' },
                { key: 'lotes_activos', label: 'Lotes Activos' },
                { key: 'proximo_vencimiento', label: 'Próx. Vencimiento' },
                { key: 'valor_referencial', label: 'Valor Ref. ($)' }
            ];
            filas = rows;
        }

        const filtrosAplicados = {
            tipo_reporte,
            fecha_desde: fDesdeStr,
            fecha_hasta: fHastaStr,
            tipo_negocio: tipoNegocioFiltro || 'todos',
            puesto: puesto || 'todos',
            producto_id: producto_id ? Number(producto_id) : null,
            categoria_id: categoria_id ? Number(categoria_id) : null,
            proveedor_id: proveedor_id ? Number(proveedor_id) : null,
            usuario_id: usuario_id ? Number(usuario_id) : null,
            motivo: motivo || null
        };

        // Subflujo CU 76: Exportando Dashboard e Informes en formato compatible con Excel (.csv con BOM UTF-8)
        if (formato === 'csv') {
            await registrarAuditoria({
                usuario_id: req.user?.id || null,
                actor_usuario_id: req.user?.id || null,
                evento_tipo: 'exportacion_reporte_dashboard',
                modulo: 'dashboard',
                accion: 'EXPORTAR_REPORTE_EXCEL_CSV',
                resultado: 'exitoso',
                detalle: `Exportación CSV (${tipo_reporte}) generada con ${filas.length} registros. Filtros: ${JSON.stringify(filtrosAplicados)}`
            });

            const sep = ';';
            const headerLine = columnas.map(c => escaparCeldaCsv(c.label)).join(sep);
            const dataLines = filas.map(row =>
                columnas.map(c => escaparCeldaCsv(row[c.key])).join(sep)
            );
            const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

            const fechaArchivo = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="ParkFlow_Reporte_${tipo_reporte}_${fechaArchivo}.csv"`);
            return res.status(200).send(csvContent);
        }

        res.json({
            tipo_reporte,
            titulo,
            generado_en: new Date().toISOString(),
            filtros_aplicados: filtrosAplicados,
            kpis,
            columnas,
            filas
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al generar el reporte operativo', error: error.message });
    }
};

module.exports = {
    obtenerMetricasDashboard,
    generarReporteOperativo
};
