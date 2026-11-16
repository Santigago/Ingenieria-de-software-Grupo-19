const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { registrarAuditoria } = require('../config/initDb');
const { normalizarRol } = require('../middleware/authMiddleware');

const esRolTrabajadorPos = rolNombre => ['caja', 'cocina'].includes(normalizarRol(rolNombre));

const crearUsuario = async (req, res) => {
    const {
        run,
        nombres,
        ap_paterno,
        ap_materno = null,
        correo,
        contrasena,
        rol_id,
        estado = 'activo',
        pin = null,
        pin_confirmacion = null
    } = req.body;

    if (!run || !nombres || !ap_paterno || !correo || !contrasena || !rol_id) {
        return res.status(400).json({ message: 'Debe completar RUN, nombres, apellido paterno, correo, contraseña y rol' });
    }

    if (!String(correo).trim().toLowerCase().endsWith('@kidzania.cl')) {
        return res.status(400).json({ message: 'El correo debe pertenecer al dominio oficial @kidzania.cl' });
    }

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'El estado debe ser activo o inactivo' });
    }

    try {
        const { rows: rolRows } = await db.query(
            'SELECT rol_id, rol_nombre::text AS rol_nombre FROM public.rol WHERE rol_id = $1',
            [rol_id]
        );
        if (rolRows.length === 0) {
            return res.status(400).json({ message: 'El rol seleccionado no existe' });
        }

        const rolNombre = rolRows[0].rol_nombre;
        const esTrabajador = esRolTrabajadorPos(rolNombre);
        let pinHash = null;

        if (pin !== null && String(pin).trim() !== '') {
            if (!esTrabajador) {
                return res.status(400).json({
                    message: 'El PIN personal de 4 dígitos solo aplica para trabajadores con rol de cajero o cocina'
                });
            }
            const pinLimpio = String(pin).trim();
            const confirmacionLimpia = pin_confirmacion !== null && pin_confirmacion !== undefined
                ? String(pin_confirmacion).trim()
                : pinLimpio;

            if (!/^\d{4}$/.test(pinLimpio)) {
                return res.status(400).json({ message: 'El PIN debe contener exactamente 4 dígitos numéricos' });
            }
            if (pinLimpio !== confirmacionLimpia) {
                return res.status(400).json({ message: 'El PIN y su confirmación no coinciden' });
            }
            pinHash = await bcrypt.hash(pinLimpio, 10);
        }

        const hash = await bcrypt.hash(String(contrasena), 10);
        const { rows } = await db.query(`
            INSERT INTO public.usuario (
                usuario_run,
                usuario_nombres,
                usuario_apellido_paterno,
                usuario_apellido_materno,
                usuario_correo,
                "usuario_contrasena",
                rol_id,
                usuario_estado_cuenta,
                usuario_pin_hash,
                usuario_intentos_pin,
                usuario_pin_bloqueado,
                usuario_pin_actualizado_en
            ) VALUES ($1, $2, $3, $4, LOWER($5), $6, $7, $8, $9, 0, false, CASE WHEN $9 IS NOT NULL THEN now() ELSE NULL END)
            RETURNING usuario_id, usuario_run, usuario_nombres, usuario_apellido_paterno, usuario_correo, usuario_estado_cuenta, rol_id
        `, [run.trim(), nombres.trim(), ap_paterno.trim(), ap_materno, correo.trim(), hash, rol_id, estado, pinHash]);

        await registrarAuditoria({
            usuario_id: rows[0].usuario_id,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_usuario',
            modulo: 'usuarios',
            accion: 'Registro de nuevo usuario',
            resultado: 'exitoso',
            detalle: `Usuario creado (${rows[0].usuario_correo}) con rol '${rolNombre}'${pinHash ? ' y PIN inicial asignado' : ''}`
        });

        res.status(201).json({
            message: 'Usuario creado exitosamente en PostgreSQL',
            usuario: {
                ...rows[0],
                rol_nombre: rolNombre,
                tiene_pin: Boolean(pinHash),
                pin_bloqueado: false,
                intentos_pin: 0
            }
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ message: 'El RUN o correo ya existe en el sistema' });
        }
        res.status(500).json({ message: 'Error al crear usuario', error: error.message });
    }
};

