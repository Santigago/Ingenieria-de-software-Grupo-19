const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

/**
 * =============================================================================
 * PARKFLOW - KIDZANIA SANTIAGO
 * CONTROLADOR DE RECURSOS HUMANOS, ASISTENCIA Y TURNOS (MÓDULO N)
 * CU 35: Registrar asistencia, turnos y cumplimiento
 *   - Subflujo CU 70: Registrar Turnos
 *   - Subflujo CU 67: Registrando Asistencia
 *   - Subflujo CU 68: Consultando Historial de Asistencia
 *   - Subflujo CU 69: Validando Asistencia e Inconsistencias
 *   - Subflujo CU 71: Controlando Cumplimiento Laboral
 * =============================================================================
 */

/**
 * Subflujo CU 70: Registrar Turnos Planificados
 * POST /api/rrhh/turnos
 */
const crearTurnoPlanificado = async (req, res) => {
    try {
        const {
            usuario_id,
            puesto_id = null,
            fecha_turno,
            hora_inicio_programada,
            hora_fin_programada,
            tolerancia_minutos = 15,
            observaciones = null
        } = req.body;

        const actorId = req.user?.usuario_id || req.body.actor_id;

        // Validaciones básicas
        if (!usuario_id || !fecha_turno || !hora_inicio_programada || !hora_fin_programada) {
            return res.status(400).json({
                message: 'Usuario, fecha del turno, hora de inicio y hora de fin son campos obligatorios (CU 70)'
            });
        }

        if (hora_fin_programada <= hora_inicio_programada) {
            return res.status(400).json({
                message: 'La hora de fin programada debe ser posterior a la hora de inicio'
            });
        }

        // Subflujo CU 69 / CU 70: Validar que no exista solapamiento de turnos para el mismo trabajador
        const { rows: solapados } = await db.query(`
            SELECT turno_id, hora_inicio_programada, hora_fin_programada
            FROM public.turno_planificado
            WHERE usuario_id = $1
              AND fecha_turno = $2
              AND estado_turno != 'cancelado'
              AND (
                  (hora_inicio_programada, hora_fin_programada) OVERLAPS ($3::time, $4::time)
              )
        `, [usuario_id, fecha_turno, hora_inicio_programada, hora_fin_programada]);

        if (solapados.length > 0) {
            return res.status(400).json({
                message: `Inconsistencia detectada: El trabajador ya tiene un turno asignado que se solapa en ese horario (${solapados[0].hora_inicio_programada} - ${solapados[0].hora_fin_programada}) (CU 69/70)`
            });
        }

        // Insertar turno
        const { rows: tRows } = await db.query(`
            INSERT INTO public.turno_planificado (
                usuario_id,
                puesto_id,
                fecha_turno,
                hora_inicio_programada,
                hora_fin_programada,
                tolerancia_minutos,
                observaciones,
                estado_turno
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'planificado')
            RETURNING *
        `, [
            usuario_id,
            puesto_id,
            fecha_turno,
            hora_inicio_programada,
            hora_fin_programada,
            Number(tolerancia_minutos || 15),
            observaciones
        ]);

        await registrarAuditoria({
            usuario_id,
            actor_usuario_id: actorId,
            evento_tipo: 'TURNO_RRHH',
            modulo: 'rrhh',
            accion: 'REGISTRAR_TURNO_PLANIFICADO',
            resultado: 'exitoso',
            detalle: `Turno planificado para usuario ID ${usuario_id} el día ${fecha_turno} (${hora_inicio_programada} - ${hora_fin_programada})`
        });

        res.status(201).json({
            message: 'Turno planificado registrado exitosamente',
            turno: tRows[0]
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al registrar turno planificado',
            error: error.message
        });
    }
};

/**
 * Obtener listado de turnos planificados
 * GET /api/rrhh/turnos
 */
