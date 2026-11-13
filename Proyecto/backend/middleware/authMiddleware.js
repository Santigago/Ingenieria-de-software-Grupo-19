const jwt = require('jsonwebtoken');
const { registrarAuditoria } = require('../config/initDb');

const normalizarRol = rol => {
    const r = String(rol || '').trim().toLowerCase();
    if (r === 'cajero') return 'caja';
    return r;
};

const ROLES_OFICINA = ['admin', 'operador_inventario', 'encargado_rrhh', 'supervisor'];
const ROLES_POS = ['caja', 'cocina'];

const MATRIZ_PERMISOS = {
    admin: {
        etiqueta: 'Administrador',
        canal: 'admin_web',
        pagina_inicio: 'v_dashboard.html',
        vistas_permitidas: [
            'v_dashboard.html',
            'v_usuarios.html',
            'v_unidades.html',
            'v_proveedores.html',
            'v_ubicaciones.html',
            'v_productos.html',
            'v_lotes.html',
            'v_ingresos.html',
            'v_salidas.html',
            'v_mermas.html',
            'v_movimientos.html',
            'v_salon.html',
            'v_pos.html',
            'v_cocina.html',
            'v_asistencia.html'
        ],
        modulos: {
            dashboard: ['ver', 'exportar'],
            usuarios: ['ver', 'crear', 'editar', 'inactivar', 'asignar_pin', 'desbloquear'],
            unidades: ['ver', 'crear', 'editar', 'inactivar'],
            proveedores: ['ver', 'crear', 'editar', 'inactivar'],
            ubicaciones: ['ver', 'crear', 'editar', 'inactivar'],
            productos: ['ver', 'crear', 'editar', 'inactivar'],
            lotes: ['ver', 'crear', 'editar'],
            movimientos: ['ver', 'crear', 'autorizar_excepcion'],
            mermas: ['ver', 'crear'],
            mesas: ['ver', 'editar'],
            puestos: ['ver', 'crear', 'editar', 'inactivar'],
            cajas: ['ver', 'abrir', 'cerrar'],
            pos: ['ver', 'operar'],
            boletas: ['ver', 'reimprimir'],
            sap: ['ver', 'sincronizar'],
            promociones: ['ver', 'crear', 'editar', 'inactivar'],
            cocina: ['ver', 'preparar', 'marcar_listo', 'entregar', 'incidencias', 'metricas'],
            pedidos: ['ver', 'crear', 'editar', 'cancelar', 'entregar'],
            rrhh: ['ver', 'crear', 'editar', 'marcar', 'validar', 'cumplimiento']
        }
    },
    operador_inventario: {
        etiqueta: 'Operador de Inventario',
        canal: 'admin_web',
        pagina_inicio: 'v_productos.html',
        vistas_permitidas: [
            'v_proveedores.html',
            'v_ubicaciones.html',
            'v_productos.html',
            'v_lotes.html',
            'v_ingresos.html',
            'v_salidas.html',
            'v_mermas.html',
            'v_movimientos.html'
        ],
        modulos: {
            dashboard: [],
            usuarios: [],
            unidades: ['ver'],
            proveedores: ['ver', 'crear', 'editar', 'inactivar'],
            ubicaciones: ['ver', 'crear', 'editar', 'inactivar'],
            productos: ['ver', 'crear', 'editar', 'inactivar'],
            lotes: ['ver', 'crear', 'editar'],
            movimientos: ['ver', 'crear'],
            mermas: ['ver', 'crear'],
            mesas: [],
            puestos: ['ver'],
            cajas: [],
            pos: []
        }
    },
    supervisor: {
        etiqueta: 'Supervisor',
        canal: 'admin_web',
        pagina_inicio: 'v_productos.html',
        vistas_permitidas: [
            'v_proveedores.html',
            'v_ubicaciones.html',
            'v_productos.html',
            'v_lotes.html',
            'v_mermas.html',
            'v_movimientos.html',
            'v_salon.html',
            'v_cocina.html',
            'v_asistencia.html'
        ],
        modulos: {
            dashboard: [],
            usuarios: [],
            unidades: ['ver'],
            proveedores: ['ver'],
            ubicaciones: ['ver'],
            productos: ['ver'],
            lotes: ['ver'],
            movimientos: ['ver'],
            mermas: ['ver'],
            mesas: ['ver'],
            puestos: ['ver'],
            cajas: ['ver'],
            pos: [],
            boletas: ['ver', 'reimprimir'],
            sap: ['ver'],
            promociones: ['ver'],
            cocina: ['ver', 'incidencias', 'metricas'],
            pedidos: ['ver', 'entregar', 'cancelar'],
            rrhh: ['ver', 'marcar', 'cumplimiento']
        }
    },
    encargado_rrhh: {
        etiqueta: 'Encargado de RRHH',
        canal: 'admin_web',
        pagina_inicio: 'v_asistencia.html',
        vistas_permitidas: [
            'v_asistencia.html',
            'v_usuarios.html'
        ],
        modulos: {
            dashboard: [],
            usuarios: ['ver', 'crear', 'editar', 'inactivar', 'asignar_pin', 'desbloquear'],
            unidades: [],
            proveedores: [],
            ubicaciones: [],
            productos: [],
            lotes: [],
            movimientos: [],
            mesas: [],
            puestos: [],
            cajas: [],
            pos: [],
            cocina: [],
            pedidos: [],
            rrhh: ['ver', 'crear', 'editar', 'marcar', 'validar', 'cumplimiento']
        }
    },
    caja: {
        etiqueta: 'Cajero',
        canal: 'pos_touch',
        pagina_inicio: 'v_pos.html',
        vistas_permitidas: ['v_pos.html', 'v_cocina.html'],
        modulos: {
            dashboard: [],
            usuarios: [],
            unidades: [],
            proveedores: [],
            ubicaciones: [],
            productos: ['ver'],
            lotes: [],
            movimientos: ['crear'],
            mesas: ['ver', 'editar'],
            puestos: ['ver'],
            cajas: ['ver', 'abrir', 'cerrar'],
            pos: ['ver', 'operar'],
            boletas: ['ver', 'reimprimir'],
            promociones: ['ver'],
            cocina: ['ver', 'entregar'],
            pedidos: ['ver', 'crear', 'cancelar', 'entregar'],
            rrhh: ['ver', 'marcar']
        }
    },
    cocina: {
        etiqueta: 'Cocina',
        canal: 'pos_touch',
        pagina_inicio: 'v_cocina.html',
        vistas_permitidas: ['v_cocina.html', 'v_pos.html', 'v_mermas.html'],
        modulos: {
            dashboard: [],
            usuarios: [],
            unidades: [],
            proveedores: [],
            ubicaciones: [],
            productos: ['ver'],
            lotes: ['ver'],
            movimientos: ['ver', 'crear'],
            mermas: ['ver', 'crear'],
            mesas: ['ver'],
            puestos: ['ver'],
            cajas: ['ver'],
            pos: ['ver', 'operar'],
            cocina: ['ver', 'preparar', 'marcar_listo', 'incidencias', 'metricas'],
            pedidos: ['ver', 'preparar', 'marcar_listo', 'incidencias', 'cancelar'],
            rrhh: ['ver', 'marcar']
        }
    },
    colaborador: {
        etiqueta: 'Colaborador POS',
        canal: 'pos_touch',
        pagina_inicio: 'v_pos.html',
        vistas_permitidas: ['v_pos.html'],
        modulos: {
            productos: ['ver'],
            mesas: ['ver'],
            puestos: ['ver'],
            cajas: ['ver', 'abrir', 'cerrar'],
            pos: ['ver', 'operar']
        }
    },
    mesero: {
        etiqueta: 'Mesero POS',
        canal: 'pos_touch',
        pagina_inicio: 'v_pos.html',
        vistas_permitidas: ['v_pos.html'],
        modulos: {
            productos: ['ver'],
            mesas: ['ver', 'editar'],
            puestos: ['ver'],
            cajas: ['ver', 'abrir', 'cerrar'],
            pos: ['ver', 'operar'],
            boletas: ['ver', 'reimprimir'],
            promociones: ['ver']
        }
    }
};

