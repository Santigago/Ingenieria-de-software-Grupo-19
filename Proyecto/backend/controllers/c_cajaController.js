const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');
const { descontarInsumosRecetaPorVenta } = require('./c_productoController');
const { emitirBoletaElectronicaParaVenta } = require('./c_boletaController');
const { sincronizarVentaConSAP } = require('./c_sapController');

const TIPOS_NEGOCIO_PERMITIDOS = ['comida', 'merch'];
const ESTADOS_PUESTO_PERMITIDOS = ['activo', 'inactivo'];
const METODOS_PAGO_PERMITIDOS = ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia'];

const badRequest = (message) => {
    const error = new Error(message);
    error.codigoHttp = 400;
    return error;
};

const calcularTotalesTurnoCaja = async (dbClient, cajaId, fondoInicial = 0, fallbackRow = null) => {
    const { rows } = await dbClient.query(`
        SELECT
            COUNT(*)::int AS cantidad_ventas,
            COALESCE(SUM(total_venta), 0)::numeric(14,2) AS total_ventas_monto,
            COALESCE(SUM(monto_efectivo), 0)::numeric(14,2) AS total_efectivo,
            COALESCE(SUM(monto_tarjeta_debito), 0)::numeric(14,2) AS total_tarjeta_debito,
            COALESCE(SUM(monto_tarjeta_credito), 0)::numeric(14,2) AS total_tarjeta_credito,
            COALESCE(SUM(monto_transferencia), 0)::numeric(14,2) AS total_transferencia
        FROM public.venta_pos
        WHERE caja_id = $1
          AND estado_venta = 'confirmada'
    `, [cajaId]);

    const agg = rows[0] || {};
    let cantidadVentas = Number(agg.cantidad_ventas || 0);
    let totalVentasMonto = Number(agg.total_ventas_monto || 0);
    let totalEfectivo = Number(agg.total_efectivo || 0);
    let totalDebito = Number(agg.total_tarjeta_debito || 0);
    let totalCredito = Number(agg.total_tarjeta_credito || 0);
    let totalTransferencia = Number(agg.total_transferencia || 0);

    if (cantidadVentas === 0 && fallbackRow && Number(fallbackRow.total_ventas_cantidad || 0) > 0) {
        cantidadVentas = Number(fallbackRow.total_ventas_cantidad);
        totalVentasMonto = Number(fallbackRow.total_ventas_monto || 0);
        totalEfectivo = Number(fallbackRow.total_efectivo || 0);
        totalDebito = Number(fallbackRow.total_tarjeta_debito || 0);
        totalCredito = Number(fallbackRow.total_tarjeta_credito || 0);
        totalTransferencia = Number(fallbackRow.total_transferencia || 0);
    }

    const fondo = Number(fondoInicial || 0);
    const efectivoEsperado = Number((fondo + totalEfectivo).toFixed(2));

    return {
        fondo_inicial: fondo,
        cantidad_ventas: cantidadVentas,
        total_ventas_monto: Number(totalVentasMonto.toFixed(2)),
        totales_medio_pago: {
            efectivo: Number(totalEfectivo.toFixed(2)),
            tarjeta_debito: Number(totalDebito.toFixed(2)),
            tarjeta_credito: Number(totalCredito.toFixed(2)),
            transferencia: Number(totalTransferencia.toFixed(2))
        },
        efectivo_esperado: efectivoEsperado
    };
};

const obtenerPuestosVenta = async (req, res) => {
    const { tipo_negocio, estado, q } = req.query;

    try {
        const { rows } = await db.query(`
            SELECT
                pv.puesto_id,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                pv.puesto_descripcion,
                pv.puesto_estado,
                pv.creado_en,
                pv.actualizado_en,
                ca.caja_id AS caja_abierta_id,
                ca.cajero_id AS cajero_actual_id,
                ca.fondo_inicial AS caja_abierta_fondo_inicial,
                ca.fecha_apertura AS caja_abierta_fecha_apertura,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_actual_nombre,
                (SELECT COUNT(*)::int FROM public.caja_sesion cs WHERE cs.puesto_id = pv.puesto_id) AS total_cajas_historicas,
                (SELECT COUNT(*)::int FROM public.venta_pos vp WHERE vp.puesto_id = pv.puesto_id AND vp.estado_venta = 'confirmada') AS total_ventas_historicas,
                (SELECT COALESCE(SUM(vp.total_venta), 0)::numeric(14,2) FROM public.venta_pos vp WHERE vp.puesto_id = pv.puesto_id AND vp.estado_venta = 'confirmada') AS monto_ventas_historico,
                (SELECT COUNT(*)::int FROM public.producto p WHERE p.producto_estado = 'activo' AND COALESCE(p.producto_tipo_negocio, 'comida') = pv.puesto_tipo_negocio) AS productos_catalogo_count
            FROM public.puesto_venta pv
            LEFT JOIN LATERAL (
                SELECT c.caja_id, c.cajero_id, c.fondo_inicial, c.fecha_apertura
                FROM public.caja_sesion c
                WHERE c.puesto_id = pv.puesto_id
                  AND c.estado = 'abierta'
                ORDER BY c.fecha_apertura DESC
                LIMIT 1
            ) ca ON true
            LEFT JOIN public.usuario u ON u.usuario_id = ca.cajero_id
            ORDER BY pv.puesto_tipo_negocio ASC, pv.puesto_id ASC
        `);

        const puestosFormateados = rows.map(r => ({
            ...r,
            ocupado: Boolean(r.caja_abierta_id),
            caja_abierta_fondo_inicial: r.caja_abierta_fondo_inicial !== null ? Number(r.caja_abierta_fondo_inicial) : null,
            total_cajas_historicas: Number(r.total_cajas_historicas || 0),
            total_ventas_historicas: Number(r.total_ventas_historicas || 0),
            monto_ventas_historico: Number(r.monto_ventas_historico || 0),
            productos_catalogo_count: Number(r.productos_catalogo_count || 0)
        }));

        const filtrados = puestosFormateados.filter(p => {
            if (tipo_negocio && tipo_negocio !== 'todos' && p.puesto_tipo_negocio !== tipo_negocio) return false;
            if (estado && estado !== 'todos' && p.puesto_estado !== estado) return false;
            if (q && q.trim()) {
                const term = q.trim().toLowerCase();
                const match = (p.puesto_nombre || '').toLowerCase().includes(term) ||
                              (p.puesto_codigo || '').toLowerCase().includes(term) ||
                              (p.puesto_ubicacion || '').toLowerCase().includes(term);
                if (!match) return false;
            }
            return true;
        });

        const resumen = {
            total_puestos: puestosFormateados.length,
            activos: puestosFormateados.filter(p => p.puesto_estado === 'activo').length,
            inactivos: puestosFormateados.filter(p => p.puesto_estado === 'inactivo').length,
            puestos_comida: puestosFormateados.filter(p => p.puesto_tipo_negocio === 'comida').length,
            puestos_merch: puestosFormateados.filter(p => p.puesto_tipo_negocio === 'merch').length,
            cajas_abiertas: puestosFormateados.filter(p => p.ocupado).length,
            puestos_disponibles: puestosFormateados.filter(p => p.puesto_estado === 'activo' && !p.ocupado).length
        };

        if (req.query.con_resumen === 'true') {
            return res.json({ resumen, puestos: filtrados });
        }

        res.json(filtrados);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los puestos de venta', error: error.message });
    }
};

