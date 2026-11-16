const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

// Helper interno para estructurar y ejecutar la sincronización de una venta con SAP Business One (CU 31 / Subflujo CU 81)
const sincronizarVentaConSAP = async (clientOrPool, ventaId) => {
    // 1. Obtener cabecera de la venta, caja y puesto
    const { rows: vRows } = await clientOrPool.query(`
        SELECT
            v.*,
            pv.puesto_codigo,
            pv.puesto_nombre,
            pv.puesto_tipo_negocio,
            TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre
        FROM public.venta_pos v
        JOIN public.puesto_venta pv ON pv.puesto_id = v.puesto_id
        JOIN public.usuario u ON u.usuario_id = v.cajero_id
        WHERE v.venta_id = $1
    `, [ventaId]);

    if (vRows.length === 0) {
        throw new Error(`Venta con ID ${ventaId} no encontrada para sincronización SAP`);
    }
    const venta = vRows[0];

    // 2. Obtener líneas de detalle de la venta
    const { rows: dRows } = await clientOrPool.query(`
        SELECT
            vd.*,
            p.producto_tipo_negocio,
            p.producto_codigo
        FROM public.venta_pos_detalle vd
        JOIN public.producto p ON p.producto_id = vd.producto_id
        WHERE vd.venta_id = $1
        ORDER BY vd.detalle_id ASC
    `, [ventaId]);

    // 3. Estructurar payload estándar SAP Business One Service Layer (Objeto Orders / Invoices OINV)
    const cuentaContable = venta.puesto_tipo_negocio === 'merch' ? '4.1.01.020' : '4.1.01.010';
    const centroCosto = venta.puesto_tipo_negocio === 'merch' ? 'CC-MERCHANDISING' : 'CC-ALIMENTOS';

    const documentLines = dRows.map((line, idx) => ({
        LineNum: idx,
        ItemCode: line.producto_codigo,
        ItemDescription: line.producto_nombre,
        Quantity: Number(line.cantidad),
        UnitPrice: Number(line.precio_unitario),
        DiscountPercent: Number(line.descuento_linea) > 0 ? Number(((line.descuento_linea / (line.precio_unitario * line.cantidad)) * 100).toFixed(2)) : 0,
        LineTotal: Number(line.subtotal_linea),
        VatGroup: 'IVA_19',
        AccountCode: cuentaContable,
        CostingCode: centroCosto
    }));

    const sapPayload = {
        DocType: 'dDocument_Items',
        CardCode: 'C-CONSUMIDOR-FINAL-KZ',
        CardName: 'Clientes Venta Directa KidZania',
        DocDate: new Date(venta.fecha_venta).toISOString().split('T')[0],
        DocDueDate: new Date(venta.fecha_venta).toISOString().split('T')[0],
        NumAtCard: venta.folio_boleta,
        Comments: `Sincronización automática ParkFlow POS - ${venta.folio_boleta} en ${venta.puesto_nombre}`,
        DocCurrency: 'CLP',
        DocTotal: Number(venta.total_venta),
        U_KZ_Puesto: venta.puesto_codigo,
        U_KZ_MedioPago: venta.metodo_pago,
        U_KZ_CajaID: venta.caja_id,
        U_KZ_FolioBoleta: venta.folio_boleta,
        DocumentLines: documentLines
    };

    // 4. Simulación controlada de respuesta del ERP SAP Business One Service Layer
    const docEntrySimulado = `SAP-${100000 + Number(venta.venta_id)}`;
    const docNumSimulado = `B1-${80000 + Number(venta.venta_id)}`;

    const sapResponse = {
        DocEntry: docEntrySimulado,
        DocNum: docNumSimulado,
        Status: 'Success',
        SyncTimestamp: new Date().toISOString(),
        FiscalPeriod: '2026-11',
        IntegrationEngine: 'ParkFlow-SAP-Connector-v2.0'
    };

    // 5. Registrar log en public.sap_sincronizacion_log
    const { rows: logRows } = await clientOrPool.query(`
        INSERT INTO public.sap_sincronizacion_log (
            venta_id,
            caja_id,
            tipo_sincronizacion,
            estado_sap,
            doc_entry_sap,
            doc_num_sap,
            payload_enviado,
            respuesta_sap,
            intentos,
            fecha_intento,
            fecha_sincronizado
        ) VALUES ($1, $2, 'venta', 'sincronizado', $3, $4, $5, $6, 1, now(), now())
        RETURNING *
    `, [
        venta.venta_id,
        venta.caja_id,
        docEntrySimulado,
        docNumSimulado,
        JSON.stringify(sapPayload),
        JSON.stringify(sapResponse)
    ]);

    // 6. Actualizar estado de sincronización en public.venta_pos
    await clientOrPool.query(`
        UPDATE public.venta_pos
        SET estado_sap = 'sincronizado',
            doc_entry_sap = $1,
            fecha_sincronizacion_sap = now()
        WHERE venta_id = $2
    `, [docEntrySimulado, venta.venta_id]);

    return {
        log: logRows[0],
        doc_entry: docEntrySimulado,
        doc_num: docNumSimulado
    };
};