function obtenerPermisosRol(rolNombre) {
    const clave = normalizarRol(rolNombre);
    return MATRIZ_PERMISOS[clave] || {
        etiqueta: rolNombre || 'Sin rol',
        canal: 'pos_touch',
        pagina_inicio: 'v_login.html',
        vistas_permitidas: [],
        modulos: {}
    };
}

function tienePermiso(rolNombre, modulo, accion) {
    const clave = normalizarRol(rolNombre);
    if (clave === 'admin') return true;
    const config = MATRIZ_PERMISOS[clave];
    if (!config || !config.modulos) return false;
    const acciones = config.modulos[modulo] || [];
    return acciones.includes(accion);
}

const verificarToken = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(403).json({ message: 'Token requerido. Inicie sesión para continuar.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grupo19_jwt_secret_dev_key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Sesión expirada o token no válido' });
    }
};

const requerirRoles = (...rolesPermitidos) => {
    const permitidos = rolesPermitidos.map(normalizarRol);
    return async (req, res, next) => {
        const rolUsuario = normalizarRol(req.user?.rol_nombre);
        if (rolUsuario === 'admin' || permitidos.includes(rolUsuario)) {
            return next();
        }

        const permisosRol = obtenerPermisosRol(rolUsuario);
        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'acceso_denegado_rol',
            modulo: req.baseUrl || 'api',
            accion: `${req.method} ${req.originalUrl}`,
            resultado: 'denegado',
            detalle: `Rol actual '${rolUsuario || 'desconocido'}' sin permiso. Roles requeridos: ${permitidos.join(', ')}`
        });

        return res.status(403).json({
            message: 'Acceso denegado: su perfil no tiene permisos para ejecutar esta acción.',
            rol_requerido: permitidos,
            rol_actual: rolUsuario || null,
            pagina_inicio: permisosRol.pagina_inicio
        });
    };
};