const crearPuestoVenta = async (req, res) => {
    const {
        codigo,
        nombre,
        tipo_negocio,
        ubicacion = null,
        descripcion = null,
        estado = 'activo'
    } = req.body;

    if (!nombre || !nombre.trim() || !tipo_negocio) {
        return res.status(400).json({
            message: 'Debe ingresar el nombre del puesto y seleccionar su tipo de negocio (comida o merch) (CU 82)'
        });
    }

    const nomLimpio = nombre.trim();
    const tipoLimpio = tipo_negocio.trim().toLowerCase();
    const estLimpio = (estado || 'activo').trim().toLowerCase();

    if (!TIPOS_NEGOCIO_PERMITIDOS.includes(tipoLimpio)) {
        return res.status(400).json({
            message: 'El tipo de negocio del puesto debe ser "comida" o "merch" (CU 82)'
        });
    }
    if (!ESTADOS_PUESTO_PERMITIDOS.includes(estLimpio)) {
        return res.status(400).json({ message: 'Estado de puesto no válido (activo o inactivo)' });
    }

    try {
        const { rows: dupNombre } = await db.query(
            'SELECT puesto_id FROM public.puesto_venta WHERE LOWER(TRIM(puesto_nombre)) = LOWER($1)',
            [nomLimpio]
        );
        if (dupNombre.length > 0) {
            return res.status(400).json({
                message: `Ya existe un puesto de venta registrado con el nombre "${nomLimpio}" (CU 82)`
            });
        }

        let codFinal = codigo ? codigo.trim().toUpperCase() : '';
        if (!codFinal) {
            const prefijo = tipoLimpio === 'comida' ? 'PUESTO-COM' : 'PUESTO-MER';
            const { rows: countRows } = await db.query(
                'SELECT COUNT(*)::int AS total FROM public.puesto_venta WHERE puesto_tipo_negocio = $1',
                [tipoLimpio]
            );
            const correlativo = String(Number(countRows[0]?.total || 0) + 1).padStart(2, '0');
            codFinal = `${prefijo}-${correlativo}-${Date.now().toString().slice(-3)}`;
        } else {
            const { rows: dupCod } = await db.query(
                'SELECT puesto_id FROM public.puesto_venta WHERE UPPER(TRIM(puesto_codigo)) = $1',
                [codFinal]
            );
            if (dupCod.length > 0) {
                return res.status(400).json({
                    message: `Ya existe un puesto de venta con el código "${codFinal}"`
                });
            }
        }

        const { rows } = await db.query(`
            INSERT INTO public.puesto_venta
            (puesto_codigo, puesto_nombre, puesto_tipo_negocio, puesto_ubicacion, puesto_descripcion, puesto_estado)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            codFinal,
            nomLimpio,
            tipoLimpio,
            ubicacion?.trim() || null,
            descripcion?.trim() || null,
            estLimpio
        ]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_puesto_venta',
            modulo: 'puestos',
            accion: 'CREAR_PUESTO_VENTA',
            resultado: 'exitoso',
            detalle: `Puesto de venta creado: ${codFinal} - ${nomLimpio} (${tipoLimpio}, estado: ${estLimpio})`
        });

        res.status(201).json({
            message: 'Puesto de venta registrado correctamente (CU 32 / CU 82)',
            puesto: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar el puesto de venta', error: error.message });
    }
};

const actualizarPuestoVenta = async (req, res) => {
    const { id } = req.params;
    const {
        codigo,
        nombre,
        tipo_negocio,
        ubicacion,
        descripcion,
        estado
    } = req.body;

    if (!nombre || !nombre.trim() || !tipo_negocio) {
        return res.status(400).json({
            message: 'Debe indicar el nombre y el tipo de negocio del puesto para actualizarlo (CU 82)'
        });
    }

    const nomLimpio = nombre.trim();
    const tipoLimpio = tipo_negocio.trim().toLowerCase();
    if (!TIPOS_NEGOCIO_PERMITIDOS.includes(tipoLimpio)) {
        return res.status(400).json({ message: 'El tipo de negocio debe ser "comida" o "merch"' });
    }
    if (estado !== undefined && !ESTADOS_PUESTO_PERMITIDOS.includes(String(estado).toLowerCase())) {
        return res.status(400).json({ message: 'Estado de puesto no válido' });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.puesto_venta WHERE puesto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Puesto de venta no encontrado' });
        }
        const actual = actualRows[0];
        const estFinal = estado ? estado.trim().toLowerCase() : actual.puesto_estado;
        const codFinal = codigo ? codigo.trim().toUpperCase() : actual.puesto_codigo;

        const { rows: dupNombre } = await db.query(
            'SELECT puesto_id FROM public.puesto_venta WHERE LOWER(TRIM(puesto_nombre)) = LOWER($1) AND puesto_id <> $2',
            [nomLimpio, id]
        );
        if (dupNombre.length > 0) {
            return res.status(400).json({
                message: `Ya existe otro puesto de venta con el nombre "${nomLimpio}" (CU 82)`
            });
        }

        const { rows: dupCod } = await db.query(
            'SELECT puesto_id FROM public.puesto_venta WHERE UPPER(TRIM(puesto_codigo)) = $1 AND puesto_id <> $2',
            [codFinal, id]
        );
        if (dupCod.length > 0) {
            return res.status(400).json({
                message: `Ya existe otro puesto de venta con el código "${codFinal}"`
            });
        }

        const { rows: cajaAbiertaRows } = await db.query(
            "SELECT caja_id, cajero_id FROM public.caja_sesion WHERE puesto_id = $1 AND estado = 'abierta' LIMIT 1",
            [id]
        );
        if (cajaAbiertaRows.length > 0) {
            if (estFinal === 'inactivo') {
                return res.status(400).json({
                    message: `No se puede inactivar el puesto "${actual.puesto_nombre}" porque actualmente tiene una caja abierta (Caja #${cajaAbiertaRows[0].caja_id}). Cierre la caja antes de inactivar el puesto (CU 82).`,
                    caja_abierta_id: cajaAbiertaRows[0].caja_id
                });
            }
            if (tipoLimpio !== actual.puesto_tipo_negocio) {
                return res.status(400).json({
                    message: `No se puede cambiar el tipo de negocio del puesto "${actual.puesto_nombre}" mientras mantiene una caja abierta (Caja #${cajaAbiertaRows[0].caja_id}).`
                });
            }
        }

        const ubiFinal = ubicacion !== undefined ? (ubicacion?.trim() || null) : actual.puesto_ubicacion;
        const descFinal = descripcion !== undefined ? (descripcion?.trim() || null) : actual.puesto_descripcion;

        const { rows } = await db.query(`
            UPDATE public.puesto_venta
            SET puesto_codigo = $1,
                puesto_nombre = $2,
                puesto_tipo_negocio = $3,
                puesto_ubicacion = $4,
                puesto_descripcion = $5,
                puesto_estado = $6,
                actualizado_en = now()
            WHERE puesto_id = $7
            RETURNING *
        `, [codFinal, nomLimpio, tipoLimpio, ubiFinal, descFinal, estFinal, id]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'actualizacion_puesto_venta',
            modulo: 'puestos',
            accion: 'EDITAR_PUESTO_VENTA',
            resultado: 'exitoso',
            detalle: `Puesto ID ${id} actualizado: ${codFinal} - ${nomLimpio} (${tipoLimpio}, estado: ${estFinal})`
        });

        res.json({
            message: 'Puesto de venta actualizado correctamente (CU 32 / CU 82)',
            puesto: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el puesto de venta', error: error.message });
    }
};

const cambiarEstadoPuestoVenta = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    const estLimpio = String(estado || '').trim().toLowerCase();
    if (!ESTADOS_PUESTO_PERMITIDOS.includes(estLimpio)) {
        return res.status(400).json({ message: 'Debe indicar un estado válido (activo o inactivo)' });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.puesto_venta WHERE puesto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Puesto de venta no encontrado' });
        }
        const puesto = actualRows[0];

        if (estLimpio === 'inactivo') {
            const { rows: cajaAbiertaRows } = await db.query(
                "SELECT caja_id, cajero_id FROM public.caja_sesion WHERE puesto_id = $1 AND estado = 'abierta' LIMIT 1",
                [id]
            );
            if (cajaAbiertaRows.length > 0) {
                return res.status(400).json({
                    message: `No se puede inactivar el puesto "${puesto.puesto_nombre}" porque tiene una caja abierta (Caja #${cajaAbiertaRows[0].caja_id}). Debe realizarse primero el cierre de caja (CU 82).`,
                    caja_abierta_id: cajaAbiertaRows[0].caja_id
                });
            }
        }

        const { rows } = await db.query(`
            UPDATE public.puesto_venta
            SET puesto_estado = $1,
                actualizado_en = now()
            WHERE puesto_id = $2
            RETURNING *
        `, [estLimpio, id]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_estado_puesto_venta',
            modulo: 'puestos',
            accion: estLimpio === 'inactivo' ? 'INACTIVAR_PUESTO_VENTA' : 'ACTIVAR_PUESTO_VENTA',
            resultado: 'exitoso',
            detalle: `Puesto ${puesto.puesto_codigo} (${puesto.puesto_nombre}) cambiado a estado ${estLimpio} (CU 82)`
        });

        res.json({
            message: `Puesto de venta "${puesto.puesto_nombre}" ${estLimpio === 'inactivo' ? 'inactivado' : 'activado'} correctamente (CU 32 / CU 82)`,
            puesto: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cambiar el estado del puesto de venta', error: error.message });
    }
};

