const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

const ESTADOS_RECEPCION_VALIDOS = ['conforme', 'con_observaciones', 'parcial'];
const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Subflujo CU 10: Validando Fechas de Lote (patrón ISO 8601 AAAA-MM-DD y vencimiento > ingreso)
const validarFechasLote = (fecha_recepcion, fecha_vencimiento) => {
    const fRecStr = String(fecha_recepcion || '').trim().slice(0, 10);
    const fVenStr = String(fecha_vencimiento || '').trim().slice(0, 10);

    if (!REGEX_FECHA_ISO.test(fRecStr) || !REGEX_FECHA_ISO.test(fVenStr)) {
        return {
            valido: false,
            mensaje: 'Formato de fecha no válido. Debe utilizar el estándar ISO 8601 (AAAA-MM-DD)'
        };
    }

    const fIngreso = new Date(`${fRecStr}T00:00:00Z`);
    const fVencimiento = new Date(`${fVenStr}T00:00:00Z`);

    if (Number.isNaN(fIngreso.getTime()) || Number.isNaN(fVencimiento.getTime())) {
        return {
            valido: false,
            mensaje: 'Las fechas ingresadas no corresponden a fechas calendario válidas'
        };
    }

    if (fVencimiento <= fIngreso) {
        return {
            valido: false,
            mensaje: 'Inconsistencia de fechas: la fecha de vencimiento debe ser estrictamente posterior a la fecha de ingreso'
        };
    }

    return { valido: true, fecha_recepcion: fRecStr, fecha_vencimiento: fVenStr };
};

// Subflujo CU 48: Obtener lista de usuarios activos habilitados como responsables de recepción
const obtenerResponsablesRecepcion = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS nombre_completo,
                u.usuario_correo,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE u.usuario_estado_cuenta = 'activo'
            ORDER BY u.usuario_nombres ASC, u.usuario_apellido_paterno ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener responsables de recepción', error: error.message });
    }
};

