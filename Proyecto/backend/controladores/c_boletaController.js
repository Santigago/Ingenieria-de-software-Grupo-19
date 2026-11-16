const db = require('../config/db');
const crypto = require('crypto');
const { registrarAuditoria } = require('../config/initDb');

// Generador de sello digital simulado SII (formato estándar Timbre Electrónico DTE)
const generarSelloDigitalSII = (folio, total, fecha) => {
    const raw = `SII-DTE-39|FOLIO:${folio}|TOTAL:${total}|FECHA:${fecha}|KIDZANIA-CHILE-76123456-7`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 40).toUpperCase();
};

// Generador de código único de verificación / generación
const generarCodigoGeneracion = (folio) => {
    return `KIDZ-DTE-${folio}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

// Helper interno para emitir boleta electrónica al registrar una venta POS (CU 27 / Subflujo CU 80)
const emitirBoletaElectronicaParaVenta = async (client, venta, detalles = []) => {
    const folio = venta.folio_boleta;
    const total = Number(venta.total_venta || 0);
    const neto = Number(venta.neto || Math.round(total / 1.19));
    const iva = Number(venta.iva || Math.max(total - neto, 0));
    const fecha = venta.fecha_venta || new Date().toISOString();

    const selloDigital = generarSelloDigitalSII(folio, total, fecha);
    const codigoGeneracion = generarCodigoGeneracion(folio);

    const { rows } = await client.query(`
        INSERT INTO public.boleta_electronica (
            venta_id,
            folio_boleta,
            tipo_documento,
            monto_neto,
            monto_iva,
            monto_total,
            estado_sii,
            codigo_generacion,
            sello_digital,
            veces_impresa,
            fecha_emision
        ) VALUES ($1, $2, 'boleta_electronica_afecta', $3, $4, $5, 'emitida', $6, $7, 1, now())
        ON CONFLICT (folio_boleta) DO UPDATE
        SET monto_neto = EXCLUDED.monto_neto,
            monto_iva = EXCLUDED.monto_iva,
            monto_total = EXCLUDED.monto_total
        RETURNING *
    `, [
        venta.venta_id,
        folio,
        neto,
        iva,
        total,
        codigoGeneracion,
        selloDigital
    ]);

    return rows[0];
};

// =============================================================================
// CU 27 (Subflujo CU 80): Consultar listado de boletas electrónicas emitidas
// =============================================================================
const obtenerBoletas = async (req, res) => {
    const { folio, puesto_id, fecha_desde, fecha_hasta, estado_sii } = req.query;

    try {
        let sql = `
            SELECT
                b.*,
                v.fecha_venta,
                v.metodo_pago,
                v.total_venta,
                v.estado_venta,
                v.estado_sap,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                TRIM(CONCAT(ur.usuario_nombres, ' ', ur.usuario_apellido_paterno)) AS reimpreso_por_nombre,
                (SELECT COUNT(*)::int FROM public.venta_pos_detalle vd WHERE vd.venta_id = b.venta_id) AS total_items
            FROM public.boleta_electronica b
            JOIN public.venta_pos v ON v.venta_id = b.venta_id
            JOIN public.puesto_venta pv ON pv.puesto_id = v.puesto_id
            JOIN public.usuario u ON u.usuario_id = v.cajero_id
            LEFT JOIN public.usuario ur ON ur.usuario_id = b.reimpreso_por_usuario_id
            WHERE 1=1
        `;
        const params = [];

        if (folio) {
            params.push(`%${folio.trim().toUpperCase()}%`);
            sql += ` AND UPPER(b.folio_boleta) LIKE $${params.length}`;
        }
        if (puesto_id) {
            params.push(Number(puesto_id));
            sql += ` AND v.puesto_id = $${params.length}`;
        }
        if (fecha_desde) {
            params.push(fecha_desde);
            sql += ` AND b.fecha_emision >= $${params.length}::timestamp`;
        }
        if (fecha_hasta) {
            params.push(`${fecha_hasta} 23:59:59`);
            sql += ` AND b.fecha_emision <= $${params.length}::timestamp`;
        }
        if (estado_sii) {
            params.push(estado_sii);
            sql += ` AND b.estado_sii = $${params.length}`;
        }

        sql += ` ORDER BY b.fecha_emision DESC, b.boleta_id DESC LIMIT 100`;

        const { rows } = await db.query(sql, params);
        res.json(rows.map(b => ({
            ...b,
            monto_neto: Number(b.monto_neto || 0),
            monto_iva: Number(b.monto_iva || 0),
            monto_total: Number(b.monto_total || 0)
        })));
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar boletas electrónicas', error: error.message });
    }
};

// =============================================================================
// CU 27 (Subflujo CU 80): Obtener detalle completo de una boleta para visualización/impresión
// =============================================================================
const obtenerBoletaPorFolio = async (req, res) => {
    const { folio } = req.params;

    try {
        const { rows } = await db.query(`
            SELECT
                b.*,
                v.fecha_venta,
                v.metodo_pago,
                v.monto_efectivo,
                v.monto_tarjeta_debito,
                v.monto_tarjeta_credito,
                v.monto_transferencia,
                v.monto_recibido,
                v.vuelto,
                v.codigo_autorizacion,
                v.estado_venta,
                v.estado_sap,
                v.doc_entry_sap,
                v.codigo_promocion,
                v.descuento_total,
                pv.puesto_id,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                u.usuario_id AS cajero_id,
                u.usuario_run AS cajero_run,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                TRIM(CONCAT(ur.usuario_nombres, ' ', ur.usuario_apellido_paterno)) AS reimpreso_por_nombre
            FROM public.boleta_electronica b
            JOIN public.venta_pos v ON v.venta_id = b.venta_id
            JOIN public.puesto_venta pv ON pv.puesto_id = v.puesto_id
            JOIN public.usuario u ON u.usuario_id = v.cajero_id
            LEFT JOIN public.usuario ur ON ur.usuario_id = b.reimpreso_por_usuario_id
            WHERE UPPER(b.folio_boleta) = UPPER($1)
            LIMIT 1
        `, [folio.trim()]);

        if (rows.length === 0) {
            return res.status(404).json({ message: `No se encontró la boleta electrónica con folio "${folio}" (CU 80)` });
        }

        const boleta = rows[0];

        // Obtener ítems detallados de la venta
        const { rows: items } = await db.query(`
            SELECT
                vd.detalle_id,
                vd.producto_id,
                vd.producto_codigo,
                vd.producto_nombre,
                vd.cantidad,
                vd.precio_unitario,
                vd.descuento_linea,
                vd.subtotal_linea,
                u.unidad_medida_codigo
            FROM public.venta_pos_detalle vd
            JOIN public.producto p ON p.producto_id = vd.producto_id
            LEFT JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            WHERE vd.venta_id = $1
            ORDER BY vd.detalle_id ASC
        `, [boleta.venta_id]);

        // Obtener desglose de pagos
        const { rows: pagos } = await db.query(`
            SELECT * FROM public.venta_pos_pago WHERE venta_id = $1 ORDER BY pago_id ASC
        `, [boleta.venta_id]);

        res.json({
            boleta: {
                ...boleta,
                monto_neto: Number(boleta.monto_neto || 0),
                monto_iva: Number(boleta.monto_iva || 0),
                monto_total: Number(boleta.monto_total || 0),
                descuento_total: Number(boleta.descuento_total || 0),
                monto_efectivo: Number(boleta.monto_efectivo || 0),
                monto_tarjeta_debito: Number(boleta.monto_tarjeta_debito || 0),
                monto_tarjeta_credito: Number(boleta.monto_tarjeta_credito || 0),
                monto_transferencia: Number(boleta.monto_transferencia || 0),
                vuelto: Number(boleta.vuelto || 0),
                empresa_emisor: {
                    razon_social: 'KidZania Santiago SpA',
                    rut: '76.123.456-7',
                    giro: 'Parques de Entretención y Servicios Gastronómicos',
                    direccion: 'Av. Presidente Riesco 5330, Las Condes, Santiago',
                    resolucion_sii: 'Resolución Ex. SII N° 80 de 2014'
                }
            },
            items: items.map(i => ({
                ...i,
                cantidad: Number(i.cantidad),
                precio_unitario: Number(i.precio_unitario),
                descuento_linea: Number(i.descuento_linea || 0),
                subtotal_linea: Number(i.subtotal_linea)
            })),
            pagos: pagos.map(p => ({
                ...p,
                monto: Number(p.monto),
                monto_recibido: Number(p.monto_recibido || 0),
                vuelto: Number(p.vuelto || 0)
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar detalle de boleta', error: error.message });
    }
};

// =============================================================================
// CU 27 (Subflujo CU 87): Reimprimir boleta electrónica
// Subflujo: no altera montos contables ni crea un nuevo folio; incrementa el contador,
// registra fecha/motivo/usuario responsable y emite marca de agua "COPIA REIMPRESIÓN".
// =============================================================================
const reimprimirBoleta = async (req, res) => {
    const { folio } = req.params;
    const { motivo = 'Solicitud de cliente en punto de venta' } = req.body;
    const usuarioId = req.user?.id || null;

    try {
        const { rows: boletaExiste } = await db.query(
            'SELECT * FROM public.boleta_electronica WHERE UPPER(folio_boleta) = UPPER($1)',
            [folio.trim()]
        );

        if (boletaExiste.length === 0) {
            return res.status(404).json({ message: `No existe la boleta electrónica con folio "${folio}" para reimpresión (CU 87)` });
        }

        const b = boletaExiste[0];
        const nuevoConteo = Number(b.veces_impresa || 1) + 1;

        const { rows: actualizada } = await db.query(`
            UPDATE public.boleta_electronica
            SET veces_impresa = veces_impresa + 1,
                ultima_reimpresion = now(),
                motivo_reimpresion = $1,
                reimpreso_por_usuario_id = $2
            WHERE boleta_id = $3
            RETURNING *
        `, [motivo.trim(), usuarioId, b.boleta_id]);

        await registrarAuditoria({
            usuario_id: usuarioId,
            actor_usuario_id: usuarioId,
            evento_tipo: 'reimpresion_boleta',
            modulo: 'pos',
            accion: 'REIMPRIMIR_BOLETA_ELECTRONICA',
            resultado: 'exitoso',
            detalle: `Reimpresión N° ${nuevoConteo} de Boleta ${b.folio_boleta} por motivo: "${motivo}". Sin alteración contable ni fiscal (CU 87).`
        });

        res.json({
            message: `Boleta ${b.folio_boleta} reimpresa con éxito (Copia N° ${nuevoConteo})`,
            boleta: actualizada[0],
            es_copia: true,
            rotulo_copia: `COPIA REIMPRESIÓN (N° ${nuevoConteo})`,
            fecha_reimpresion: actualizada[0].ultima_reimpresion
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al procesar la reimpresión de boleta', error: error.message });
    }
};

module.exports = {
    emitirBoletaElectronicaParaVenta,
    obtenerBoletas,
    obtenerBoletaPorFolio,
    reimprimirBoleta
};