const obtenerTurnosPlanificados = async (req, res) => {
    try {
        const { usuario_id, fecha, fecha_desde, fecha_hasta, estado } = req.query;

        let condiciones = [];
        let params = [];

        if (usuario_id) {
            params.push(Number(usuario_id));
            condiciones.push(`t.usuario_id = $${params.length}`);
        }
        if (fecha) {
            params.push(fecha);
            condiciones.push(`t.fecha_turno = $${params.length}::date`);
        }
        if (fecha_desde) {
            params.push(fecha_desde);
            condiciones.push(`t.fecha_turno >= $${params.length}::date`);
        }
        if (fecha_hasta) {
            params.push(fecha_hasta);
            condiciones.push(`t.fecha_turno <= $${params.length}::date`);
        }
        if (estado) {
            params.push(estado);
            condiciones.push(`t.estado_turno = $${params.length}`);
        }

        const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const { rows } = await db.query(`
            SELECT
                t.turno_id,
                t.usuario_id,
                u.usuario_run,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                r.rol_nombre,
                t.puesto_id,
                pv.puesto_nombre,
                t.fecha_turno,
                t.hora_inicio_programada,
                t.hora_fin_programada,
                t.tolerancia_minutos,
                t.estado_turno,
                t.observaciones,
                t.creado_en
            FROM public.turno_planificado t
            JOIN public.usuario u ON u.usuario_id = t.usuario_id
            JOIN public.rol r ON r.rol_id = u.rol_id
            LEFT JOIN public.puesto_venta pv ON pv.puesto_id = t.puesto_id
            ${whereSql}
            ORDER BY t.fecha_turno DESC, t.hora_inicio_programada ASC
        `, params);

        res.json(rows);
    } catch (error) {
        res.status(500).json({
            message: 'Error al consultar turnos planificados',
            error: error.message
        });
    }
};

/**
 * Subflujo CU 67: Registrar Asistencia (Reloj Control / Marcaje de Entrada y Salida)
 * POST /api/rrhh/asistencia/marcar
 */