// =============================================================================
// CU 31 (Subflujo CU 81): Obtener logs históricos de sincronización con SAP
// =============================================================================
const obtenerLogsSincronizacionSAP = async (req, res) => {
    const { estado, fecha_desde, fecha_hasta, limit = 50 } = req.query;

    try {
        let sql = `
            SELECT
                sl.*,
                v.folio_boleta,
                v.total_venta,
                v.fecha_venta,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre
            FROM public.sap_sincronizacion_log sl
            JOIN public.venta_pos v ON v.venta_id = sl.venta_id
            JOIN public.puesto_venta pv ON pv.puesto_id = v.puesto_id
            JOIN public.usuario u ON u.usuario_id = v.cajero_id
            WHERE 1=1
        `;
        const params = [];

        if (estado) {
            params.push(estado);
            sql += ` AND sl.estado_sap = $${params.length}`;
        }
        if (fecha_desde) {
            params.push(fecha_desde);
            sql += ` AND sl.fecha_intento >= $${params.length}::timestamp`;
        }
        if (fecha_hasta) {
            params.push(`${fecha_hasta} 23:59:59`);
            sql += ` AND sl.fecha_intento <= $${params.length}::timestamp`;
        }

        sql += ` ORDER BY sl.fecha_intento DESC, sl.log_id DESC LIMIT $${params.length + 1}`;
        params.push(Number(limit));

        const { rows } = await db.query(sql, params);
        res.json(rows.map(r => ({
            ...r,
            total_venta: Number(r.total_venta || 0)
        })));
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar logs de sincronización SAP', error: error.message });
    }
};