const eliminarPuestoVenta = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: usoRows } = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM public.caja_sesion WHERE puesto_id = $1) +
                (SELECT COUNT(*)::int FROM public.venta_pos WHERE puesto_id = $1) AS total_usos
        `, [id]);
        const usos = Number(usoRows[0]?.total_usos || 0);
        return res.status(400).json({
            message: `No se permite eliminar físicamente un puesto de venta (${usos} caja(s)/venta(s) asociadas). Utilice la inactivación lógica para impedir nuevas aperturas preservando el historial (Sección M.1 / CU 82).`,
            usos_historicos: usos,
            sugerencia_accion: 'inactivar'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al validar eliminación de puesto de venta', error: error.message });
    }
};

const obtenerCatalogoPorTipoNegocio = async (dbClient, tipoNegocio) => {
    const { rows } = await dbClient.query(`
        SELECT
            p.producto_id,
            p.producto_codigo,
            p.producto_nombre,
            p.producto_categoria,
            p.producto_tipo_negocio,
            p.producto_precio,
            p.producto_stock_actual,
            p.producto_stock_minimo,
            u.unidad_medida_codigo
        FROM public.producto p
        JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
        WHERE p.producto_estado = 'activo'
          AND COALESCE(p.producto_tipo_negocio, 'comida') = $1
        ORDER BY p.producto_nombre ASC
    `, [tipoNegocio]);

    return rows.map(r => ({
        ...r,
        producto_precio: Number(r.producto_precio || 0),
        producto_stock_actual: Number(r.producto_stock_actual || 0),
        producto_stock_minimo: Number(r.producto_stock_minimo || 5)
    }));
};

const obtenerEstadoCajaActual = async (req, res) => {
    const rawId = req.query.cajero_id || req.user?.id || req.user?.usuario_id;
    const cajeroId = rawId && !Number.isNaN(Number(rawId)) ? Number(rawId) : null;

    try {
        let cajaRows = [];
        if (cajeroId) {
            const { rows } = await db.query(`
                SELECT
                    c.*,
                    pv.puesto_codigo,
                    pv.puesto_nombre,
                    pv.puesto_tipo_negocio,
                    pv.puesto_ubicacion,
                    pv.puesto_estado,
                    TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre
                FROM public.caja_sesion c
                JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
                JOIN public.usuario u ON u.usuario_id = c.cajero_id
                WHERE c.cajero_id = $1
                  AND c.estado = 'abierta'
                ORDER BY c.fecha_apertura DESC
                LIMIT 1
            `, [cajeroId]);
            cajaRows = rows;
        }

        let cajaAbierta = null;
        let resumenTurno = null;
        let catalogoPuesto = [];
        let ventasTurno = [];

        if (cajaRows.length > 0) {
            const c = cajaRows[0];
            resumenTurno = await calcularTotalesTurnoCaja(db, c.caja_id, c.fondo_inicial, c);
            catalogoPuesto = await obtenerCatalogoPorTipoNegocio(db, c.puesto_tipo_negocio);

            const { rows: vRows } = await db.query(`
                SELECT
                    venta_id,
                    folio_boleta,
                    fecha_venta,
                    total_venta,
                    metodo_pago,
                    monto_efectivo,
                    monto_tarjeta_debito,
                    monto_tarjeta_credito,
                    monto_transferencia,
                    vuelto,
                    estado_venta,
                    observacion
                FROM public.venta_pos
                WHERE caja_id = $1
                ORDER BY fecha_venta DESC, venta_id DESC
                LIMIT 30
            `, [c.caja_id]);

            ventasTurno = vRows.map(v => ({
                ...v,
                total_venta: Number(v.total_venta || 0),
                monto_efectivo: Number(v.monto_efectivo || 0),
                monto_tarjeta_debito: Number(v.monto_tarjeta_debito || 0),
                monto_tarjeta_credito: Number(v.monto_tarjeta_credito || 0),
                monto_transferencia: Number(v.monto_transferencia || 0),
                vuelto: Number(v.vuelto || 0)
            }));

            cajaAbierta = {
                ...c,
                fondo_inicial: Number(c.fondo_inicial || 0),
                efectivo_esperado: resumenTurno.efectivo_esperado,
                resumen_turno: resumenTurno
            };
        }

        const { rows: puestosRows } = await db.query(`
            SELECT
                pv.puesto_id,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                pv.puesto_descripcion,
                pv.puesto_estado,
                ca.caja_id AS caja_abierta_id,
                ca.cajero_id AS cajero_actual_id,
                ca.fecha_apertura AS caja_abierta_fecha_apertura,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_actual_nombre
            FROM public.puesto_venta pv
            LEFT JOIN LATERAL (
                SELECT c.caja_id, c.cajero_id, c.fecha_apertura
                FROM public.caja_sesion c
                WHERE c.puesto_id = pv.puesto_id
                  AND c.estado = 'abierta'
                ORDER BY c.fecha_apertura DESC
                LIMIT 1
            ) ca ON true
            LEFT JOIN public.usuario u ON u.usuario_id = ca.cajero_id
            ORDER BY pv.puesto_tipo_negocio ASC, pv.puesto_id ASC
        `);

        const puestos = puestosRows.map(p => ({
            ...p,
            ocupado: Boolean(p.caja_abierta_id),
            disponible_para_apertura: p.puesto_estado === 'activo' && !p.caja_abierta_id
        }));

        res.json({
            tiene_caja_abierta: Boolean(cajaAbierta),
            caja_abierta: cajaAbierta,
            resumen_turno: resumenTurno,
            catalogo_puesto: catalogoPuesto,
            ventas_turno: ventasTurno,
            puestos
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar estado actual de caja', error: error.message });
    }
};

const abrirCaja = async (req, res) => {
    const {
        puesto_id,
        fondo_inicial,
        observacion_apertura = null,
        cajero_id
    } = req.body;

    const cajeroTargetId = (req.user?.rol_nombre === 'admin' && cajero_id)
        ? Number(cajero_id)
        : Number(req.user?.id);

    if (!puesto_id) {
        return res.status(400).json({
            message: 'Debe seleccionar el puesto de venta donde iniciará su turno (CU 25 / CU 78)'
        });
    }

    const fondoNum = Number(fondo_inicial);
    if (isNaN(fondoNum) || fondoNum < 0 || String(fondo_inicial ?? '').trim() === '') {
        return res.status(400).json({
            message: 'El fondo inicial declarado es obligatorio y debe ser un monto numérico mayor o igual a cero (CU 25 / CU 78)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: cajaCajeroRows } = await client.query(`
            SELECT c.caja_id, c.puesto_id, pv.puesto_nombre
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            WHERE c.cajero_id = $1
              AND c.estado = 'abierta'
            FOR UPDATE OF c
        `, [cajeroTargetId]);

        if (cajaCajeroRows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El cajero ya mantiene una caja abierta en el puesto "${cajaCajeroRows[0].puesto_nombre}" (Caja #${cajaCajeroRows[0].caja_id}). Debe cerrar su caja actual antes de abrir otra (CU 25 / CU 78).`,
                caja_existente_id: cajaCajeroRows[0].caja_id
            });
        }

        const { rows: puestoRows } = await client.query(
            'SELECT * FROM public.puesto_venta WHERE puesto_id = $1 FOR UPDATE',
            [puesto_id]
        );
        if (puestoRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'El puesto de venta seleccionado no existe' });
        }
        const puesto = puestoRows[0];

        if (puesto.puesto_estado !== 'activo') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El puesto de venta "${puesto.puesto_nombre}" se encuentra inactivo y no está habilitado para abrir caja (CU 25 / CU 82)`
            });
        }

        const { rows: cajaPuestoRows } = await client.query(`
            SELECT c.caja_id, c.cajero_id, TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre
            FROM public.caja_sesion c
            LEFT JOIN public.usuario u ON u.usuario_id = c.cajero_id
            WHERE c.puesto_id = $1
              AND c.estado = 'abierta'
            FOR UPDATE OF c
        `, [puesto_id]);

        if (cajaPuestoRows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El puesto "${puesto.puesto_nombre}" ya se encuentra ocupado con una caja abierta por ${cajaPuestoRows[0].cajero_nombre || 'otro cajero'} (Caja #${cajaPuestoRows[0].caja_id}) (CU 25 / CU 78).`,
                caja_ocupada_id: cajaPuestoRows[0].caja_id
            });
        }

        const fondoRedondeado = Number(fondoNum.toFixed(2));
        const obsLimpia = observacion_apertura?.trim() || null;

        const { rows: nuevaCajaRows } = await client.query(`
            INSERT INTO public.caja_sesion
            (
                puesto_id,
                cajero_id,
                estado,
                fondo_inicial,
                efectivo_esperado,
                observacion_apertura,
                fecha_apertura
            )
            VALUES ($1, $2, 'abierta', $3, $3, $4, now())
            RETURNING *
        `, [puesto_id, cajeroTargetId, fondoRedondeado, obsLimpia]);

        const cajaAbierta = nuevaCajaRows[0];
        const catalogoPuesto = await obtenerCatalogoPorTipoNegocio(client, puesto.puesto_tipo_negocio);

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: cajeroTargetId,
            actor_usuario_id: req.user?.id || cajeroTargetId,
            evento_tipo: 'apertura_caja',
            modulo: 'cajas',
            accion: 'ABRIR_CAJA',
            resultado: 'exitoso',
            detalle: `Caja #${cajaAbierta.caja_id} abierta en puesto "${puesto.puesto_nombre}" (${puesto.puesto_tipo_negocio}) con fondo inicial $${fondoRedondeado}`
        });

        res.status(201).json({
            message: `Caja #${cajaAbierta.caja_id} abierta exitosamente en "${puesto.puesto_nombre}". Turno habilitado para registrar ventas (CU 25 / CU 78).`,
            caja: {
                ...cajaAbierta,
                fondo_inicial: Number(cajaAbierta.fondo_inicial),
                efectivo_esperado: Number(cajaAbierta.efectivo_esperado),
                puesto_codigo: puesto.puesto_codigo,
                puesto_nombre: puesto.puesto_nombre,
                puesto_tipo_negocio: puesto.puesto_tipo_negocio,
                puesto_ubicacion: puesto.puesto_ubicacion
            },
            puesto,
            catalogo_puesto: catalogoPuesto
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al abrir la caja en el puesto de venta', error: error.message });
    } finally {
        client.release();
    }
};