const registrarMarcajeAsistencia = async (req, res) => {
    try {
        const {
            usuario_id,
            tipo_marcaje, // 'entrada' o 'salida'
            puesto_id = null,
            observaciones = null
        } = req.body;

        const targetUserId = usuario_id || req.user?.usuario_id;
        if (!targetUserId) {
            return res.status(400).json({ message: 'El usuario trabajador es obligatorio para registrar asistencia' });
        }

        if (!['entrada', 'salida'].includes(tipo_marcaje)) {
            return res.status(400).json({ message: 'El tipo de marcaje debe ser "entrada" o "salida"' });
        }

        // 1. Detección de marcaje duplicado reciente (< 3 minutos) (CU 69)
        const { rows: recientes } = await db.query(`
            SELECT asistencia_id, hora_entrada, hora_salida
            FROM public.registro_asistencia
            WHERE usuario_id = $1
              AND (
                  (hora_entrada >= now() - INTERVAL '3 minutes') OR
                  (hora_salida >= now() - INTERVAL '3 minutes')
              )
            LIMIT 1
        `, [targetUserId]);

        if (recientes.length > 0) {
            return res.status(400).json({
                message: 'Inconsistencia CU 69: Se detectó un marcaje duplicado hace menos de 3 minutos. Espere antes de volver a marcar.'
            });
        }

        // 2. Buscar turno planificado para hoy
        const { rows: turnosHoy } = await db.query(`
            SELECT *
            FROM public.turno_planificado
            WHERE usuario_id = $1
              AND fecha_turno = CURRENT_DATE
              AND estado_turno != 'cancelado'
            ORDER BY hora_inicio_programada ASC
            LIMIT 1
        `, [targetUserId]);

        const turnoAsignado = turnosHoy[0] || null;

        if (tipo_marcaje === 'entrada') {
            // Verificar si ya tiene una entrada abierta hoy sin salida
            const { rows: abierta } = await db.query(`
                SELECT asistencia_id, hora_entrada
                FROM public.registro_asistencia
                WHERE usuario_id = $1
                  AND fecha = CURRENT_DATE
                  AND hora_salida IS NULL
                LIMIT 1
            `, [targetUserId]);

            if (abierta.length > 0) {
                return res.status(400).json({
                    message: `El trabajador ya tiene un marcaje de entrada registrado a las ${new Date(abierta[0].hora_entrada).toLocaleTimeString('es-CL')} sin marcar salida.`
                });
            }

            // Calcular si hay atraso contra el turno
            let estadoAsistencia = 'presente';
            let minutosAtraso = 0;

            if (turnoAsignado) {
                const ahora = new Date();
                const [hProg, mProg] = turnoAsignado.hora_inicio_programada.split(':').map(Number);
                const fechaProg = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), hProg, mProg, 0);
                const toleranciaMs = (turnoAsignado.tolerancia_minutos || 15) * 60 * 1000;
                const limiteTolerancia = new Date(fechaProg.getTime() + toleranciaMs);

                if (ahora > limiteTolerancia) {
                    estadoAsistencia = 'atraso';
                    minutosAtraso = Math.round((ahora - fechaProg) / (60 * 1000));
                }
            }

            // Insertar marcaje de entrada
            const { rows: asistRows } = await db.query(`
                INSERT INTO public.registro_asistencia (
                    usuario_id,
                    turno_id,
                    puesto_id,
                    fecha,
                    hora_entrada,
                    estado_asistencia,
                    minutos_atraso,
                    observaciones
                ) VALUES ($1, $2, $3, CURRENT_DATE, now(), $4, $5, $6)
                RETURNING *
            `, [
                targetUserId,
                turnoAsignado?.turno_id || null,
                puesto_id || turnoAsignado?.puesto_id || null,
                estadoAsistencia,
                minutosAtraso,
                observaciones || (minutosAtraso > 0 ? `Atraso registrado: ${minutosAtraso} minutos` : 'Marcaje de entrada puntual')
            ]);

            // Actualizar turno a 'en_curso'
            if (turnoAsignado) {
                await db.query("UPDATE public.turno_planificado SET estado_turno = 'en_curso' WHERE turno_id = $1", [turnoAsignado.turno_id]);
            }

            await registrarAuditoria({
                usuario_id: targetUserId,
                actor_usuario_id: req.user?.usuario_id || targetUserId,
                evento_tipo: 'ASISTENCIA_ENTRADA',
                modulo: 'rrhh',
                accion: 'MARCAJE_ENTRADA',
                resultado: 'exitoso',
                detalle: `Marcaje de entrada para usuario ID ${targetUserId}. Estado: ${estadoAsistencia} (${minutosAtraso} min atraso)`
            });

            return res.status(201).json({
                message: `Marcaje de entrada registrado correctamente (${estadoAsistencia.toUpperCase()})`,
                tipo: 'entrada',
                asistencia: asistRows[0]
            });
        } else {
            // Marcaje de salida: Buscar registro abierto de hoy
            const { rows: abierta } = await db.query(`
                SELECT asistencia_id, hora_entrada
                FROM public.registro_asistencia
                WHERE usuario_id = $1
                  AND fecha = CURRENT_DATE
                  AND hora_salida IS NULL
                ORDER BY hora_entrada DESC
                LIMIT 1
            `, [targetUserId]);

            if (abierta.length === 0) {
                // Inconsistencia CU 69: Salida sin entrada previa
                const { rows: incRows } = await db.query(`
                    INSERT INTO public.registro_asistencia (
                        usuario_id,
                        turno_id,
                        puesto_id,
                        fecha,
                        hora_salida,
                        estado_asistencia,
                        es_inconsistente,
                        tipo_inconsistencia,
                        observaciones
                    ) VALUES ($1, $2, $3, CURRENT_DATE, now(), 'inconsistente', true, 'sin_entrada', 'Inconsistencia: Marcaje de salida sin registro previo de entrada')
                    RETURNING *
                `, [targetUserId, turnoAsignado?.turno_id || null, puesto_id || null]);

                return res.status(200).json({
                    message: 'Aviso: Marcaje de salida registrado con inconsistencia (no registra entrada previa hoy)',
                    tipo: 'salida',
                    asistencia: incRows[0]
                });
            }

            const { rows: salidaRows } = await db.query(`
                UPDATE public.registro_asistencia
                SET hora_salida = now()
                WHERE asistencia_id = $1
                RETURNING *
            `, [abierta[0].asistencia_id]);

            if (turnoAsignado) {
                await db.query("UPDATE public.turno_planificado SET estado_turno = 'completado' WHERE turno_id = $1", [turnoAsignado.turno_id]);
            }

            await registrarAuditoria({
                usuario_id: targetUserId,
                actor_usuario_id: req.user?.usuario_id || targetUserId,
                evento_tipo: 'ASISTENCIA_SALIDA',
                modulo: 'rrhh',
                accion: 'MARCAJE_SALIDA',
                resultado: 'exitoso',
                detalle: `Marcaje de salida para usuario ID ${targetUserId} (Asistencia ID ${abierta[0].asistencia_id})`
            });

            return res.status(200).json({
                message: 'Marcaje de salida registrado correctamente',
                tipo: 'salida',
                asistencia: salidaRows[0]
            });
        }
    } catch (error) {
        res.status(500).json({
            message: 'Error al registrar marcaje de asistencia',
            error: error.message
        });
    }
};

/**
 * Subflujo CU 68: Consultar Historial de Asistencia con filtros avanzados
 * GET /api/rrhh/asistencia
 */