const requerirPermiso = (modulo, accion) => {
    return async (req, res, next) => {
        const rolUsuario = normalizarRol(req.user?.rol_nombre);
        if (tienePermiso(rolUsuario, modulo, accion)) {
            return next();
        }

        const permisosRol = obtenerPermisosRol(rolUsuario);
        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'acceso_denegado_rol',
            modulo,
            accion,
            resultado: 'denegado',
            detalle: `Rol '${rolUsuario || 'desconocido'}' intentó '${accion}' en módulo '${modulo}' (${req.method} ${req.originalUrl})`
        });

        return res.status(403).json({
            message: `Acceso denegado: su rol (${permisosRol.etiqueta}) no cuenta con permiso de '${accion}' en el módulo '${modulo}'.`,
            modulo,
            accion_requerida: accion,
            rol_actual: rolUsuario || null,
            pagina_inicio: permisosRol.pagina_inicio
        });
    };
};

const esAdmin = requerirRoles('admin');
const esGestionUsuarios = requerirPermiso('usuarios', 'ver');
const esInventario = requerirRoles('admin', 'operador_inventario');
const esLecturaInventario = requerirRoles('admin', 'operador_inventario', 'supervisor');
const esSupervisorOInventario = requerirRoles('admin', 'operador_inventario', 'supervisor');

module.exports = {
    ROLES_OFICINA,
    ROLES_POS,
    MATRIZ_PERMISOS,
    normalizarRol,
    obtenerPermisosRol,
    tienePermiso,
    verificarToken,
    requerirRoles,
    requerirPermiso,
    exigirPermiso: requerirPermiso,
    esAdmin,
    esGestionUsuarios,
    esInventario,
    esLecturaInventario,
    esSupervisorOInventario
};