const obtenerResumenCierreCaja = async (req, res) => {
    const cajaIdParam = req.params.id || req.query.caja_id;
    const cajeroId = Number(req.user?.id);

    try {
        let query = `
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            JOIN public.usuario u ON u.usuario_id = c.cajero_id
        `;
        const params = [];

        if (cajaIdParam) {
            params.push(Number(cajaIdParam));
            query += ` WHERE c.caja_id = $1`;
        } else {
            params.push(cajeroId);
            query += ` WHERE c.cajero_id = $1 AND c.estado = 'abierta' ORDER BY c.fecha_apertura DESC LIMIT 1`;
        }

        const { rows } = await db.query(query, params);
        if (rows.length === 0) {
            return res.status(404).json({
                message: 'No se encontró una caja abierta para realizar el arqueo y cierre (CU 26 / CU 79)'
            });
        }

        const caja = rows[0];
        const resumenTurno = await calcularTotalesTurnoCaja(db, caja.caja_id, caja.fondo_inicial, caja);

        res.json({
            caja: {
                ...caja,
                fondo_inicial: Number(caja.fondo_inicial || 0)
            },
            resumen_turno: resumenTurno
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al calcular el resumen de cierre de caja', error: error.message });
    }
};

const cerrarCajaConArqueo = async (req, res) => {
    const cajaIdParam = req.params.id || req.body.caja_id;
    const {
        efectivo_contado,
        observacion_cierre = null
    } = req.body;

    const contadoNum = Number(efectivo_contado);
    if (isNaN(contadoNum) || contadoNum < 0 || String(efectivo_contado ?? '').trim() === '') {
        return res.status(400).json({
            message: 'Debe ingresar el monto de efectivo contado físicamente en la caja (mayor o igual a cero) para realizar el arqueo (CU 26 / CU 79)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        let query = `
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
        `;
        const params = [];

        if (cajaIdParam) {
            params.push(Number(cajaIdParam));
            query += ` WHERE c.caja_id = $1 FOR UPDATE OF c`;
        } else {
            params.push(Number(req.user?.id));
            query += ` WHERE c.cajero_id = $1 AND c.estado = 'abierta' ORDER BY c.fecha_apertura DESC LIMIT 1 FOR UPDATE OF c`;
        }

        const { rows } = await client.query(query, params);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: 'No se encontró una caja abierta activa para realizar el cierre y arqueo (CU 26 / CU 79)'
            });
        }

        const caja = rows[0];
        if (caja.estado === 'cerrada') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `La Caja #${caja.caja_id} ya fue cerrada anteriormente y no admite un nuevo arqueo ni nuevas ventas (CU 26 / CU 79)`
            });
        }

        const esAdmin = req.user?.rol_nombre === 'admin' || req.user?.rol === 1;
        if (!esAdmin && Number(caja.cajero_id) !== Number(req.user?.id)) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                message: 'Solo el cajero titular de la caja abierta o un Administrador puede ejecutar su cierre con arqueo'
            });
        }

        const resumen = await calcularTotalesTurnoCaja(client, caja.caja_id, caja.fondo_inicial, caja);
        const efectivoContadoRedondeado = Number(contadoNum.toFixed(2));
        const efectivoEsperado = resumen.efectivo_esperado;
        const diferenciaArqueo = Number((efectivoContadoRedondeado - efectivoEsperado).toFixed(2));

        let estadoArqueo = 'cuadrada';
        let descripcionResultado = 'La caja cuadra exactamente ($0 de diferencia)';
        if (diferenciaArqueo > 0.009) {
            estadoArqueo = 'sobrante';
            descripcionResultado = `Sobrante de efectivo detectado (+$${diferenciaArqueo})`;
        } else if (diferenciaArqueo < -0.009) {
            estadoArqueo = 'faltante';
            descripcionResultado = `Faltante de efectivo detectado (-$${Math.abs(diferenciaArqueo)})`;
        }

        const obsCierreLimpia = observacion_cierre?.trim() || null;

        const { rows: cerradaRows } = await client.query(`
            UPDATE public.caja_sesion
            SET estado = 'cerrada',
                fecha_cierre = now(),
                total_ventas_cantidad = $1,
                total_ventas_monto = $2,
                total_efectivo = $3,
                total_tarjeta_debito = $4,
                total_tarjeta_credito = $5,
                total_transferencia = $6,
                efectivo_esperado = $7,
                efectivo_contado = $8,
                diferencia_arqueo = $9,
                estado_arqueo = $10,
                observacion_cierre = $11
            WHERE caja_id = $12
            RETURNING *
        `, [
            resumen.cantidad_ventas,
            resumen.total_ventas_monto,
            resumen.totales_medio_pago.efectivo,
            resumen.totales_medio_pago.tarjeta_debito,
            resumen.totales_medio_pago.tarjeta_credito,
            resumen.totales_medio_pago.transferencia,
            efectivoEsperado,
            efectivoContadoRedondeado,
            diferenciaArqueo,
            estadoArqueo,
            obsCierreLimpia,
            caja.caja_id
        ]);

        await client.query('COMMIT');

        await registrarAuditoria({
            usuario_id: caja.cajero_id,
            actor_usuario_id: req.user?.id || caja.cajero_id,
            evento_tipo: 'cierre_caja_arqueo',
            modulo: 'cajas',
            accion: 'CERRAR_CAJA_CON_ARQUEO',
            resultado: 'exitoso',
            detalle: `Caja #${caja.caja_id} cerrada en puesto "${caja.puesto_nombre}". Esperado=$${efectivoEsperado}, Contado=$${efectivoContadoRedondeado}, Diferencia=$${diferenciaArqueo} (${estadoArqueo.toUpperCase()})`
        });

        const cajaCerrada = cerradaRows[0];

        res.json({
            message: `Caja #${caja.caja_id} cerrada con arqueo registrado (${estadoArqueo.toUpperCase()}). ${descripcionResultado} (CU 26 / CU 79).`,
            caja: {
                ...cajaCerrada,
                puesto_codigo: caja.puesto_codigo,
                puesto_nombre: caja.puesto_nombre,
                puesto_tipo_negocio: caja.puesto_tipo_negocio,
                fondo_inicial: Number(cajaCerrada.fondo_inicial),
                total_ventas_monto: Number(cajaCerrada.total_ventas_monto),
                total_efectivo: Number(cajaCerrada.total_efectivo),
                total_tarjeta_debito: Number(cajaCerrada.total_tarjeta_debito),
                total_tarjeta_credito: Number(cajaCerrada.total_tarjeta_credito),
                total_transferencia: Number(cajaCerrada.total_transferencia),
                efectivo_esperado: Number(cajaCerrada.efectivo_esperado),
                efectivo_contado: Number(cajaCerrada.efectivo_contado),
                diferencia_arqueo: Number(cajaCerrada.diferencia_arqueo)
            },
            arqueo: {
                caja_id: caja.caja_id,
                puesto_nombre: caja.puesto_nombre,
                puesto_tipo_negocio: caja.puesto_tipo_negocio,
                fecha_apertura: cajaCerrada.fecha_apertura,
                fecha_cierre: cajaCerrada.fecha_cierre,
                fondo_inicial: resumen.fondo_inicial,
                cantidad_ventas: resumen.cantidad_ventas,
                totales_medio_pago: resumen.totales_medio_pago,
                total_ventas_monto: resumen.total_ventas_monto,
                efectivo_esperado: efectivoEsperado,
                efectivo_contado: efectivoContadoRedondeado,
                diferencia_arqueo: diferenciaArqueo,
                estado_arqueo: estadoArqueo,
                descripcion_resultado: descripcionResultado,
                observacion_cierre: obsCierreLimpia
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al cerrar la caja y registrar el arqueo', error: error.message });
    } finally {
        client.release();
    }
};

const calcularTotalVentaPos = async (req, res) => {
    const { items = [], descuento_global = 0, codigo_promocion = null } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            message: 'Debe incluir al menos un producto para calcular el total de la venta (CU 64)'
        });
    }

    try {
        const itemsCalculados = [];
        let subtotalBruto = 0;
        let descuentoLineas = 0;

        for (const item of items) {
            const prodId = Number(item.producto_id);
            const cant = Number(item.cantidad || 1);
            if (!prodId || isNaN(cant) || cant <= 0) {
                return res.status(400).json({
                    message: 'Cada ítem de la venta debe indicar un producto válido y una cantidad mayor a cero (CU 64)'
                });
            }

            const { rows: prodRows } = await db.query(`
                SELECT
                    p.producto_id,
                    p.producto_codigo,
                    p.producto_nombre,
                    p.producto_precio,
                    p.producto_tipo_negocio,
                    p.producto_estado,
                    p.producto_stock_actual,
                    p.categoria_id,
                    u.unidad_medida_codigo
                FROM public.producto p
                LEFT JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
                WHERE p.producto_id = $1
            `, [prodId]);

            if (prodRows.length === 0) {
                return res.status(404).json({ message: `El producto con ID ${prodId} no existe en el inventario (CU 29)` });
            }
            const prod = prodRows[0];
            const precioUnitario = Number(prod.producto_precio || 0);
            const brutoLinea = Math.round(precioUnitario * cant);
            const descLinea = Math.min(Math.max(Math.round(Number(item.descuento_linea || 0)), 0), brutoLinea);
            const netoLinea = Math.max(brutoLinea - descLinea, 0);

            subtotalBruto += brutoLinea;
            descuentoLineas += descLinea;

            itemsCalculados.push({
                producto_id: prod.producto_id,
                producto_codigo: prod.producto_codigo,
                producto_nombre: prod.producto_nombre,
                producto_tipo_negocio: prod.producto_tipo_negocio || 'comida',
                producto_estado: prod.producto_estado,
                categoria_id: prod.categoria_id,
                stock_disponible: Number(prod.producto_stock_actual || 0),
                stock_suficiente: Number(prod.producto_stock_actual || 0) >= cant,
                unidad_medida_codigo: prod.unidad_medida_codigo || 'UN',
                cantidad: cant,
                precio_unitario: precioUnitario,
                subtotal_bruto: brutoLinea,
                descuento_linea: descLinea,
                subtotal_linea: netoLinea
            });
        }

        let descuentoPromocion = 0;
        let promoAplicada = null;

        if (codigo_promocion && codigo_promocion.trim()) {
            const codPromo = codigo_promocion.trim().toUpperCase();
            const { rows: promoRows } = await db.query(
                'SELECT * FROM public.promocion WHERE UPPER(promocion_codigo) = $1',
                [codPromo]
            );

            if (promoRows.length > 0) {
                const pr = promoRows[0];
                const ahora = new Date();
                const esVigente = pr.estado === 'activo'
                    && (!pr.fecha_inicio || new Date(pr.fecha_inicio) <= ahora)
                    && (!pr.fecha_fin || new Date(pr.fecha_fin) >= ahora);

                if (esVigente) {
                    if (!pr.es_acumulable && (descuentoLineas > 0 || Number(descuento_global || 0) > 0)) {
                        return res.status(400).json({
                            message: `La promoción "${pr.promocion_nombre}" NO es acumulable con otros descuentos aplicados en la venta (Subflujo CU 66)`
                        });
                    }

                    if (subtotalBruto >= Number(pr.monto_minimo_compra || 0)) {
                        if (pr.tipo_descuento === 'porcentaje') {
                            descuentoPromocion = Math.round((subtotalBruto * Number(pr.valor_descuento)) / 100);
                        } else if (pr.tipo_descuento === 'monto_fijo') {
                            descuentoPromocion = Math.min(Math.round(Number(pr.valor_descuento)), subtotalBruto);
                        }
                        promoAplicada = {
                            promocion_id: pr.promocion_id,
                            codigo: pr.promocion_codigo,
                            nombre: pr.promocion_nombre,
                            tipo: pr.tipo_descuento,
                            valor: Number(pr.valor_descuento),
                            monto_descuento: descuentoPromocion
                        };
                    }
                }
            }
        }

        const descGlobalNum = Math.max(Math.round(Number(descuento_global || 0)), 0);
        const descuentoTotal = Math.min(descuentoLineas + descGlobalNum + descuentoPromocion, subtotalBruto);
        const totalVenta = Math.max(Math.round(subtotalBruto - descuentoTotal), 0);
        const neto = Math.round(totalVenta / 1.19);
        const iva = Math.max(totalVenta - neto, 0);

        res.json({
            items: itemsCalculados,
            resumen_calculo: {
                cantidad_lineas: itemsCalculados.length,
                unidades_totales: itemsCalculados.reduce((acc, i) => acc + i.cantidad, 0),
                subtotal: subtotalBruto,
                descuento_lineas: descuentoLineas,
                descuento_promocion: descuentoPromocion,
                promocion_aplicada: promoAplicada,
                descuento_total: descuentoTotal,
                neto,
                iva,
                total_venta: totalVenta
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al calcular el total de la venta', error: error.message });
    }
};

const normalizarPagosVenta = ({ metodo_pago, pagos, totalVenta, monto_recibido, codigo_autorizacion }) => {
    const metodoPrincipal = String(metodo_pago || 'efectivo').trim().toLowerCase();

    if (metodoPrincipal === 'kidzos' || (Array.isArray(pagos) && pagos.some(p => String(p.metodo_pago || '').trim().toLowerCase() === 'kidzos'))) {
        throw badRequest('Los KidZos (moneda ficticia del parque) no se aceptan como medio de pago en los puestos de venta (Sección I.5 / CU 32)');
    }

    if (metodoPrincipal === 'combinado' || (Array.isArray(pagos) && pagos.length > 1)) {
        if (!Array.isArray(pagos) || pagos.length < 2) {
            throw badRequest('Para registrar un pago combinado debe indicar al menos dos tramos o medios de pago con sus montos respectivos (CU 63)');
        }

        const tramosNormalizados = [];
        let sumaMontos = 0;
        let mEfectivo = 0;
        let mDebito = 0;
        let mCredito = 0;
        let mTransferencia = 0;
        let vueltoTotal = 0;
        let recibidoEfectivoTotal = null;
        const codigosAuth = [];

        for (const tramo of pagos) {
            const m = String(tramo.metodo_pago || '').trim().toLowerCase();
            if (!METODOS_PAGO_PERMITIDOS.includes(m)) {
                throw badRequest(`Medio de pago "${tramo.metodo_pago}" no válido en pago combinado. Permitidos: ${METODOS_PAGO_PERMITIDOS.join(', ')} (CU 63)`);
            }
            const montoTramo = Math.round(Number(tramo.monto || 0));
            if (isNaN(montoTramo) || montoTramo <= 0) {
                throw badRequest('Cada medio de pago dentro de un pago combinado debe tener un monto mayor a cero (CU 63)');
            }

            sumaMontos += montoTramo;
            if (sumaMontos > totalVenta) {
                throw badRequest(`La suma de los montos del pago combinado ($${sumaMontos}) supera el total de la venta ($${totalVenta}) (CU 63 Paso 6)`);
            }

            let recibidoTramo = montoTramo;
            let vueltoTramo = 0;
            if (m === 'efectivo') {
                mEfectivo += montoTramo;
                if (tramo.monto_recibido !== undefined && tramo.monto_recibido !== null && String(tramo.monto_recibido).trim() !== '') {
                    recibidoTramo = Math.round(Number(tramo.monto_recibido));
                    if (isNaN(recibidoTramo) || recibidoTramo < montoTramo) {
                        throw badRequest(`El efectivo recibido ($${recibidoTramo}) es inferior al tramo en efectivo declarado ($${montoTramo}) (CU 32 / CU 63)`);
                    }
                    vueltoTramo = recibidoTramo - montoTramo;
                }
                recibidoEfectivoTotal = (recibidoEfectivoTotal || 0) + recibidoTramo;
                vueltoTotal += vueltoTramo;
            } else if (m === 'tarjeta_debito') {
                mDebito += montoTramo;
            } else if (m === 'tarjeta_credito') {
                mCredito += montoTramo;
            } else if (m === 'transferencia') {
                mTransferencia += montoTramo;
            }

            const codTramo = tramo.codigo_autorizacion ? String(tramo.codigo_autorizacion).trim() : null;
            if (codTramo) codigosAuth.push(codTramo);

            tramosNormalizados.push({
                metodo_pago: m,
                monto: montoTramo,
                monto_recibido: m === 'efectivo' ? recibidoTramo : montoTramo,
                vuelto: vueltoTramo,
                codigo_autorizacion: codTramo
            });
        }

        if (Math.abs(sumaMontos - totalVenta) >= 1) {
            throw badRequest(`La suma de los pagos combinados ($${sumaMontos}) debe ser exactamente igual al total de la venta ($${totalVenta}). Saldo pendiente: $${totalVenta - sumaMontos} (CU 63 Paso 8)`);
        }

        return {
            metodo_pago_cabecera: 'combinado',
            pagos_detalle: tramosNormalizados,
            monto_efectivo: mEfectivo,
            monto_tarjeta_debito: mDebito,
            monto_tarjeta_credito: mCredito,
            monto_transferencia: mTransferencia,
            monto_recibido: recibidoEfectivoTotal ?? totalVenta,
            vuelto: vueltoTotal,
            codigo_autorizacion: codigosAuth.length > 0 ? codigosAuth.join(' / ') : (codigo_autorizacion ? String(codigo_autorizacion).trim() : null)
        };
    }

    const tramoUnico = (Array.isArray(pagos) && pagos.length === 1) ? pagos[0] : null;
    const metodoUnico = tramoUnico ? String(tramoUnico.metodo_pago || metodoPrincipal).trim().toLowerCase() : metodoPrincipal;

    if (!METODOS_PAGO_PERMITIDOS.includes(metodoUnico)) {
        throw badRequest(`Método de pago no válido. Métodos permitidos: ${METODOS_PAGO_PERMITIDOS.join(', ')} (CU 32)`);
    }

    const recibidoRaw = tramoUnico?.monto_recibido !== undefined ? tramoUnico.monto_recibido : monto_recibido;
    const codAuthUnico = (tramoUnico?.codigo_autorizacion || codigo_autorizacion)
        ? String(tramoUnico?.codigo_autorizacion || codigo_autorizacion).trim()
        : null;

    let montoRecibidoNum = totalVenta;
    let vueltoNum = 0;

    if (metodoUnico === 'efectivo' && recibidoRaw !== null && recibidoRaw !== undefined && String(recibidoRaw).trim() !== '') {
        montoRecibidoNum = Math.round(Number(recibidoRaw));
        if (isNaN(montoRecibidoNum) || montoRecibidoNum < totalVenta) {
            throw badRequest(`El monto recibido en efectivo ($${montoRecibidoNum}) no puede ser inferior al total de la venta ($${totalVenta}) (CU 32 Paso 6.1)`);
        }
        vueltoNum = montoRecibidoNum - totalVenta;
    }

    return {
        metodo_pago_cabecera: metodoUnico,
        pagos_detalle: [{
            metodo_pago: metodoUnico,
            monto: totalVenta,
            monto_recibido: montoRecibidoNum,
            vuelto: vueltoNum,
            codigo_autorizacion: codAuthUnico
        }],
        monto_efectivo: metodoUnico === 'efectivo' ? totalVenta : 0,
        monto_tarjeta_debito: metodoUnico === 'tarjeta_debito' ? totalVenta : 0,
        monto_tarjeta_credito: metodoUnico === 'tarjeta_credito' ? totalVenta : 0,
        monto_transferencia: metodoUnico === 'transferencia' ? totalVenta : 0,
        monto_recibido: montoRecibidoNum,
        vuelto: vueltoNum,
        codigo_autorizacion: codAuthUnico
    };
};

const registrarVentaTurnoCaja = async (req, res) => {
    const {
        items,
        producto_id,
        cantidad = 1,
        descuento_global = 0,
        codigo_promocion = null,
        metodo_pago = 'efectivo',
        pagos = null,
        monto_recibido = null,
        codigo_autorizacion = null,
        observacion = null
    } = req.body;

    const listaItemsEntrada = Array.isArray(items) && items.length > 0
        ? items
        : (producto_id ? [{ producto_id, cantidad, descuento_linea: 0 }] : []);

    if (listaItemsEntrada.length === 0) {
        return res.status(400).json({
            message: 'Debe seleccionar al menos un producto e indicar una cantidad mayor a cero para registrar la venta (CU 21 / CU 28)'
        });
    }

    for (const item of listaItemsEntrada) {
        const c = Number(item.cantidad);
        if (!item.producto_id || isNaN(c) || c <= 0) {
            return res.status(400).json({
                message: 'Cada producto de la venta debe tener una cantidad numérica mayor a cero (CU 28)'
            });
        }
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: cajaRows } = await client.query(`
            SELECT c.*, pv.puesto_nombre, pv.puesto_codigo, pv.puesto_tipo_negocio
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            WHERE c.cajero_id = $1
              AND c.estado = 'abierta'
            ORDER BY c.fecha_apertura DESC
            LIMIT 1
            FOR UPDATE OF c
        `, [req.user?.id]);

        if (cajaRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'No se permite registrar ventas sin una caja abierta. Abra primero una caja en un puesto de venta (UR 8.7 / CU 25 / CU 28).'
            });
        }
        const caja = cajaRows[0];

        const cantidadesAcumuladasPorProducto = new Map();
        for (const item of listaItemsEntrada) {
            const pid = Number(item.producto_id);
            cantidadesAcumuladasPorProducto.set(pid, (cantidadesAcumuladasPorProducto.get(pid) || 0) + Number(item.cantidad));
        }

        const productosMap = new Map();
        for (const [pid, cantTotalRequerida] of cantidadesAcumuladasPorProducto.entries()) {
            const { rows: prodRows } = await client.query(
                'SELECT * FROM public.producto WHERE producto_id = $1 FOR UPDATE',
                [pid]
            );
            if (prodRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    message: `Producto con ID ${pid} no encontrado en el inventario (CU 29)`
                });
            }
            const producto = prodRows[0];

            if (producto.producto_estado !== 'activo') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El producto "${producto.producto_nombre}" se encuentra inactivo y no puede venderse (CU 29)`
                });
            }

            const tipoProd = producto.producto_tipo_negocio || 'comida';
            if (tipoProd !== caja.puesto_tipo_negocio) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El puesto "${caja.puesto_nombre}" es de tipo "${caja.puesto_tipo_negocio}" y no puede vender el producto "${producto.producto_nombre}" de tipo "${tipoProd}" (CU 29 / UR 8.9)`
                });
            }

            if (Number(producto.producto_stock_actual) < cantTotalRequerida) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `Stock insuficiente para "${producto.producto_nombre}" (requerido: ${cantTotalRequerida}, disponible: ${producto.producto_stock_actual}) (CU 30)`
                });
            }

            productosMap.set(pid, producto);
        }

        let subtotalVenta = 0;
        let descuentoLineas = 0;
        const lineasPreparadas = [];

        for (const item of listaItemsEntrada) {
            const prod = productosMap.get(Number(item.producto_id));
            const cant = Number(item.cantidad);
            const precioUnitario = Number(prod.producto_precio || 0);
            const brutoLinea = Math.round(precioUnitario * cant);
            const descLinea = Math.min(Math.max(Math.round(Number(item.descuento_linea || 0)), 0), brutoLinea);
            const subtotalLinea = Math.max(brutoLinea - descLinea, 0);

            subtotalVenta += brutoLinea;
            descuentoLineas += descLinea;

            lineasPreparadas.push({
                producto: prod,
                cantidad: cant,
                precio_unitario: precioUnitario,
                descuento_linea: descLinea,
                subtotal_linea: subtotalLinea
            });
        }

        let descuentoPromocion = 0;
        let codigoPromoAplicado = null;

        if (codigo_promocion && codigo_promocion.trim()) {
            const codPromo = codigo_promocion.trim().toUpperCase();
            const { rows: promoRows } = await client.query(
                'SELECT * FROM public.promocion WHERE UPPER(promocion_codigo) = $1',
                [codPromo]
            );

            if (promoRows.length > 0) {
                const pr = promoRows[0];
                const ahora = new Date();
                const esVigente = pr.estado === 'activo'
                    && (!pr.fecha_inicio || new Date(pr.fecha_inicio) <= ahora)
                    && (!pr.fecha_fin || new Date(pr.fecha_fin) >= ahora);

                if (esVigente) {
                    if (!pr.es_acumulable && (descuentoLineas > 0 || Number(descuento_global || 0) > 0)) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            message: `La promoción "${pr.promocion_nombre}" NO es acumulable con otros descuentos en la venta (Subflujo CU 66)`
                        });
                    }

                    if (subtotalVenta >= Number(pr.monto_minimo_compra || 0)) {
                        if (pr.tipo_descuento === 'porcentaje') {
                            descuentoPromocion = Math.round((subtotalVenta * Number(pr.valor_descuento)) / 100);
                        } else if (pr.tipo_descuento === 'monto_fijo') {
                            descuentoPromocion = Math.min(Math.round(Number(pr.valor_descuento)), subtotalVenta);
                        }
                        codigoPromoAplicado = pr.promocion_codigo;
                    }
                }
            }
        }

        const descGlobalNum = Math.max(Math.round(Number(descuento_global || 0)), 0);
        const descuentoTotal = Math.min(descuentoLineas + descGlobalNum + descuentoPromocion, subtotalVenta);
        const totalVenta = Math.max(Math.round(subtotalVenta - descuentoTotal), 0);
        const netoVenta = Math.round(totalVenta / 1.19);
        const ivaVenta = Math.max(totalVenta - netoVenta, 0);

        const infoPago = normalizarPagosVenta({
            metodo_pago,
            pagos,
            totalVenta,
            monto_recibido,
            codigo_autorizacion
        });

        const folioBoleta = `BOL-${caja.caja_id}-${Date.now().toString().slice(-6)}`;
        const resumenTextoProductos = lineasPreparadas
            .map(l => `${l.producto.producto_nombre} x${l.cantidad}`)
            .join(', ');

        const { rows: ventaRows } = await client.query(`
            INSERT INTO public.venta_pos
            (
                folio_boleta,
                caja_id,
                puesto_id,
                cajero_id,
                subtotal,
                descuento_total,
                neto,
                iva,
                total_venta,
                metodo_pago,
                monto_efectivo,
                monto_tarjeta_debito,
                monto_tarjeta_credito,
                monto_transferencia,
                monto_recibido,
                vuelto,
                codigo_autorizacion,
                codigo_promocion,
                observacion
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            folioBoleta,
            caja.caja_id,
            caja.puesto_id,
            caja.cajero_id,
            subtotalVenta,
            descuentoTotal,
            netoVenta,
            ivaVenta,
            totalVenta,
            infoPago.metodo_pago_cabecera,
            infoPago.monto_efectivo,
            infoPago.monto_tarjeta_debito,
            infoPago.monto_tarjeta_credito,
            infoPago.monto_transferencia,
            infoPago.monto_recibido,
            infoPago.vuelto,
            infoPago.codigo_autorizacion,
            codigoPromoAplicado,
            observacion ? observacion.trim() : resumenTextoProductos
        ]);

        const ventaCreada = ventaRows[0];
        const detallesInsertados = [];
        const insumosRecetaDescontados = [];
        let algunaRecetaAplicada = false;

        for (const linea of lineasPreparadas) {
            const { producto, cantidad: cantLinea, precio_unitario: precioU, descuento_linea: descL, subtotal_linea: subL } = linea;

            await client.query(
                'UPDATE public.producto SET producto_stock_actual = GREATEST(producto_stock_actual - $1, 0), producto_actualizado_en = now() WHERE producto_id = $2',
                [cantLinea, producto.producto_id]
            );

            const { rows: movRows } = await client.query(`
                INSERT INTO public.movimiento_stock
                (movimiento_tipo, movimiento_motivo, movimiento_cantidad, movimiento_costo_unitario, movimiento_costo_total, movimiento_observacion, producto_id, usuario_id)
                VALUES ('salida', 'venta', $1, $2, $3, $4, $5, $6)
                RETURNING movimiento_id
            `, [
                cantLinea,
                precioU,
                subL,
                `Venta ${folioBoleta} en ${caja.puesto_nombre} (Caja #${caja.caja_id}) - ${producto.producto_nombre} x${cantLinea}`,
                producto.producto_id,
                req.user?.id || null
            ]);

            const movimientoId = movRows[0]?.movimiento_id || null;

            const { rows: detRows } = await client.query(`
                INSERT INTO public.venta_pos_detalle
                (
                    venta_id,
                    producto_id,
                    producto_codigo,
                    producto_nombre,
                    cantidad,
                    precio_unitario,
                    descuento_linea,
                    subtotal_linea,
                    movimiento_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                ventaCreada.venta_id,
                producto.producto_id,
                producto.producto_codigo,
                producto.producto_nombre,
                cantLinea,
                precioU,
                descL,
                subL,
                movimientoId
            ]);
            if (detRows[0]) detallesInsertados.push(detRows[0]);

            const resultadoReceta = await descontarInsumosRecetaPorVenta(client, {
                productoId: producto.producto_id,
                cantidadVendida: cantLinea,
                usuarioId: req.user?.id || null,
                referenciaVenta: `${folioBoleta} - Caja #${caja.caja_id} (${caja.puesto_nombre})`
            });

            if (resultadoReceta.tiene_receta) {
                algunaRecetaAplicada = true;
                insumosRecetaDescontados.push(...(resultadoReceta.insumos_descontados || []));
            }
        }

        const pagosInsertados = [];
        for (const tramo of infoPago.pagos_detalle) {
            const { rows: pRows } = await client.query(`
                INSERT INTO public.venta_pos_pago
                (venta_id, metodo_pago, monto, monto_recibido, vuelto, codigo_autorizacion)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [
                ventaCreada.venta_id,
                tramo.metodo_pago,
                tramo.monto,
                tramo.monto_recibido,
                tramo.vuelto,
                tramo.codigo_autorizacion
            ]);
            if (pRows[0]) pagosInsertados.push(pRows[0]);
        }

        await client.query(`
            UPDATE public.caja_sesion
            SET total_ventas_cantidad = total_ventas_cantidad + 1,
                total_ventas_monto = total_ventas_monto + $1,
                total_efectivo = total_efectivo + $2,
                total_tarjeta_debito = total_tarjeta_debito + $3,
                total_tarjeta_credito = total_tarjeta_credito + $4,
                total_transferencia = total_transferencia + $5,
                efectivo_esperado = fondo_inicial + total_efectivo + $2
            WHERE caja_id = $6
        `, [
            totalVenta,
            infoPago.monto_efectivo,
            infoPago.monto_tarjeta_debito,
            infoPago.monto_tarjeta_credito,
            infoPago.monto_transferencia,
            caja.caja_id
        ]);

        const resumenTurno = await calcularTotalesTurnoCaja(client, caja.caja_id, caja.fondo_inicial);

        await client.query('COMMIT');

        let boletaEmitida = null;
        try {
            boletaEmitida = await emitirBoletaElectronicaParaVenta(db, ventaCreada, lineasPreparadas);
        } catch (errBoleta) {
            console.warn('Aviso al emitir boleta electrónica:', errBoleta.message);
        }

        let sapSincronizacion = null;
        try {
            sapSincronizacion = await sincronizarVentaConSAP(db, ventaCreada.venta_id);
        } catch (errSap) {
            console.warn('Aviso al sincronizar venta con SAP B1:', errSap.message);
        }

        let comandaDigital = null;
        try {
            const { enrutarYGenerarComanda } = require('./c_cocinaController');
            comandaDigital = await enrutarYGenerarComanda({
                venta_id: ventaCreada.venta_id,
                puesto_id: caja.puesto_id,
                cajero_id: caja.cajero_id,
                items: lineasPreparadas.map(l => ({
                    producto_id: l.producto.producto_id,
                    producto_codigo: l.producto.producto_codigo,
                    producto_nombre: l.producto.producto_nombre,
                    cantidad: l.cantidad,
                    requiere_cocina: l.producto.requiere_cocina,
                    nota_preparacion: l.observacion || null
                }))
            });
        } catch (errComanda) {
            console.warn('Aviso al enrutar comanda digital de cocina:', errComanda.message);
        }

        await registrarAuditoria({
            usuario_id: caja.cajero_id,
            actor_usuario_id: req.user?.id || caja.cajero_id,
            evento_tipo: 'registro_venta_pos',
            modulo: 'pos',
            accion: infoPago.metodo_pago_cabecera === 'combinado' ? 'REGISTRAR_VENTA_PAGO_COMBINADO' : 'REGISTRAR_VENTA_POS',
            resultado: 'exitoso',
            detalle: `Venta ${folioBoleta} en "${caja.puesto_nombre}" (Caja #${caja.caja_id}): Total=$${totalVenta}, Medio=${infoPago.metodo_pago_cabecera}, Ítems=${lineasPreparadas.length}`
        });

        res.status(201).json({
            message: `Venta registrada en "${caja.puesto_nombre}" (${folioBoleta}) por $${totalVenta} (${infoPago.metodo_pago_cabecera.toUpperCase()})`,
            venta: {
                ...ventaCreada,
                subtotal: Number(ventaCreada.subtotal || totalVenta),
                descuento_total: Number(ventaCreada.descuento_total || 0),
                neto: Number(ventaCreada.neto || netoVenta),
                iva: Number(ventaCreada.iva || ivaVenta),
                total_venta: Number(ventaCreada.total_venta || totalVenta),
                vuelto: infoPago.vuelto,
                estado_sap: sapSincronizacion ? 'sincronizado' : 'pendiente',
                doc_entry_sap: sapSincronizacion?.doc_entry || null
            },
            detalles: detallesInsertados,
            pagos: pagosInsertados,
            boleta: boletaEmitida,
            sap: sapSincronizacion,
            comanda: comandaDigital,
            vuelto: infoPago.vuelto,
            receta_aplicada: algunaRecetaAplicada,
            insumos_descontados: insumosRecetaDescontados,
            resumen_turno: resumenTurno
        });
    } catch (error) {
        await client.query('ROLLBACK');
        const status = error.codigoHttp || 500;
        res.status(status).json({ message: error.message || 'Error al registrar venta en la caja abierta' });
    } finally {
        client.release();
    }
};