const obtenerHistorialAsistencia = async (req, res) => {
    try {
        const {
            usuario_id,
            rol_id,
            fecha_desde,
            fecha_hasta,
            estado_asistencia,
            puesto_id
        } = req.query;

        let condiciones = [];
        let params = [];

        if (usuario_id) {
            params.push(Number(usuario_id));
            condiciones.push(`a.usuario_id = $${params.length}`);
        }
        if (rol_id) {
            params.push(Number(rol_id));
            condiciones.push(`u.rol_id = $${params.length}`);
        }
        if (fecha_desde) {
            params.push(fecha_desde);
            condiciones.push(`a.fecha >= $${params.length}::date`);
        }
        if (fecha_hasta) {
            params.push(fecha_hasta);
            condiciones.push(`a.fecha <= $${params.length}::date`);
        }
        if (estado_asistencia) {
            params.push(estado_asistencia);
            condiciones.push(`a.estado_asistencia = $${params.length}`);
        }
        if (puesto_id) {
            params.push(Number(puesto_id));
            condiciones.push(`a.puesto_id = $${params.length}`);
        }

        const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const { rows } = await db.query(`
            SELECT
                a.asistencia_id,
                a.usuario_id,
                u.usuario_run,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                r.rol_nombre,
                a.turno_id,
                t.hora_inicio_programada,
                t.hora_fin_programada,
                a.puesto_id,
                pv.puesto_nombre,
                a.fecha,
                a.hora_entrada,
                a.hora_salida,
                a.estado_asistencia,
                a.minutos_atraso,
                a.es_inconsistente,
                a.tipo_inconsistencia,
                a.observaciones,
                a.creado_en
            FROM public.registro_asistencia a
            JOIN public.usuario u ON u.usuario_id = a.usuario_id
            JOIN public.rol r ON r.rol_id = u.rol_id
            LEFT JOIN public.turno_planificado t ON t.turno_id = a.turno_id
            LEFT JOIN public.puesto_venta pv ON pv.puesto_id = a.puesto_id
            ${whereSql}
            ORDER BY a.fecha DESC, a.hora_entrada DESC NULLS LAST
        `, params);

        res.json(rows);
    } catch (error) {
        res.status(500).json({
            message: 'Error al consultar historial de asistencia',
            error: error.message
        });
    }
};

/**
 * Subflujo CU 69: Validar Asistencia y Detectar Inconsistencias
 * GET /api/rrhh/asistencia/inconsistencias
 */
const validarInconsistenciasAsistencia = async (req, res) => {
    try {
        const { fecha = new Date().toISOString().slice(0, 10) } = req.query;

        // 1. Marcajes de entrada que no han registrado salida después de la hora programada del turno
        const { rows: sinSalida } = await db.query(`
            SELECT
                a.asistencia_id,
                a.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                u.usuario_correo,
                a.fecha,
                a.hora_entrada,
                t.hora_fin_programada,
                'Marcaje de entrada abierto sin registro de salida' AS detalle_inconsistencia
            FROM public.registro_asistencia a
            JOIN public.usuario u ON u.usuario_id = a.usuario_id
            LEFT JOIN public.turno_planificado t ON t.turno_id = a.turno_id
            WHERE a.fecha <= $1::date
              AND a.hora_salida IS NULL
              AND (
                  (t.hora_fin_programada IS NOT NULL AND CURRENT_TIME > t.hora_fin_programada + INTERVAL '1 hour')
                  OR (a.fecha < CURRENT_DATE)
              )
        `, [fecha]);

        // 2. Turnos planificados con ausencia total (sin asistencia)
        const { rows: ausencias } = await db.query(`
            SELECT
                t.turno_id,
                t.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                t.fecha_turno,
                t.hora_inicio_programada,
                t.hora_fin_programada,
                'Turno planificado sin registro de asistencia (Ausencia)' AS detalle_inconsistencia
            FROM public.turno_planificado t
            JOIN public.usuario u ON u.usuario_id = t.usuario_id
            LEFT JOIN public.registro_asistencia a ON a.turno_id = t.turno_id
            WHERE t.fecha_turno <= $1::date
              AND t.estado_turno != 'cancelado'
              AND a.asistencia_id IS NULL
              AND (t.fecha_turno < CURRENT_DATE OR CURRENT_TIME > t.hora_inicio_programada + INTERVAL '30 minutes')
        `, [fecha]);

        // 3. Marcajes marcados como inconsistentes directamente
        const { rows: marcajesInconsistentes } = await db.query(`
            SELECT
                a.asistencia_id,
                a.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                a.fecha,
                a.tipo_inconsistencia,
                a.observaciones AS detalle_inconsistencia
            FROM public.registro_asistencia a
            JOIN public.usuario u ON u.usuario_id = a.usuario_id
            WHERE a.es_inconsistente = true
              AND a.fecha = $1::date
        `, [fecha]);

        res.json({
            fecha_evaluada: fecha,
            total_inconsistencias: sinSalida.length + ausencias.length + marcajesInconsistentes.length,
            sin_salida: sinSalida,
            ausencias: ausencias,
            marcajes_inconsistentes: marcajesInconsistentes
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al validar inconsistencias de asistencia',
            error: error.message
        });
    }
};

