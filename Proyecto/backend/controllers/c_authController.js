const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Login tradicional (Administrador / Credenciales completas)
const login = async (req, res) => {
    const { usuario_correo, usuario_contrasena } = req.body;

    if (!usuario_correo || !usuario_contrasena) {
        return res.status(400).json({ message: 'Debe ingresar correo institucional y contraseña' });
    }

    try {
        const correo = usuario_correo.trim().toLowerCase();

        if (!correo.endsWith('@kidzania.cl')) {
            return res.status(400).json({ message: 'Acceso denegado: utilice un correo perteneciente al dominio oficial @kidzania.cl' });
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
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        if (user.usuario_estado_cuenta !== 'activo') {
            return res.status(403).json({ message: 'Cuenta inactiva. Contacte al administrador.' });
        }

        const storedPassword = user.usuario_contrasena;
        const passwordOk = typeof storedPassword === 'string' && storedPassword.startsWith('$2')
            ? await bcrypt.compare(usuario_contrasena, storedPassword)
            : usuario_contrasena === storedPassword;

        if (!passwordOk) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

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

        return res.json({
            token,
            rol: user.rol_id,
            rol_nombre: user.rol_nombre,
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

// Obtener lista de colaboradores / cajeros para la terminal táctil POS
const obtenerCajerosPos = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                u.usuario_id,
                u.usuario_nombres,
                u.usuario_apellido_paterno,
                u.usuario_correo,
                u.usuario_estado_cuenta,
                u.rol_id,
                r.rol_nombre::text AS rol_nombre
            FROM public.usuario u
            JOIN public.rol r ON r.rol_id = u.rol_id
            WHERE r.rol_nombre IN ('caja', 'colaborador', 'mesero', 'supervisor') OR u.rol_id IN (4, 5, 6, 7, 8)
            ORDER BY u.usuario_nombres ASC
        `);
        res.json({ ok: true, data: rows });
    } catch (error) {
        console.error('Error al obtener colaboradores POS:', error);
        res.status(500).json({ message: 'Error al consultar colaboradores registrados' });
    }
};

// Login táctil rápido mediante selección de cajero y PIN numérico
const loginPos = async (req, res) => {
    const { usuario_id, pin } = req.body;

    if (!usuario_id || !pin) {
        return res.status(400).json({ message: 'Debe seleccionar un colaborador e ingresar su PIN' });
    }

    try {
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
            WHERE u.usuario_id = $1
        `, [usuario_id]);

        const user = rows[0];
        if (!user) {
            return res.status(404).json({ message: 'Colaborador no encontrado' });
        }

        if (user.usuario_estado_cuenta !== 'activo') {
            return res.status(403).json({ message: 'Cuenta bloqueada o inactiva. Contacte al Administrador.' });
        }

        const storedPassword = user.usuario_contrasena;
        const pinStr = String(pin).trim();
        const passwordOk = typeof storedPassword === 'string' && storedPassword.startsWith('$2')
            ? await bcrypt.compare(pinStr, storedPassword)
            : pinStr === storedPassword;

        if (!passwordOk) {
            return res.status(401).json({ message: 'PIN incorrecto. Intente nuevamente.' });
        }

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

        return res.json({
            ok: true,
            token,
            rol: user.rol_id,
            rol_nombre: user.rol_nombre,
            usuario: {
                id: user.usuario_id,
                correo: user.usuario_correo,
                nombres: user.usuario_nombres,
                apellido_paterno: user.usuario_apellido_paterno,
                estado: user.usuario_estado_cuenta
            }
        });
    } catch (error) {
        console.error('Error en login POS:', error);
        res.status(500).json({ message: 'Error interno al validar PIN' });
    }
};

const logout = async (req, res) => {
    return res.json({ message: 'Sesión cerrada correctamente' });
};

module.exports = { login, logout, obtenerCajerosPos, loginPos };