const obtenerMonitoreoCajasAbiertas = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            JOIN public.usuario u ON u.usuario_id = c.cajero_id
            WHERE c.estado = 'abierta'
            ORDER BY c.fecha_apertura DESC, c.caja_id DESC
        `);

        const cajasAbiertas = [];
        let ventasAcumuladasGlobal = 0;
        let efectivoEnCajasGlobal = 0;

        for (const c of rows) {
            const resumenVivo = await calcularTotalesTurnoCaja(db, c.caja_id, c.fondo_inicial, c);
            ventasAcumuladasGlobal += resumenVivo.total_ventas_monto;
            efectivoEnCajasGlobal += resumenVivo.efectivo_esperado;

            cajasAbiertas.push({
                caja_id: c.caja_id,
                puesto_id: c.puesto_id,
                puesto_codigo: c.puesto_codigo,
                puesto_nombre: c.puesto_nombre,
                puesto_tipo_negocio: c.puesto_tipo_negocio,
                puesto_ubicacion: c.puesto_ubicacion,
                cajero_id: c.cajero_id,
                cajero_nombre: c.cajero_nombre,
                cajero_correo: c.cajero_correo,
                fecha_apertura: c.fecha_apertura,
                fondo_inicial: resumenVivo.fondo_inicial,
                cantidad_ventas: resumenVivo.cantidad_ventas,
                ventas_acumuladas: resumenVivo.total_ventas_monto,
                totales_medio_pago: resumenVivo.totales_medio_pago,
                efectivo_esperado_actual: resumenVivo.efectivo_esperado,
                observacion_apertura: c.observacion_apertura
            });
        }

        res.json({
            consultado_en: new Date().toISOString(),
            resumen: {
                total_cajas_abiertas: cajasAbiertas.length,
                cajas_comida: cajasAbiertas.filter(c => c.puesto_tipo_negocio === 'comida').length,
                cajas_merch: cajasAbiertas.filter(c => c.puesto_tipo_negocio === 'merch').length,
                ventas_acumuladas_activas: Number(ventasAcumuladasGlobal.toFixed(2)),
                efectivo_total_en_cajas: Number(efectivoEnCajasGlobal.toFixed(2))
            },
            cajas_abiertas: cajasAbiertas
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al monitorear las cajas abiertas', error: error.message });
    }
};

const obtenerHistorialVentas = async (req, res) => {
    const {
        fecha_desde,
        fecha_hasta,
        puesto_id,
        tipo_negocio,
        cajero_id,
        metodo_pago,
        estado_sap,
        q
    } = req.query;

    if (fecha_desde && fecha_hasta) {
        const f1 = new Date(`${String(fecha_desde).slice(0, 10)}T00:00:00Z`);
        const f2 = new Date(`${String(fecha_hasta).slice(0, 10)}T23:59:59Z`);
        if (f2 < f1) {
            return res.status(400).json({
                message: 'El rango de fechas es inválido: la fecha hasta no puede ser menor que la fecha desde (CU 83)'
            });
        }
    }

    const params = [];
    const condiciones = [];

    if (fecha_desde) {
        params.push(String(fecha_desde).slice(0, 10));
        condiciones.push(`vp.fecha_venta::date >= $${params.length}::date`);
    }
    if (fecha_hasta) {
        params.push(String(fecha_hasta).slice(0, 10));
        condiciones.push(`vp.fecha_venta::date <= $${params.length}::date`);
    }
    if (puesto_id && puesto_id !== 'todos') {
        params.push(Number(puesto_id));
        condiciones.push(`vp.puesto_id = $${params.length}`);
    }
    if (tipo_negocio && tipo_negocio !== 'todos') {
        params.push(tipo_negocio.trim().toLowerCase());
        condiciones.push(`pv.puesto_tipo_negocio = $${params.length}`);
    }
    if (cajero_id && cajero_id !== 'todos') {
        params.push(Number(cajero_id));
        condiciones.push(`vp.cajero_id = $${params.length}`);
    }
    if (metodo_pago && metodo_pago !== 'todos') {
        params.push(metodo_pago.trim().toLowerCase());
        condiciones.push(`vp.metodo_pago = $${params.length}`);
    }
    if (estado_sap && estado_sap !== 'todos') {
        params.push(estado_sap.trim().toLowerCase());
        condiciones.push(`vp.estado_sap = $${params.length}`);
    }
    if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        condiciones.push(`(LOWER(COALESCE(vp.folio_boleta, '')) LIKE $${params.length} OR LOWER(COALESCE(vp.observacion, '')) LIKE $${params.length} OR LOWER(pv.puesto_nombre) LIKE $${params.length})`);
    }

    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const { rows } = await db.query(`
            SELECT
                vp.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo,
                (SELECT COUNT(*)::int FROM public.venta_pos_detalle vd WHERE vd.venta_id = vp.venta_id) AS cantidad_items
            FROM public.venta_pos vp
            JOIN public.puesto_venta pv ON pv.puesto_id = vp.puesto_id
            JOIN public.usuario u ON u.usuario_id = vp.cajero_id
            ${whereSql}
            ORDER BY vp.fecha_venta DESC, vp.venta_id DESC
            LIMIT 200
        `, params);

        const ventas = rows.map(v => {
            const total = Number(v.total_venta || 0);
            const neto = Number(v.neto || 0) > 0 ? Number(v.neto) : Math.round(total / 1.19);
            const iva = Number(v.iva || 0) > 0 ? Number(v.iva) : Math.max(total - neto, 0);
            return {
                ...v,
                subtotal: Number(v.subtotal || total),
                descuento_total: Number(v.descuento_total || 0),
                neto,
                iva,
                total_venta: total,
                monto_efectivo: Number(v.monto_efectivo || 0),
                monto_tarjeta_debito: Number(v.monto_tarjeta_debito || 0),
                monto_tarjeta_credito: Number(v.monto_tarjeta_credito || 0),
                monto_transferencia: Number(v.monto_transferencia || 0),
                monto_recibido: v.monto_recibido !== null ? Number(v.monto_recibido) : total,
                vuelto: Number(v.vuelto || 0),
                cantidad_items: Number(v.cantidad_items || 1)
            };
        });

        const confirmadas = ventas.filter(v => v.estado_venta === 'confirmada');
        const montoTotal = confirmadas.reduce((acc, v) => acc + v.total_venta, 0);
        const totalEfectivo = confirmadas.reduce((acc, v) => acc + v.monto_efectivo, 0);
        const totalTarjetas = confirmadas.reduce((acc, v) => acc + v.monto_tarjeta_debito + v.monto_tarjeta_credito + v.monto_transferencia, 0);

        res.json({
            resumen: {
                total_ventas: confirmadas.length,
                monto_total_vendido: Number(montoTotal.toFixed(2)),
                total_efectivo: Number(totalEfectivo.toFixed(2)),
                total_tarjetas_y_transferencias: Number(totalTarjetas.toFixed(2)),
                ventas_pago_combinado: confirmadas.filter(v => v.metodo_pago === 'combinado').length,
                ticket_promedio: confirmadas.length > 0 ? Math.round(montoTotal / confirmadas.length) : 0,
                pendientes_sap: confirmadas.filter(v => v.estado_sap === 'pendiente').length,
                sincronizadas_sap: confirmadas.filter(v => v.estado_sap === 'sincronizado').length
            },
            ventas
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar el historial de ventas', error: error.message });
    }
};

const obtenerDetalleVenta = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows: ventaRows } = await db.query(`
            SELECT
                vp.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo
            FROM public.venta_pos vp
            JOIN public.puesto_venta pv ON pv.puesto_id = vp.puesto_id
            JOIN public.usuario u ON u.usuario_id = vp.cajero_id
            WHERE vp.venta_id = $1
        `, [id]);

        if (ventaRows.length === 0) {
            return res.status(404).json({ message: 'Venta no encontrada' });
        }

        const v = ventaRows[0];
        const total = Number(v.total_venta || 0);
        const neto = Number(v.neto || 0) > 0 ? Number(v.neto) : Math.round(total / 1.19);
        const iva = Number(v.iva || 0) > 0 ? Number(v.iva) : Math.max(total - neto, 0);

        const { rows: detRows } = await db.query(`
            SELECT *
            FROM public.venta_pos_detalle
            WHERE venta_id = $1
            ORDER BY detalle_id ASC
        `, [id]);

        const { rows: pagoRows } = await db.query(`
            SELECT *
            FROM public.venta_pos_pago
            WHERE venta_id = $1
            ORDER BY pago_id ASC
        `, [id]);

        const detalles = detRows.length > 0
            ? detRows.map(d => ({
                ...d,
                cantidad: Number(d.cantidad),
                precio_unitario: Number(d.precio_unitario),
                descuento_linea: Number(d.descuento_linea || 0),
                subtotal_linea: Number(d.subtotal_linea)
            }))
            : [{
                detalle_id: 0,
                venta_id: v.venta_id,
                producto_codigo: 'ITEM-POS',
                producto_nombre: v.observacion || 'Producto vendido en POS',
                cantidad: 1,
                precio_unitario: total,
                descuento_linea: 0,
                subtotal_linea: total
            }];

        const pagos = pagoRows.length > 0
            ? pagoRows.map(p => ({
                ...p,
                monto: Number(p.monto),
                monto_recibido: p.monto_recibido !== null ? Number(p.monto_recibido) : Number(p.monto),
                vuelto: Number(p.vuelto || 0)
            }))
            : [{
                pago_id: 0,
                venta_id: v.venta_id,
                metodo_pago: v.metodo_pago,
                monto: total,
                monto_recibido: v.monto_recibido !== null ? Number(v.monto_recibido) : total,
                vuelto: Number(v.vuelto || 0),
                codigo_autorizacion: v.codigo_autorizacion
            }];

        res.json({
            venta: {
                ...v,
                subtotal: Number(v.subtotal || total),
                descuento_total: Number(v.descuento_total || 0),
                neto,
                iva,
                total_venta: total,
                monto_efectivo: Number(v.monto_efectivo || 0),
                monto_tarjeta_debito: Number(v.monto_tarjeta_debito || 0),
                monto_tarjeta_credito: Number(v.monto_tarjeta_credito || 0),
                monto_transferencia: Number(v.monto_transferencia || 0),
                monto_recibido: v.monto_recibido !== null ? Number(v.monto_recibido) : total,
                vuelto: Number(v.vuelto || 0)
            },
            detalles,
            pagos,
            boleta: {
                emisor_razon_social: 'KidZania Santiago S.A.',
                emisor_rut: '76.123.456-7',
                emisor_giro: 'Entretenimiento Educativo, Gastronomía y Merchandising',
                emisor_direccion: 'Av. Presidente Riesco 5330, Las Condes, Santiago',
                folio_boleta: v.folio_boleta || `BOL-${v.venta_id}`,
                fecha_emision: v.fecha_venta,
                puesto_nombre: v.puesto_nombre,
                puesto_tipo_negocio: v.puesto_tipo_negocio,
                cajero_nombre: v.cajero_nombre,
                caja_id: v.caja_id,
                neto,
                iva,
                descuento_total: Number(v.descuento_total || 0),
                total_con_iva: total,
                metodo_pago: v.metodo_pago,
                vuelto: Number(v.vuelto || 0),
                estado_sap: v.estado_sap
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener el detalle de la venta y su boleta', error: error.message });
    }
};

const obtenerArqueosCaja = async (req, res) => {
    const {
        fecha_desde,
        fecha_hasta,
        puesto_id,
        cajero_id,
        estado_arqueo = 'todos',
        solo_diferencias = 'false'
    } = req.query;

    if (fecha_desde && fecha_hasta) {
        const f1 = new Date(`${String(fecha_desde).slice(0, 10)}T00:00:00Z`);
        const f2 = new Date(`${String(fecha_hasta).slice(0, 10)}T23:59:59Z`);
        if (f2 < f1) {
            return res.status(400).json({
                message: 'El rango de fechas es inválido: la fecha hasta no puede ser menor que la fecha desde (CU 84)'
            });
        }
    }

    const params = [];
    const condiciones = [`c.estado = 'cerrada'`];

    if (fecha_desde) {
        params.push(String(fecha_desde).slice(0, 10));
        condiciones.push(`COALESCE(c.fecha_cierre, c.fecha_apertura)::date >= $${params.length}::date`);
    }
    if (fecha_hasta) {
        params.push(String(fecha_hasta).slice(0, 10));
        condiciones.push(`COALESCE(c.fecha_cierre, c.fecha_apertura)::date <= $${params.length}::date`);
    }
    if (puesto_id && puesto_id !== 'todos') {
        params.push(Number(puesto_id));
        condiciones.push(`c.puesto_id = $${params.length}`);
    }
    if (cajero_id && cajero_id !== 'todos') {
        params.push(Number(cajero_id));
        condiciones.push(`c.cajero_id = $${params.length}`);
    }
    if (solo_diferencias === 'true' || estado_arqueo === 'con_diferencia') {
        condiciones.push(`c.estado_arqueo IN ('sobrante', 'faltante')`);
    } else if (estado_arqueo && estado_arqueo !== 'todos') {
        params.push(estado_arqueo.trim().toLowerCase());
        condiciones.push(`c.estado_arqueo = $${params.length}`);
    }

    try {
        const { rows } = await db.query(`
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            JOIN public.usuario u ON u.usuario_id = c.cajero_id
            WHERE ${condiciones.join(' AND ')}
            ORDER BY COALESCE(c.fecha_cierre, c.fecha_apertura) DESC, c.caja_id DESC
            LIMIT 150
        `, params);

        const arqueos = rows.map(c => {
            const dif = c.diferencia_arqueo !== null ? Number(c.diferencia_arqueo) : 0;
            const estArq = c.estado_arqueo || (Math.abs(dif) < 0.01 ? 'cuadrada' : (dif > 0 ? 'sobrante' : 'faltante'));
            return {
                ...c,
                fondo_inicial: Number(c.fondo_inicial || 0),
                total_ventas_cantidad: Number(c.total_ventas_cantidad || 0),
                total_ventas_monto: Number(c.total_ventas_monto || 0),
                total_efectivo: Number(c.total_efectivo || 0),
                total_tarjeta_debito: Number(c.total_tarjeta_debito || 0),
                total_tarjeta_credito: Number(c.total_tarjeta_credito || 0),
                total_transferencia: Number(c.total_transferencia || 0),
                efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : Number(c.fondo_inicial || 0) + Number(c.total_efectivo || 0),
                efectivo_contado: c.efectivo_contado !== null ? Number(c.efectivo_contado) : 0,
                diferencia_arqueo: dif,
                estado_arqueo: estArq,
                tiene_diferencia: estArq !== 'cuadrada'
            };
        });

        const diferenciaNeta = arqueos.reduce((acc, a) => acc + a.diferencia_arqueo, 0);

        res.json({
            resumen: {
                total_arqueos: arqueos.length,
                cuadradas: arqueos.filter(a => a.estado_arqueo === 'cuadrada').length,
                con_diferencia: arqueos.filter(a => a.tiene_diferencia).length,
                sobrantes: arqueos.filter(a => a.estado_arqueo === 'sobrante').length,
                faltantes: arqueos.filter(a => a.estado_arqueo === 'faltante').length,
                diferencia_neta_acumulada: Number(diferenciaNeta.toFixed(2))
            },
            arqueos
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar arqueos de caja', error: error.message });
    }
};

const obtenerDetalleArqueoCaja = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows: cajaRows } = await db.query(`
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                pv.puesto_ubicacion,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            JOIN public.usuario u ON u.usuario_id = c.cajero_id
            WHERE c.caja_id = $1
        `, [id]);

        if (cajaRows.length === 0) {
            return res.status(404).json({ message: 'Registro de arqueo / sesión de caja no encontrado' });
        }

        const c = cajaRows[0];
        const { rows: ventasRows } = await db.query(`
            SELECT
                venta_id,
                folio_boleta,
                fecha_venta,
                total_venta,
                metodo_pago,
                monto_efectivo,
                monto_tarjeta_debito,
                monto_tarjeta_credito,
                monto_transferencia,
                vuelto,
                estado_venta,
                estado_sap,
                observacion
            FROM public.venta_pos
            WHERE caja_id = $1
            ORDER BY fecha_venta DESC, venta_id DESC
        `, [id]);

        const dif = c.diferencia_arqueo !== null ? Number(c.diferencia_arqueo) : 0;
        const estArq = c.estado_arqueo || (Math.abs(dif) < 0.01 ? 'cuadrada' : (dif > 0 ? 'sobrante' : 'faltante'));

        res.json({
            arqueo: {
                ...c,
                fondo_inicial: Number(c.fondo_inicial || 0),
                total_ventas_cantidad: Number(c.total_ventas_cantidad || 0),
                total_ventas_monto: Number(c.total_ventas_monto || 0),
                totales_medio_pago: {
                    efectivo: Number(c.total_efectivo || 0),
                    tarjeta_debito: Number(c.total_tarjeta_debito || 0),
                    tarjeta_credito: Number(c.total_tarjeta_credito || 0),
                    transferencia: Number(c.total_transferencia || 0)
                },
                efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : Number(c.fondo_inicial || 0) + Number(c.total_efectivo || 0),
                efectivo_contado: c.efectivo_contado !== null ? Number(c.efectivo_contado) : null,
                diferencia_arqueo: c.diferencia_arqueo !== null ? Number(c.diferencia_arqueo) : null,
                estado_arqueo: estArq,
                tiene_diferencia: estArq !== 'cuadrada'
            },
            ventas_turno: ventasRows.map(v => ({
                ...v,
                total_venta: Number(v.total_venta || 0),
                monto_efectivo: Number(v.monto_efectivo || 0),
                monto_tarjeta_debito: Number(v.monto_tarjeta_debito || 0),
                monto_tarjeta_credito: Number(v.monto_tarjeta_credito || 0),
                monto_transferencia: Number(v.monto_transferencia || 0),
                vuelto: Number(v.vuelto || 0)
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener detalle del arqueo de caja', error: error.message });
    }
};

const obtenerHistorialCajas = async (req, res) => {
    const {
        estado,
        puesto_id,
        cajero_id,
        estado_arqueo,
        fecha_desde,
        fecha_hasta
    } = req.query;

    const params = [];
    const condiciones = [];

    if (estado && estado !== 'todos') {
        params.push(estado.trim().toLowerCase());
        condiciones.push(`c.estado = $${params.length}`);
    }
    if (puesto_id) {
        params.push(Number(puesto_id));
        condiciones.push(`c.puesto_id = $${params.length}`);
    }
    if (cajero_id) {
        params.push(Number(cajero_id));
        condiciones.push(`c.cajero_id = $${params.length}`);
    }
    if (estado_arqueo && estado_arqueo !== 'todos') {
        params.push(estado_arqueo.trim().toLowerCase());
        condiciones.push(`c.estado_arqueo = $${params.length}`);
    }
    if (fecha_desde) {
        params.push(String(fecha_desde).slice(0, 10));
        condiciones.push(`c.fecha_apertura::date >= $${params.length}::date`);
    }
    if (fecha_hasta) {
        params.push(String(fecha_hasta).slice(0, 10));
        condiciones.push(`c.fecha_apertura::date <= $${params.length}::date`);
    }

    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const { rows } = await db.query(`
            SELECT
                c.*,
                pv.puesto_codigo,
                pv.puesto_nombre,
                pv.puesto_tipo_negocio,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS cajero_nombre,
                u.usuario_correo AS cajero_correo
            FROM public.caja_sesion c
            JOIN public.puesto_venta pv ON pv.puesto_id = c.puesto_id
            JOIN public.usuario u ON u.usuario_id = c.cajero_id
            ${whereSql}
            ORDER BY c.fecha_apertura DESC, c.caja_id DESC
            LIMIT 100
        `, params);

        const cajas = rows.map(c => ({
            ...c,
            fondo_inicial: Number(c.fondo_inicial || 0),
            total_ventas_cantidad: Number(c.total_ventas_cantidad || 0),
            total_ventas_monto: Number(c.total_ventas_monto || 0),
            total_efectivo: Number(c.total_efectivo || 0),
            total_tarjeta_debito: Number(c.total_tarjeta_debito || 0),
            total_tarjeta_credito: Number(c.total_tarjeta_credito || 0),
            total_transferencia: Number(c.total_transferencia || 0),
            efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : Number(c.fondo_inicial || 0) + Number(c.total_efectivo || 0),
            efectivo_contado: c.efectivo_contado !== null ? Number(c.efectivo_contado) : null,
            diferencia_arqueo: c.diferencia_arqueo !== null ? Number(c.diferencia_arqueo) : null
        }));

        res.json({
            resumen: {
                total_sesiones: cajas.length,
                cajas_abiertas: cajas.filter(c => c.estado === 'abierta').length,
                cajas_cerradas: cajas.filter(c => c.estado === 'cerrada').length,
                arqueos_con_diferencia: cajas.filter(c => c.estado === 'cerrada' && c.estado_arqueo && c.estado_arqueo !== 'cuadrada').length
            },
            cajas
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar historial de cajas y arqueos', error: error.message });
    }
};

module.exports = {
    obtenerPuestosVenta,
    crearPuestoVenta,
    actualizarPuestoVenta,
    cambiarEstadoPuestoVenta,
    eliminarPuestoVenta,
    obtenerEstadoCajaActual,
    abrirCaja,
    obtenerResumenCierreCaja,
    cerrarCajaConArqueo,
    calcularTotalVentaPos,
    registrarVentaTurnoCaja,
    obtenerMonitoreoCajasAbiertas,
    obtenerHistorialVentas,
    obtenerDetalleVenta,
    obtenerArqueosCaja,
    obtenerDetalleArqueoCaja,
    obtenerHistorialCajas
};