/**
 * Subflujo CU 71: Controlando Cumplimiento y KPIs Laborales
 * GET /api/rrhh/cumplimiento
 */
const obtenerCumplimientoLaboral = async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;

        let condiciones = [];
        let params = [];

        if (fecha_desde) {
            params.push(fecha_desde);
            condiciones.push(`t.fecha_turno >= $${params.length}::date`);
        } else {
            condiciones.push("t.fecha_turno >= CURRENT_DATE - INTERVAL '7 days'");
        }

        if (fecha_hasta) {
            params.push(fecha_hasta);
            condiciones.push(`t.fecha_turno <= $${params.length}::date`);
        }

        const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        // Cruzar turnos con registros de asistencia
        const { rows: stats } = await db.query(`
            SELECT
                COUNT(t.turno_id)::int AS total_turnos_programados,
                COUNT(a.asistencia_id)::int AS total_asistencias_registradas,
                COUNT(*) FILTER (WHERE a.estado_asistencia = 'presente')::int AS asistencias_puntuales,
                COUNT(*) FILTER (WHERE a.estado_asistencia = 'atraso')::int AS total_atrasos,
                COALESCE(SUM(a.minutos_atraso), 0)::int AS minutos_atraso_totales,
                COUNT(*) FILTER (WHERE a.asistencia_id IS NULL AND (t.fecha_turno < CURRENT_DATE OR CURRENT_TIME > t.hora_fin_programada))::int AS ausencias_totales
            FROM public.turno_planificado t
            LEFT JOIN public.registro_asistencia a ON a.turno_id = t.turno_id
            ${whereSql}
        `, params);

        const row = stats[0] || {};
        const programados = row.total_turnos_programados || 0;
        const asistencias = row.total_asistencias_registradas || 0;
        const puntuales = row.asistencias_puntuales || 0;

        const porcentajeCumplimiento = programados > 0
            ? Math.round((asistencias / programados) * 100)
            : 100;

        const porcentajePuntualidad = asistencias > 0
            ? Math.round((puntuales / asistencias) * 100)
            : 100;

        // Resumen por trabajador
        const { rows: porTrabajador } = await db.query(`
            SELECT
                u.usuario_id,
                u.usuario_run,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                r.rol_nombre,
                COUNT(t.turno_id)::int AS turnos_asignados,
                COUNT(a.asistencia_id)::int AS asistencias,
                COUNT(*) FILTER (WHERE a.estado_asistencia = 'atraso')::int AS atrasos,
                COALESCE(SUM(a.minutos_atraso), 0)::int AS minutos_atraso,
                COUNT(*) FILTER (WHERE a.asistencia_id IS NULL AND (t.fecha_turno < CURRENT_DATE OR CURRENT_TIME > t.hora_fin_programada))::int AS ausencias
            FROM public.turno_planificado t
            JOIN public.usuario u ON u.usuario_id = t.usuario_id
            JOIN public.rol r ON r.rol_id = u.rol_id
            LEFT JOIN public.registro_asistencia a ON a.turno_id = t.turno_id
            ${whereSql}
            GROUP BY u.usuario_id, u.usuario_run, u.usuario_nombres, u.usuario_apellido_paterno, r.rol_nombre
            ORDER BY turnos_asignados DESC
        `, params);

        res.json({
            kpi: {
                total_turnos_programados: programados,
                total_asistencias: asistencias,
                asistencias_puntuales: puntuales,
                total_atrasos: row.total_atrasos || 0,
                minutos_atraso_totales: row.minutos_atraso_totales || 0,
                ausencias_totales: row.ausencias_totales || 0,
                porcentaje_cumplimiento: porcentajeCumplimiento,
                porcentaje_puntualidad: porcentajePuntualidad
            },
            trabajadores: porTrabajador
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al calcular cumplimiento laboral',
            error: error.message
        });
    }
};

module.exports = {
    crearTurnoPlanificado,
    obtenerTurnosPlanificados,
    registrarMarcajeAsistencia,
    obtenerHistorialAsistencia,
    validarInconsistenciasAsistencia,
    obtenerCumplimientoLaboral
};