const obtenerUmbralVencimiento = async () => {
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

const obtenerLotes = async (req, res) => {
    const productoId = req.query.producto_id;
    try {
        const umbralDias = await obtenerUmbralVencimiento();
        const params = [umbralDias];
        let filtro = '';
        if (productoId) {
            params.push(productoId);
            filtro = 'WHERE l.producto_id = $2';
        }

        const { rows } = await db.query(`
            SELECT
                l.lote_id,
                l.lote_codigo,
                l.lote_cantidad_ingresada,
                l.lote_cantidad_disponible,
                COALESCE(l.lote_costo_unitario, 0) AS lote_costo_unitario,
                ROUND(COALESCE(l.lote_costo_unitario, 0) * l.lote_cantidad_ingresada, 2) AS lote_costo_total_ingreso,
                ROUND(COALESCE(l.lote_costo_unitario, 0) * l.lote_cantidad_disponible, 2) AS lote_valor_disponible,
                l.lote_documento_respaldo,
                COALESCE(l.lote_estado_recepcion, 'conforme') AS lote_estado_recepcion,
                l.lote_fecha_recepcion,
                l.lote_fecha_vencimiento,
                (l.lote_fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                l.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                p.categoria_id,
                p.producto_tipo_control_stock,
                p.producto_unidad_medida_id,
                um.unidad_medida_codigo,
                l.proveedor_id,
                pr.proveedor_nombre,
                pr.proveedor_rut,
                l.ubicacion_id,
                ub.ubicacion_codigo,
                ub.ubicacion_nombre,
                l.responsable_recepcion_id,
                TRIM(CONCAT(ur.usuario_nombres, ' ', ur.usuario_apellido_paterno)) AS responsable_recepcion_nombre,
                ur.usuario_correo AS responsable_recepcion_correo,
                CASE
                    WHEN l.lote_fecha_vencimiento IS NULL THEN 'sin_vencimiento'
                    WHEN l.lote_fecha_vencimiento < CURRENT_DATE THEN 'vencido'
                    WHEN (l.lote_fecha_vencimiento - CURRENT_DATE) <= $1::int THEN 'por_vencer'
                    ELSE 'vigente'
                END AS estado_vencimiento
            FROM public.lote l
            LEFT JOIN public.producto p ON p.producto_id = l.producto_id
            LEFT JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = l.proveedor_id
            LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = l.ubicacion_id
            LEFT JOIN public.usuario ur ON ur.usuario_id = l.responsable_recepcion_id
            ${filtro}
            ORDER BY l.lote_fecha_vencimiento ASC NULLS LAST, l.lote_id DESC
        `, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener lotes', error: error.message });
    }
};

// CU 10 (Subflujos CU 9, 10, 11, 39, 40 y 48): Registrar recepción de mercadería y lote
const registrarLote = async (req, res) => {
    const {
        lote_codigo,
        producto_id,
        producto_codigo,
        proveedor_id,
        ubicacion_id = null,
        cantidad_ingresada,
        costo_unitario,
        documento_respaldo = null,
        responsable_recepcion_id = null,
        estado_recepcion = 'conforme',
        fecha_recepcion,
        fecha_vencimiento,
        observacion = null
    } = req.body;

    const cantidad = Number(cantidad_ingresada);
    const costo = Number(costo_unitario);

    if (!lote_codigo || (!producto_id && !producto_codigo) || !proveedor_id || !fecha_recepcion || !fecha_vencimiento) {
        return res.status(400).json({
            message: 'Debe indicar código de lote, producto (ID o código), proveedor, fecha de ingreso y fecha de vencimiento'
        });
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return res.status(400).json({ message: 'La cantidad ingresada debe ser un número mayor que cero' });
    }

    // Subflujo CU 40: Validar costo unitario del lote (numérico y mayor a cero)
    if (costo_unitario === undefined || costo_unitario === null || costo_unitario === '' || !Number.isFinite(costo) || costo <= 0) {
        return res.status(400).json({
            message: 'Debe registrar un costo unitario de lote numérico y mayor a cero (CU 40)'
        });
    }

    // Subflujo CU 10: Validando fechas de lote
    const validacionFechas = validarFechasLote(fecha_recepcion, fecha_vencimiento);
    if (!validacionFechas.valido) {
        return res.status(400).json({ message: validacionFechas.mensaje });
    }

    if (!ESTADOS_RECEPCION_VALIDOS.includes(estado_recepcion)) {
        return res.status(400).json({
            message: 'Estado de recepción no válido (debe ser conforme, con_observaciones o parcial)'
        });
    }

    const docRespaldoLimpio = documento_respaldo ? String(documento_respaldo).trim() : null;
    const idResponsableFinal = responsable_recepcion_id ? Number(responsable_recepcion_id) : (req.user?.id || null);

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Subflujo CU 9 y CU 39: Resolver producto por ID o por código escaneado
        let prodQuery = "SELECT producto_id, producto_codigo, producto_nombre, producto_stock_actual FROM public.producto WHERE producto_id = $1 AND producto_estado = 'activo' FOR UPDATE";
        let prodParam = [producto_id];
        if (!producto_id && producto_codigo) {
            prodQuery = "SELECT producto_id, producto_codigo, producto_nombre, producto_stock_actual FROM public.producto WHERE UPPER(producto_codigo) = UPPER($1) AND producto_estado = 'activo' FOR UPDATE";
            prodParam = [String(producto_codigo).trim()];
        }

        const { rows: prodRows } = await client.query(prodQuery, prodParam);
        if (prodRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El producto seleccionado o escaneado no existe o está inactivo en el catálogo' });
        }
        const producto = prodRows[0];

        const { rows: provRows } = await client.query(
            "SELECT proveedor_id, proveedor_nombre, proveedor_rut FROM public.proveedor WHERE proveedor_id = $1 AND proveedor_estado = 'activo'",
            [proveedor_id]
        );
        if (provRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El proveedor seleccionado no existe o está inactivo' });
        }
        const proveedor = provRows[0];

        if (ubicacion_id) {
            const { rows: ubiRows } = await client.query(
                "SELECT ubicacion_id, ubicacion_codigo, ubicacion_nombre FROM public.ubicacion_bodega WHERE ubicacion_id = $1 AND ubicacion_estado = 'activo'",
                [ubicacion_id]
            );
            if (ubiRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'La ubicación seleccionada no existe o está inactiva' });
            }
        }

        // Subflujo CU 48: Verificar que el responsable de recepción exista y esté habilitado (activo)
        let responsableInfo = null;
        if (idResponsableFinal) {
            const { rows: respRows } = await client.query(
                `SELECT usuario_id, usuario_nombres, usuario_apellido_paterno, usuario_correo, usuario_estado_cuenta
                 FROM public.usuario
                 WHERE usuario_id = $1`,
                [idResponsableFinal]
            );
            if (respRows.length === 0 || respRows[0].usuario_estado_cuenta !== 'activo') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'El usuario responsable de la recepción no existe o no se encuentra habilitado (activo)'
                });
            }
            responsableInfo = respRows[0];
        }

        const costoTotal = Number((cantidad * costo).toFixed(2));

        const { rows } = await client.query(`
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
                insumo_id,
                responsable_recepcion_id
            )
            VALUES (UPPER($1), $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11)
            RETURNING lote_id, lote_codigo, lote_costo_unitario, lote_documento_respaldo, lote_estado_recepcion
        `, [
            String(lote_codigo).trim(),
            cantidad,
            costo,
            docRespaldoLimpio,
            estado_recepcion,
            validacionFechas.fecha_recepcion,
            validacionFechas.fecha_vencimiento,
            producto.producto_id,
            proveedor.proveedor_id,
            ubicacion_id || null,
            idResponsableFinal
        ]);

        await client.query(`
            INSERT INTO public.producto_proveedor (producto_id, proveedor_id)
            VALUES ($1, $2)
            ON CONFLICT (producto_id, proveedor_id) DO UPDATE SET estado = 'activo', fecha_asociacion = CURRENT_DATE
        `, [producto.producto_id, proveedor.proveedor_id]);

        const { rows: stockRows } = await client.query(
            'UPDATE public.producto SET producto_stock_actual = producto_stock_actual + $1, producto_actualizado_en = now() WHERE producto_id = $2 RETURNING producto_stock_actual',
            [cantidad, producto.producto_id]
        );

        const { rows: movRows } = await client.query(`
            INSERT INTO public.movimiento_stock
            (
                movimiento_tipo,
                movimiento_fecha,
                movimiento_cantidad,
                movimiento_costo_unitario,
                movimiento_costo_total,
                movimiento_documento_respaldo,
                movimiento_estado_recepcion,
                movimiento_observacion,
                producto_id,
                lote_id,
                proveedor_id,
                usuario_id,
                responsable_recepcion_id
            )
            VALUES ('ingreso', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING movimiento_id, movimiento_fecha
        `, [
            validacionFechas.fecha_recepcion,
            cantidad,
            costo,
            costoTotal,
            docRespaldoLimpio,
            estado_recepcion,
            observacion ? String(observacion).trim() : null,
            producto.producto_id,
            rows[0].lote_id,
            proveedor.proveedor_id,
            req.user?.id || idResponsableFinal,
            idResponsableFinal
        ]);

        await client.query('COMMIT');

        const nombreResponsable = responsableInfo
            ? `${responsableInfo.usuario_nombres} ${responsableInfo.usuario_apellido_paterno}`.trim()
            : 'Usuario autenticado';

        await registrarAuditoria({
            usuario_id: idResponsableFinal,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'recepcion_mercaderia_lote',
            modulo: 'lotes',
            accion: 'REGISTRAR_RECEPCION_LOTE',
            resultado: 'exitoso',
            detalle: `Lote ${rows[0].lote_codigo} (${producto.producto_codigo}) recibido. Cant: ${cantidad}, Costo Unit: $${costo}, Total: $${costoTotal}, Doc: ${docRespaldoLimpio || 'S/D'}, Responsable: ${nombreResponsable}`
        });

        const comprobante = {
            movimiento_id: movRows[0].movimiento_id,
            lote_id: rows[0].lote_id,
            lote_codigo: rows[0].lote_codigo,
            documento_respaldo: docRespaldoLimpio || 'Sin documento informado',
            fecha_recepcion: validacionFechas.fecha_recepcion,
            fecha_vencimiento: validacionFechas.fecha_vencimiento,
            producto_codigo: producto.producto_codigo,
            producto_nombre: producto.producto_nombre,
            proveedor_nombre: proveedor.proveedor_nombre,
            proveedor_rut: proveedor.proveedor_rut,
            cantidad_ingresada: cantidad,
            costo_unitario: costo,
            costo_total: costoTotal,
            estado_recepcion,
            responsable_recepcion: nombreResponsable,
            observacion: observacion || null,
            stock_resultante: Number(stockRows[0].producto_stock_actual)
        };

        res.status(201).json({
            message: 'Recepción de mercadería y lote registrados correctamente',
            lote: rows[0],
            comprobante
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') return res.status(400).json({ message: 'Ya existe un lote registrado con ese código' });
        res.status(500).json({ message: 'Error al registrar recepción y lote', error: error.message });
    } finally {
        client.release();
    }
};