const obtenerUsuarios = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                u.usuario_id,
                u.usuario_run,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_apellido_materno,
                u.usuario_correo,
                u.usuario_estado_cuenta,
                u.rol_id,
                r.rol_nombre::text AS rol_nombre,
                (u.usuario_pin_hash IS NOT NULL) AS tiene_pin,
                COALESCE(u.usuario_pin_bloqueado, false) AS pin_bloqueado,
                COALESCE(u.usuario_intentos_pin, 0) AS intentos_pin,
                u.usuario_pin_actualizado_en
            FROM public.usuario u
            JOIN public.rol r ON u.rol_id = r.rol_id
            ORDER BY COALESCE(u.usuario_pin_bloqueado, false) DESC, u.usuario_id DESC
        `);

        const enriquecidos = rows.map(u => {
            const esTrabajadorPos = esRolTrabajadorPos(u.rol_nombre);
            let estadoPin = 'no_aplica';
            if (esTrabajadorPos) {
                if (u.pin_bloqueado) {
                    estadoPin = 'bloqueado';
                } else if (u.tiene_pin) {
                    estadoPin = 'activo';
                } else {
                    estadoPin = 'sin_pin';
                }
            }
            return {
                ...u,
                es_trabajador_pos: esTrabajadorPos,
                estado_pin: estadoPin
            };
        });

        res.json(enriquecidos);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
    }
};

const obtenerRoles = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT rol_id, rol_nombre::text AS rol_nombre
            FROM public.rol
            WHERE rol_nombre::text IN ('admin', 'operador_inventario', 'encargado_rrhh', 'supervisor', 'caja', 'cocina')
            ORDER BY rol_id ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener roles', error: error.message });
    }
};

const actualizarEstadoUsuario = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado no válido' });
    }

    try {
        const query = estado === 'activo'
            ? `UPDATE public.usuario
               SET usuario_estado_cuenta = 'activo',
                   usuario_pin_bloqueado = false,
                   usuario_intentos_pin = 0
               WHERE usuario_id = $1
               RETURNING usuario_id, usuario_correo`
            : `UPDATE public.usuario
               SET usuario_estado_cuenta = 'inactivo'
               WHERE usuario_id = $1
               RETURNING usuario_id, usuario_correo`;

        const result = await db.query(query, [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        await registrarAuditoria({
            usuario_id: Number(id),
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_estado_usuario',
            modulo: 'usuarios',
            accion: `Cambio de estado de cuenta a ${estado}`,
            resultado: 'exitoso',
            detalle: `Cuenta ${result.rows[0].usuario_correo} marcada como ${estado}`
        });

        res.json({ message: `Usuario marcado como ${estado}` });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar estado de usuario', error: error.message });
    }
};

// CU 3 (Subflujo CU original 85): Asignando o restableciendo PIN de 4 dígitos de un trabajador (cajero o cocina)
const asignarPinTrabajador = async (req, res) => {
    const { id } = req.params;
    const { pin, pin_confirmacion } = req.body;

    if (pin === undefined || pin === null || pin_confirmacion === undefined || pin_confirmacion === null) {
        return res.status(400).json({ message: 'Debe ingresar el nuevo PIN de 4 dígitos y su confirmación' });
    }

    const pinLimpio = String(pin).trim();
    const confirmacionLimpia = String(pin_confirmacion).trim();

    if (!/^\d{4}$/.test(pinLimpio)) {
        return res.status(400).json({ message: 'El PIN debe estar compuesto exactamente por 4 dígitos numéricos' });
    }

    if (pinLimpio !== confirmacionLimpia) {
        return res.status(400).json({ message: 'El PIN ingresado y su confirmación no coinciden' });
    }

    try {
        const { rows } = await db.query(`
            SELECT
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_correo,
                (u.usuario_pin_hash IS NOT NULL) AS tenia_pin,
                COALESCE(u.usuario_pin_bloqueado, false) AS estaba_bloqueado,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE u.usuario_id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado' });
        }

        const trabajador = rows[0];
        if (!esRolTrabajadorPos(trabajador.rol_nombre)) {
            return res.status(400).json({
                message: 'Solo se puede asignar o restablecer PIN a trabajadores registrados con rol de cajero o cocina'
            });
        }

        const pinHash = await bcrypt.hash(pinLimpio, 10);
        await db.query(`
            UPDATE public.usuario
            SET usuario_pin_hash = $1,
                usuario_intentos_pin = 0,
                usuario_pin_bloqueado = false,
                usuario_estado_cuenta = 'activo',
                usuario_pin_actualizado_en = now()
            WHERE usuario_id = $2
        `, [pinHash, id]);

        const tipoAccion = trabajador.tenia_pin ? 'Restablecimiento de PIN' : 'Asignación de PIN';
        await registrarAuditoria({
            usuario_id: trabajador.usuario_id,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'asignacion_pin',
            modulo: 'usuarios',
            accion: `${tipoAccion} de trabajador POS`,
            resultado: 'exitoso',
            detalle: `${tipoAccion} para ${trabajador.usuario_nombres} ${trabajador.usuario_apellido_paterno} (${trabajador.rol_nombre}). Intentos reiniciados y cuenta habilitada.`
        });

        res.json({
            ok: true,
            message: `${tipoAccion} realizado correctamente para ${trabajador.usuario_nombres} ${trabajador.usuario_apellido_paterno}. El PIN quedó almacenado cifrado y la cuenta está habilitada.`
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al asignar PIN al trabajador', error: error.message });
    }
};

