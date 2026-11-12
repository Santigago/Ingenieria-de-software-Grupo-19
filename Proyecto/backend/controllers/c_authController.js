const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');
const { ROLES_OFICINA, normalizarRol, obtenerPermisosRol } = require('../middleware/authMiddleware');

const MAX_INTENTOS_PIN = 5;

const tieneFormatoCorreoValido = correo => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim());

// CU 1 — Autenticar personal de oficina en el sistema (con validación de dominio @kidzania.cl y rol de oficina)
const login = async (req, res) => {
    const { usuario_correo, usuario_contrasena } = req.body;

    if (!usuario_correo || !usuario_contrasena) {
        return res.status(400).json({ message: 'Debe ingresar correo institucional y contraseña' });
    }

    try {
        const correo = String(usuario_correo).trim().toLowerCase();

        // Subflujo CU original 2: Validar estructura y dominio del correo electrónico
        if (!tieneFormatoCorreoValido(correo)) {
            return res.status(400).json({ message: 'El formato del correo electrónico ingresado no es válido' });
        }

        if (!correo.endsWith('@kidzania.cl')) {
            await registrarAuditoria({
                evento_tipo: 'login_oficina_fallido',
                modulo: 'autenticacion',
                accion: 'Intento de login con dominio no autorizado',
                resultado: 'denegado',
                detalle: `Correo rechazado por dominio inválido: ${correo}`
            });
            return res.status(400).json({
                message: 'Acceso denegado: utilice un correo perteneciente al dominio oficial @kidzania.cl'
            });
        }

        const { rows } = await db.query(`
            SELECT 
                u.usuario_id,
                u.usuario_run,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_correo,
                u.usuario_estado_cuenta,
                u."usuario_contrasena" AS usuario_contrasena,
                u.rol_id,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE LOWER(u.usuario_correo) = $1
        `, [correo]);

        const user = rows[0];
        if (!user) {
            await registrarAuditoria({
                evento_tipo: 'login_oficina_fallido',
                modulo: 'autenticacion',
                accion: 'Login administrativo con correo inexistente',
                resultado: 'fallido',
                detalle: `Correo no registrado: ${correo}`
            });
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        if (user.usuario_estado_cuenta !== 'activo') {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'login_oficina_fallido',
                modulo: 'autenticacion',
                accion: 'Intento de acceso con cuenta inactiva',
                resultado: 'denegado',
                detalle: `Cuenta inactiva (${correo})`
            });
            return res.status(403).json({ message: 'Cuenta inactiva. Contacte al administrador.' });
        }

        // CU 1 paso 6.1 y Sección A.1: un cajero o trabajador de cocina no puede ingresar al panel de administración
        const rolNorm = normalizarRol(user.rol_nombre);
        if (!ROLES_OFICINA.includes(rolNorm)) {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'acceso_denegado_rol',
                modulo: 'autenticacion',
                accion: 'Intento de ingreso al panel de administración con rol operativo POS',
                resultado: 'denegado',
                detalle: `Usuario ${correo} con rol '${user.rol_nombre}' intentó acceder por login de oficina`
            });
            return res.status(403).json({
                message: 'Acceso restringido al personal de oficina. Los cajeros y personal de cocina deben ingresar desde la Terminal Táctil POS con su PIN personal.',
                canal_sugerido: 'pos_touch'
            });
        }

        const storedPassword = String(user.usuario_contrasena || '');
        const esHashBcrypt = storedPassword.startsWith('$2');
        const passwordOk = esHashBcrypt
            ? await bcrypt.compare(String(usuario_contrasena), storedPassword)
            : String(usuario_contrasena) === storedPassword;

        if (!passwordOk) {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'login_oficina_fallido',
                modulo: 'autenticacion',
                accion: 'Contraseña incorrecta en login de oficina',
                resultado: 'fallido',
                detalle: `Contraseña inválida para ${correo}`
            });
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        // Si la contraseña aún estaba en texto plano, actualizarla inmediatamente a hash seguro bcrypt
        if (!esHashBcrypt) {
            const nuevoHash = await bcrypt.hash(String(usuario_contrasena), 10);
            await db.query('UPDATE public.usuario SET "usuario_contrasena" = $1 WHERE usuario_id = $2', [nuevoHash, user.usuario_id]);
        }

        const permisos = obtenerPermisosRol(user.rol_nombre);
        const token = jwt.sign(
            {
                id: user.usuario_id,
                rol_id: user.rol_id,
                rol_nombre: user.rol_nombre,
                canal: 'admin_web'
            },
            process.env.JWT_SECRET || 'grupo19_jwt_secret_dev_key',
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        await registrarAuditoria({
            usuario_id: user.usuario_id,
            actor_usuario_id: user.usuario_id,
            evento_tipo: 'login_oficina_exitoso',
            modulo: 'autenticacion',
            accion: 'Inicio de sesión en panel de administración',
            resultado: 'exitoso',
            detalle: `Ingreso exitoso con rol '${user.rol_nombre}'`
        });

        return res.json({
            token,
            rol: user.rol_id,
            rol_nombre: user.rol_nombre,
            pagina_inicio: permisos.pagina_inicio,
            permisos,
            usuario: {
                id: user.usuario_id,
                correo: user.usuario_correo,
                nombres: user.usuario_nombres,
                apellido_paterno: user.usuario_apellido_paterno,
                estado: user.usuario_estado_cuenta
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// CU 4 — Obtener lista de trabajadores habilitados (solo cajeros y cocina activos con PIN asignado, sin exponer RUN ni PIN)
const obtenerCajerosPos = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                r.rol_nombre::text AS rol_nombre,
                COALESCE(u.usuario_pin_bloqueado, false) AS pin_bloqueado,
                COALESCE(u.usuario_intentos_pin, 0) AS intentos_fallidos,
                CASE
                    WHEN COALESCE(u.usuario_pin_bloqueado, false) = true THEN 'bloqueado'
                    ELSE 'activo'
                END AS usuario_estado_cuenta
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE u.usuario_estado_cuenta = 'activo'
              AND LOWER(r.rol_nombre::text) IN ('caja', 'cocina')
              AND u.usuario_pin_hash IS NOT NULL
            ORDER BY u.usuario_nombres ASC, u.usuario_apellido_paterno ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (error) {
        console.error('Error al obtener colaboradores POS:', error);
        res.status(500).json({ message: 'Error al consultar trabajadores habilitados para el punto de venta' });
    }
};

// CU 4 — Autenticar trabajador mediante PIN de 4 dígitos (con conteo de intentos y bloqueo al 5° intento fallido)
const loginPos = async (req, res) => {
    const { usuario_id, pin } = req.body;

    if (!usuario_id || pin === undefined || pin === null || String(pin).trim() === '') {
        return res.status(400).json({ message: 'Debe seleccionar un trabajador e ingresar su PIN de 4 dígitos' });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
        return res.status(400).json({ message: 'El PIN debe estar compuesto exactamente por 4 dígitos numéricos' });
    }

    try {
        const { rows } = await db.query(`
            SELECT 
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_estado_cuenta,
                u.usuario_pin_hash,
                COALESCE(u.usuario_intentos_pin, 0) AS usuario_intentos_pin,
                COALESCE(u.usuario_pin_bloqueado, false) AS usuario_pin_bloqueado,
                u.rol_id,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE u.usuario_id = $1
        `, [usuario_id]);

        const user = rows[0];
        if (!user) {
            return res.status(404).json({ message: 'Trabajador no encontrado' });
        }

        const rolNorm = normalizarRol(user.rol_nombre);
        if (!['caja', 'cocina'].includes(rolNorm)) {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'acceso_denegado_rol',
                modulo: 'pos',
                accion: 'Intento de acceso POS con rol no operativo',
                resultado: 'denegado',
                detalle: `Rol '${user.rol_nombre}' no corresponde a cajero ni cocina`
            });
            return res.status(403).json({
                message: 'El trabajador seleccionado no posee rol de cajero o cocina para operar en el punto de venta.'
            });
        }

        if (user.usuario_estado_cuenta !== 'activo') {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'login_pos_fallido',
                modulo: 'pos',
                accion: 'Intento de acceso POS con cuenta inactiva',
                resultado: 'denegado',
                detalle: 'Cuenta en estado inactivo'
            });
            return res.status(403).json({ message: 'Cuenta inactiva. Contacte al Administrador.' });
        }

        if (user.usuario_pin_bloqueado || Number(user.usuario_intentos_pin) >= MAX_INTENTOS_PIN) {
            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'login_pos_fallido',
                modulo: 'pos',
                accion: 'Intento de acceso POS con PIN bloqueado',
                resultado: 'bloqueado',
                detalle: 'La cuenta ya se encontraba bloqueada por intentos fallidos'
            });
            return res.status(403).json({
                ok: false,
                bloqueado: true,
                intentos_fallidos: MAX_INTENTOS_PIN,
                intentos_restantes: 0,
                message: 'Cuenta bloqueada por superar los 5 intentos fallidos de PIN. Solicite el desbloqueo a un Administrador o Encargado de RRHH.'
            });
        }

        if (!user.usuario_pin_hash) {
            return res.status(403).json({
                message: 'El trabajador no tiene un PIN asignado. Solicite la asignación de PIN a un Administrador o Encargado de RRHH.'
            });
        }

        const pinValido = user.usuario_pin_hash.startsWith('$2')
            ? await bcrypt.compare(pinStr, user.usuario_pin_hash)
            : pinStr === user.usuario_pin_hash;

        if (!pinValido) {
            const nuevosIntentos = Number(user.usuario_intentos_pin || 0) + 1;
            const quedaBloqueado = nuevosIntentos >= MAX_INTENTOS_PIN;
            const intentosRestantes = Math.max(MAX_INTENTOS_PIN - nuevosIntentos, 0);

            await db.query(
                `UPDATE public.usuario
                 SET usuario_intentos_pin = $1,
                     usuario_pin_bloqueado = $2
                 WHERE usuario_id = $3`,
                [nuevosIntentos, quedaBloqueado, user.usuario_id]
            );

            await registrarAuditoria({
                usuario_id: user.usuario_id,
                actor_usuario_id: user.usuario_id,
                evento_tipo: 'login_pos_fallido',
                modulo: 'pos',
                accion: 'Ingreso de PIN incorrecto en punto de venta',
                resultado: quedaBloqueado ? 'bloqueado' : 'fallido',
                detalle: `Intento fallido ${nuevosIntentos} de ${MAX_INTENTOS_PIN}`
            });

            if (quedaBloqueado) {
                await registrarAuditoria({
                    usuario_id: user.usuario_id,
                    actor_usuario_id: user.usuario_id,
                    evento_tipo: 'bloqueo_pin',
                    modulo: 'pos',
                    accion: 'Bloqueo automático de cuenta de trabajador por 5 intentos fallidos de PIN',
                    resultado: 'bloqueado',
                    detalle: `Cuenta bloqueada automáticamente al alcanzar ${MAX_INTENTOS_PIN} intentos fallidos consecutivos`
                });

                return res.status(403).json({
                    ok: false,
                    bloqueado: true,
                    intentos_fallidos: nuevosIntentos,
                    intentos_restantes: 0,
                    message: 'PIN incorrecto (intento 5 de 5). Su cuenta ha sido bloqueada por seguridad. Solicite el desbloqueo al Administrador o Encargado de RRHH.'
                });
            }

            return res.status(401).json({
                ok: false,
                bloqueado: false,
                intentos_fallidos: nuevosIntentos,
                intentos_restantes: intentosRestantes,
                message: `PIN incorrecto (intento ${nuevosIntentos} de ${MAX_INTENTOS_PIN}). Le ${intentosRestantes === 1 ? 'queda 1 intento' : `quedan ${intentosRestantes} intentos`} antes del bloqueo de la cuenta.`
            });
        }

        // Subflujo CU 77 paso 6.4: Si es correcto, reiniciar el contador de intentos y crear la sesión
        await db.query(
            `UPDATE public.usuario
             SET usuario_intentos_pin = 0,
                 usuario_pin_bloqueado = false
             WHERE usuario_id = $1`,
            [user.usuario_id]
        );

        const permisos = obtenerPermisosRol(user.rol_nombre);
        const token = jwt.sign(
            {
                id: user.usuario_id,
                rol_id: user.rol_id,
                rol_nombre: user.rol_nombre,
                canal: 'pos_touch'
            },
            process.env.JWT_SECRET || 'grupo19_jwt_secret_dev_key',
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        await registrarAuditoria({
            usuario_id: user.usuario_id,
            actor_usuario_id: user.usuario_id,
            evento_tipo: 'login_pos_exitoso',
            modulo: 'pos',
            accion: 'Inicio de sesión con PIN en punto de venta',
            resultado: 'exitoso',
            detalle: `Acceso POS exitoso con rol '${user.rol_nombre}'`
        });

        return res.json({
            ok: true,
            token,
            rol: user.rol_id,
            rol_nombre: user.rol_nombre,
            pagina_inicio: permisos.pagina_inicio,
            permisos,
            usuario: {
                id: user.usuario_id,
                nombres: user.usuario_nombres,
                apellido_paterno: user.usuario_apellido_paterno,
                estado: 'activo'
            }
        });
    } catch (error) {
        console.error('Error en login POS:', error);
        res.status(500).json({ message: 'Error interno al validar PIN' });
    }
};

// CU 2 — Consultar permisos vigentes de la sesión autenticada
const obtenerSesionPermisos = async (req, res) => {
    const permisos = obtenerPermisosRol(req.user?.rol_nombre);
    return res.json({
        ok: true,
        usuario: req.user,
        permisos
    });
};

const logout = async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grupo19_jwt_secret_dev_key');
            await registrarAuditoria({
                usuario_id: decoded.id,
                actor_usuario_id: decoded.id,
                evento_tipo: 'logout',
                modulo: decoded.canal === 'pos_touch' ? 'pos' : 'autenticacion',
                accion: 'Cierre manual de sesión',
                resultado: 'exitoso',
                detalle: `Cierre de sesión de rol '${decoded.rol_nombre}'`
            });
        } catch (_) {
            // Ignorar si el token ya expiró al cerrar sesión
        }
    }
    return res.json({ message: 'Sesión cerrada correctamente' });
};

module.exports = { login, logout, obtenerCajerosPos, loginPos, obtenerSesionPermisos };