// =========================================================================
// CU 17: Consultar vencimientos y recibir alertas (Subflujos CU 24, 25, 74)
// =========================================================================
const consultarVencimientosYAlertas = async (req, res) => {
    const {
        dias,
        estado_vencimiento,
        fecha_desde,
        fecha_hasta,
        categoria_id,
        proveedor_id,
        ubicacion_id,
        producto_id,
        q = '',
        solo_con_stock = 'true'
    } = req.query;

    if (fecha_desde && fecha_hasta) {
        const fDesde = new Date(`${String(fecha_desde).slice(0, 10)}T00:00:00Z`);
        const fHasta = new Date(`${String(fecha_hasta).slice(0, 10)}T23:59:59Z`);
        if (Number.isNaN(fDesde.getTime()) || Number.isNaN(fHasta.getTime()) || fHasta < fDesde) {
            return res.status(400).json({
                message: 'El rango de fechas de vencimiento es inválido: la fecha final no puede ser menor que la fecha inicial'
            });
        }
    }

    try {
        const umbralConfigurado = await obtenerUmbralVencimiento();
        const tieneDiasExplicito = dias !== undefined && dias !== null && String(dias).trim() !== '' && dias !== 'todos';
        const diasRango = tieneDiasExplicito
            ? Math.max(0, parseInt(dias, 10) || 0)
            : umbralConfigurado;

        const { rows } = await db.query(`
            SELECT
                l.lote_id,
                l.lote_codigo,
                l.lote_cantidad_ingresada,
                l.lote_cantidad_disponible,
                COALESCE(l.lote_costo_unitario, 0) AS lote_costo_unitario,
                ROUND(COALESCE(l.lote_costo_unitario, 0) * l.lote_cantidad_disponible, 2) AS valor_disponible,
                l.lote_documento_respaldo,
                l.lote_fecha_recepcion,
                l.lote_fecha_vencimiento,
                (l.lote_fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                l.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                p.producto_estado,
                um.unidad_medida_codigo,
                l.proveedor_id,
                pr.proveedor_nombre,
                pr.proveedor_rut,
                l.ubicacion_id,
                ub.ubicacion_codigo,
                ub.ubicacion_nombre
            FROM public.lote l
            JOIN public.producto p ON p.producto_id = l.producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = l.proveedor_id
            LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = l.ubicacion_id
            WHERE l.lote_fecha_vencimiento IS NOT NULL
            ORDER BY l.lote_fecha_vencimiento ASC, l.lote_id ASC
        `);

        const clasificarSegunUmbral = (diasRest, umbralRef) => {
            const d = Number(diasRest);
            if (d < 0) return 'vencido';
            if (d <= 3 && d <= umbralRef) return 'critico';
            if (d <= umbralRef) return 'por_vencer';
            return 'vigente';
        };

        const todosEvaluados = rows.map(r => {
            const d = Number(r.dias_restantes);
            const estadoSegunUmbral = clasificarSegunUmbral(d, umbralConfigurado);
            const estadoSegunRango = clasificarSegunUmbral(d, diasRango);
            let nivelAlerta = null;
            if (d < 0) {
                nivelAlerta = `Vencido hace ${Math.abs(d)} día(s)`;
            } else if (d === 0) {
                nivelAlerta = 'Vence HOY (Crítico)';
            } else if (d <= 3) {
                nivelAlerta = `Crítico: vence en ${d} día(s)`;
            } else if (d <= diasRango) {
                nivelAlerta = `Próximo a vencer en ${d} día(s)`;
            }

            return {
                ...r,
                lote_cantidad_ingresada: Number(r.lote_cantidad_ingresada),
                lote_cantidad_disponible: Number(r.lote_cantidad_disponible),
                lote_costo_unitario: Number(r.lote_costo_unitario),
                valor_disponible: Number(r.valor_disponible),
                dias_restantes: d,
                estado_vencimiento: estadoSegunRango,
                estado_alerta_sistema: estadoSegunUmbral,
                mensaje_alerta: nivelAlerta
            };
        });

        // Subflujo CU 24: Alertas automáticas para lotes con stock disponible según umbral configurado
        const lotesConStock = todosEvaluados.filter(l => l.lote_cantidad_disponible > 0);
        const alertasActivas = lotesConStock.filter(l => l.dias_restantes <= umbralConfigurado);

        const lotesVencidosActivos = lotesConStock.filter(l => l.dias_restantes < 0);
        const lotesCriticosActivos = lotesConStock.filter(l => l.dias_restantes >= 0 && l.dias_restantes <= 3 && l.dias_restantes <= umbralConfigurado);
        const lotesPorVencerActivos = lotesConStock.filter(l => l.dias_restantes >= 0 && l.dias_restantes <= umbralConfigurado);
        const lotesVigentesActivos = lotesConStock.filter(l => l.dias_restantes > umbralConfigurado);

        const unidadesEnRiesgo = alertasActivas.reduce((acc, l) => acc + l.lote_cantidad_disponible, 0);
        const valorEnRiesgo = alertasActivas.reduce((acc, l) => acc + l.valor_disponible, 0);

        const textoQ = String(q || '').trim().toLowerCase();
        const fDesdeStr = fecha_desde ? String(fecha_desde).slice(0, 10) : null;
        const fHastaStr = fecha_hasta ? String(fecha_hasta).slice(0, 10) : null;

        // Subflujos CU 25 y CU 74: Filtrar y listar productos por rango de días / criterios y ordenar por fecha de vencimiento ASC
        const lotesFiltrados = todosEvaluados.filter(l => {
            if (solo_con_stock === 'true' && l.lote_cantidad_disponible <= 0) return false;
            if (producto_id && Number(l.producto_id) !== Number(producto_id)) return false;
            if (categoria_id && Number(l.categoria_id) !== Number(categoria_id)) return false;
            if (proveedor_id && Number(l.proveedor_id) !== Number(proveedor_id)) return false;
            if (ubicacion_id && Number(l.ubicacion_id) !== Number(ubicacion_id)) return false;

            const fechaVencIso = l.lote_fecha_vencimiento instanceof Date
                ? l.lote_fecha_vencimiento.toISOString().slice(0, 10)
                : String(l.lote_fecha_vencimiento || '').slice(0, 10);

            if (fDesdeStr && fechaVencIso < fDesdeStr) return false;
            if (fHastaStr && fechaVencIso > fHastaStr) return false;

            if (tieneDiasExplicito && (!estado_vencimiento || estado_vencimiento === 'todos')) {
                if (diasRango === 0) {
                    if (l.dias_restantes > 0) return false;
                } else if (l.dias_restantes > diasRango) {
                    return false;
                }
            }

            if (estado_vencimiento && estado_vencimiento !== 'todos') {
                if (estado_vencimiento === 'vencido' && l.dias_restantes >= 0) return false;
                if (estado_vencimiento === 'critico' && (l.dias_restantes < 0 || l.dias_restantes > 3)) return false;
                if (estado_vencimiento === 'por_vencer' && (l.dias_restantes < 0 || l.dias_restantes > diasRango)) return false;
                if (estado_vencimiento === 'alertas' && l.dias_restantes > diasRango) return false;
                if (estado_vencimiento === 'vigente' && l.dias_restantes <= diasRango) return false;
            }

            if (textoQ) {
                const match =
                    String(l.lote_codigo || '').toLowerCase().includes(textoQ) ||
                    String(l.producto_codigo || '').toLowerCase().includes(textoQ) ||
                    String(l.producto_nombre || '').toLowerCase().includes(textoQ) ||
                    String(l.producto_categoria || '').toLowerCase().includes(textoQ) ||
                    String(l.proveedor_nombre || '').toLowerCase().includes(textoQ) ||
                    String(l.ubicacion_nombre || '').toLowerCase().includes(textoQ);
                if (!match) return false;
            }

            return true;
        });

        res.json({
            umbral_configurado: umbralConfigurado,
            dias_rango_aplicado: diasRango,
            filtros_aplicados: {
                dias: tieneDiasExplicito ? diasRango : 'umbral',
                estado_vencimiento: estado_vencimiento || 'todos',
                fecha_desde: fDesdeStr,
                fecha_hasta: fHastaStr,
                categoria_id: categoria_id ? Number(categoria_id) : null,
                proveedor_id: proveedor_id ? Number(proveedor_id) : null,
                ubicacion_id: ubicacion_id ? Number(ubicacion_id) : null,
                producto_id: producto_id ? Number(producto_id) : null,
                q: textoQ || null,
                solo_con_stock: solo_con_stock === 'true'
            },
            resumen_alertas: {
                total_alertas_activas: alertasActivas.length,
                lotes_vencidos: lotesVencidosActivos.length,
                lotes_criticos_3_dias: lotesCriticosActivos.length,
                lotes_proximos_vencer: lotesPorVencerActivos.length,
                lotes_vigentes: lotesVigentesActivos.length,
                unidades_en_riesgo: Number(unidadesEnRiesgo.toFixed(2)),
                valor_en_riesgo: Number(valorEnRiesgo.toFixed(2))
            },
            alertas_activas: alertasActivas,
            lotes: lotesFiltrados
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar vencimientos y alertas', error: error.message });
    }
};

// Subflujo CU 24: Configurar umbral de anticipación (en días) para alertas de vencimiento
const actualizarUmbralVencimiento = async (req, res) => {
    const { umbral_dias } = req.body;
    const dias = Number(umbral_dias);

    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        return res.status(400).json({
            message: 'El umbral de anticipación de alertas debe ser un número entero entre 1 y 365 días (CU 24)'
        });
    }

    try {
        const anterior = await obtenerUmbralVencimiento();
        await db.query(`
            INSERT INTO public.configuracion_sistema (clave, valor, descripcion, actualizado_en)
            VALUES ('umbral_dias_vencimiento', $1, 'Días de anticipación para alertas de vencimiento de lotes (CU 17 / Subflujo CU 24)', now())
            ON CONFLICT (clave)
            DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()
        `, [String(dias)]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'configuracion_umbral_vencimiento',
            modulo: 'lotes',
            accion: 'ACTUALIZAR_UMBRAL_VENCIMIENTO',
            resultado: 'exitoso',
            detalle: `Umbral de alerta de vencimientos actualizado de ${anterior} a ${dias} días (CU 24)`
        });

        res.json({
            message: `Umbral de alerta de vencimientos actualizado a ${dias} días correctamente`,
            umbral_anterior: anterior,
            umbral_configurado: dias
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar umbral de vencimiento', error: error.message });
    }
};

module.exports = {
    validarFechasLote,
    obtenerResponsablesRecepcion,
    obtenerUmbralVencimiento,
    obtenerLotes,
    registrarLote,
    consultarVencimientosYAlertas,
    actualizarUmbralVencimiento
};