// CU 3 (Subflujo CU original 86): Desbloqueando cuenta de trabajador y reiniciando intentos fallidos
const desbloquearUsuario = async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await db.query(`
            SELECT
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_correo,
                u.usuario_estado_cuenta,
                COALESCE(u.usuario_pin_bloqueado, false) AS pin_bloqueado,
                COALESCE(u.usuario_intentos_pin, 0) AS intentos_pin,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE u.usuario_id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado' });
        }

        const trabajador = rows[0];
        if (!trabajador.pin_bloqueado && trabajador.usuario_estado_cuenta === 'activo' && Number(trabajador.intentos_pin) === 0) {
            return res.status(400).json({ message: 'La cuenta del trabajador no se encuentra bloqueada' });
        }

        await db.query(`
            UPDATE public.usuario
            SET usuario_pin_bloqueado = false,
                usuario_intentos_pin = 0,
                usuario_estado_cuenta = 'activo'
            WHERE usuario_id = $1
        `, [id]);

        await registrarAuditoria({
            usuario_id: trabajador.usuario_id,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'desbloqueo_pin',
            modulo: 'usuarios',
            accion: 'Desbloqueo de cuenta de trabajador',
            resultado: 'exitoso',
            detalle: `Cuenta de ${trabajador.usuario_nombres} ${trabajador.usuario_apellido_paterno} desbloqueada y contador de intentos reiniciado (tenía ${trabajador.intentos_pin} intentos fallidos).`
        });

        res.json({
            ok: true,
            message: `Cuenta de ${trabajador.usuario_nombres} ${trabajador.usuario_apellido_paterno} desbloqueada y contador de intentos reiniciado.`
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al desbloquear cuenta de trabajador', error: error.message });
    }
};

// Consulta de bitácora de auditoría de accesos, permisos y credenciales (CU 1, CU 2, CU 3, CU 4)
const obtenerBitacoraAuditoria = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                b.auditoria_id,
                b.evento_tipo,
                b.modulo,
                b.accion,
                b.resultado,
                b.detalle,
                b.fecha_hora,
                u.usuario_nombres AS afectado_nombres,
                u.usuario_apellido_paterno AS afectado_apellido,
                u.usuario_correo AS afectado_correo,
                actor.usuario_nombres AS actor_nombres,
                actor.usuario_apellido_paterno AS actor_apellido,
                actor.usuario_correo AS actor_correo
            FROM public.bitacora_auditoria b
            LEFT JOIN public.usuario u ON u.usuario_id = b.usuario_id
            LEFT JOIN public.usuario actor ON actor.usuario_id = b.actor_usuario_id
            ORDER BY b.fecha_hora DESC, b.auditoria_id DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar bitácora de auditoría', error: error.message });
    }
};

module.exports = {
    crearUsuario,
    obtenerUsuarios,
    obtenerRoles,
    actualizarEstadoUsuario,
    asignarPinTrabajador,
    desbloquearUsuario,
    obtenerBitacoraAuditoria
};