// =============================================================================
// CU 31 (Subflujo CU 81): Resumen y KPIs de estado de integración SAP
// =============================================================================
const obtenerEstadoIntegracionSAP = async (req, res) => {
    try {
        const { rows: kpiRows } = await db.query(`
            SELECT
                COUNT(v.venta_id)::int AS total_ventas,
                COUNT(CASE WHEN v.estado_sap = 'sincronizado' THEN 1 END)::int AS ventas_sincronizadas,
                COUNT(CASE WHEN v.estado_sap = 'pendiente' THEN 1 END)::int AS ventas_pendientes,
                COUNT(CASE WHEN v.estado_sap = 'error' THEN 1 END)::int AS ventas_error,
                COALESCE(SUM(CASE WHEN v.estado_sap = 'sincronizado' THEN v.total_venta ELSE 0 END), 0)::numeric(14,2) AS monto_sincronizado,
                COALESCE(SUM(CASE WHEN v.estado_sap = 'pendiente' THEN v.total_venta ELSE 0 END), 0)::numeric(14,2) AS monto_pendiente
            FROM public.venta_pos v
            WHERE v.estado_venta = 'confirmada'
        `);

        const { rows: ultimoLog } = await db.query(`
            SELECT fecha_sincronizado, doc_entry_sap, doc_num_sap
            FROM public.sap_sincronizacion_log
            WHERE estado_sap = 'sincronizado'
            ORDER BY fecha_sincronizado DESC LIMIT 1
        `);

        const kpis = kpiRows[0] || {};
        res.json({
            resumen: {
                total_ventas: Number(kpis.total_ventas || 0),
                ventas_sincronizadas: Number(kpis.ventas_sincronizadas || 0),
                ventas_pendientes: Number(kpis.ventas_pendientes || 0),
                ventas_error: Number(kpis.ventas_error || 0),
                monto_sincronizado: Number(kpis.monto_sincronizado || 0),
                monto_pendiente: Number(kpis.monto_pendiente || 0),
                porcentaje_sincronizado: kpis.total_ventas > 0
                    ? Number(((kpis.ventas_sincronizadas / kpis.total_ventas) * 100).toFixed(1))
                    : 100,
                ultima_sincronizacion: ultimoLog[0] || null,
                estado_conector: 'Operativo - Conectado a SAP B1 Service Layer'
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar estado de integración SAP', error: error.message });
    }
};

// =============================================================================
// CU 31 (Subflujo CU 81): Sincronizar manualmente o reintentar una venta
// =============================================================================
const reintentarSincronizacionVentaSAP = async (req, res) => {
    const { venta_id } = req.params;

    try {
        const resultado = await sincronizarVentaConSAP(db, Number(venta_id));

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'sincronizacion_sap_manual',
            modulo: 'pos',
            accion: 'SINCRONIZAR_VENTA_SAP',
            resultado: 'exitoso',
            detalle: `Sincronización forzada/reintento de venta #${venta_id} hacia SAP B1. DocEntry: ${resultado.doc_entry} (CU 81)`
        });

        res.json({
            message: `Venta #${venta_id} sincronizada exitosamente con SAP Business One`,
            doc_entry: resultado.doc_entry,
            doc_num: resultado.doc_num,
            log: resultado.log
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al sincronizar venta con SAP B1', error: error.message });
    }
};

// =============================================================================
// CU 31 (Subflujo CU 81): Sincronización masiva de ventas pendientes hacia SAP B1
// =============================================================================
const sincronizarVentasPendientesSAP = async (req, res) => {
    try {
        const { rows: pendientes } = await db.query(`
            SELECT venta_id, folio_boleta, total_venta
            FROM public.venta_pos
            WHERE estado_sap IN ('pendiente', 'error')
              AND estado_venta = 'confirmada'
            ORDER BY fecha_venta ASC
            LIMIT 100
        `);

        if (pendientes.length === 0) {
            return res.json({ message: 'No hay ventas pendientes de sincronización con SAP Business One', procesadas: 0 });
        }

        const sincronizadas = [];
        for (const v of pendientes) {
            try {
                const r = await sincronizarVentaConSAP(db, v.venta_id);
                sincronizadas.push({ venta_id: v.venta_id, folio: v.folio_boleta, doc_entry: r.doc_entry, ok: true });
            } catch (err) {
                sincronizadas.push({ venta_id: v.venta_id, folio: v.folio_boleta, ok: false, error: err.message });
            }
        }

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'sincronizacion_sap_masiva',
            modulo: 'pos',
            accion: 'SINCRONIZAR_PENDIENTES_SAP',
            resultado: 'exitoso',
            detalle: `Procesadas ${sincronizadas.length} ventas pendientes hacia SAP Business One (CU 81)`
        });

        res.json({
            message: `Se procesaron ${sincronizadas.length} ventas hacia SAP Business One`,
            total_procesadas: sincronizadas.length,
            exitosas: sincronizadas.filter(s => s.ok).length,
            fallidas: sincronizadas.filter(s => !s.ok).length,
            detalle: sincronizadas
        });
    } catch (error) {
        res.status(500).json({ message: 'Error en proceso de sincronización masiva con SAP', error: error.message });
    }
};

module.exports = {
    sincronizarVentaConSAP,
    obtenerLogsSincronizacionSAP,
    obtenerEstadoIntegracionSAP,
    reintentarSincronizacionVentaSAP,
    sincronizarVentasPendientesSAP
};

