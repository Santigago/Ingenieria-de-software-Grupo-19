const API_URL = '';
const token = localStorage.getItem('token');
const rolId = localStorage.getItem('rol');
const rolNombreRaw = localStorage.getItem('rol_nombre') || (rolId === '1' ? 'admin' : '');
const usuarioNombre = localStorage.getItem('usuario') || 'Usuario';

function normalizarRolCliente(rol) {
    const r = String(rol || '').trim().toLowerCase();
    if (r === 'cajero') return 'caja';
    return r;
}

const rolNombre = normalizarRolCliente(rolNombreRaw);
const esAdmin = rolId === '1' || rolNombre === 'admin';

const CONFIG_ROLES = {
    admin: {
        etiqueta: 'Administrador',
        pagina_inicio: 'v_dashboard.html',
        solo_lectura: false,
        vistas: [
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
            'v_pos.html'
        ],
        modulos_escritura: ['usuarios', 'unidades', 'proveedores', 'ubicaciones', 'productos', 'lotes', 'movimientos', 'mermas', 'mesas', 'puestos', 'cajas']
    },
    operador_inventario: {
        etiqueta: 'Operador de Inventario',
        pagina_inicio: 'v_productos.html',
        solo_lectura: false,
        vistas: [
            'v_proveedores.html',
            'v_ubicaciones.html',
            'v_productos.html',
            'v_lotes.html',
            'v_ingresos.html',
            'v_salidas.html',
            'v_mermas.html',
            'v_movimientos.html'
        ],
        modulos_escritura: ['proveedores', 'ubicaciones', 'productos', 'lotes', 'movimientos', 'mermas']
    },
    supervisor: {
        etiqueta: 'Supervisor',
        pagina_inicio: 'v_productos.html',
        solo_lectura: true,
        vistas: [
            'v_proveedores.html',
            'v_ubicaciones.html',
            'v_productos.html',
            'v_lotes.html',
            'v_mermas.html',
            'v_movimientos.html',
            'v_salon.html'
        ],
        modulos_escritura: []
    },
    encargado_rrhh: {
        etiqueta: 'Encargado de RRHH',
        pagina_inicio: 'v_usuarios.html',
        solo_lectura: false,
        vistas: [
            'v_usuarios.html'
        ],
        modulos_escritura: ['usuarios']
    },
    caja: {
        etiqueta: 'Cajero POS',
        pagina_inicio: 'v_pos.html',
        solo_lectura: false,
        vistas: ['v_pos.html'],
        modulos_escritura: ['pos', 'mesas', 'cajas']
    },
    cocina: {
        etiqueta: 'Cocina POS',
        pagina_inicio: 'v_pos.html',
        solo_lectura: false,
        vistas: ['v_pos.html', 'v_mermas.html'],
        modulos_escritura: ['pos', 'mermas', 'movimientos']
    },
    colaborador: {
        etiqueta: 'Colaborador POS',
        pagina_inicio: 'v_pos.html',
        solo_lectura: false,
        vistas: ['v_pos.html'],
        modulos_escritura: ['pos']
    },
    mesero: {
        etiqueta: 'Mesero POS',
        pagina_inicio: 'v_pos.html',
        solo_lectura: false,
        vistas: ['v_pos.html'],
        modulos_escritura: ['pos', 'mesas']
    }
};

function obtenerConfigRol(rol = rolNombre) {
    const clave = normalizarRolCliente(rol);
    return CONFIG_ROLES[clave] || (esAdmin ? CONFIG_ROLES.admin : {
        etiqueta: rol || 'Usuario',
        pagina_inicio: 'v_pos.html',
        solo_lectura: true,
        vistas: ['v_pos.html'],
        modulos_escritura: []
    });
}

function obtenerPaginaInicioRol(rol = rolNombre) {
    return obtenerConfigRol(rol).pagina_inicio;
}

function puedeVerVista(vistaArchivo, rol = rolNombre) {
    if (esAdmin) return true;
    const cfg = obtenerConfigRol(rol);
    return cfg.vistas.includes(vistaArchivo);
}

function puedeEscribirModulo(modulo, rol = rolNombre) {
    if (esAdmin) return true;
    const cfg = obtenerConfigRol(rol);
    return (cfg.modulos_escritura || []).includes(modulo);
}

const archivoActual = location.pathname.split('/').pop() || 'v_login.html';
const esPaginaLogin = archivoActual === 'v_login.html' || archivoActual === 'v_pos_login.html';

// Validación de sesión activa
if (!token && !esPaginaLogin) {
    window.location.href = 'v_login.html';
}

// CU 2 — Validar permisos según el rol del usuario: bloquear vistas no autorizadas y redirigir a la página de inicio del rol
if (token && !esPaginaLogin && !puedeVerVista(archivoActual)) {
    window.location.href = obtenerPaginaInicioRol(rolNombre);
}

const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
const jsonHeaders = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

async function cerrarSesion(redireccion = 'v_login.html') {
    if (token) {
        try {
            await fetch(buildApiUrl('/api/auth/logout'), {
                method: 'POST',
                headers: authHeaders
            });
        } catch (_) {
            // Ignorar error de red al cerrar sesión
        }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('rol_nombre');
    localStorage.removeItem('usuario');
    localStorage.removeItem('permisos');
    window.location.href = redireccion;
}

function formatoFecha(valor) {
    if (!valor) return '-';
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleDateString('es-CL');
}

function formatoNumero(valor) {
    const numero = Number(valor || 0);
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(numero);
}

function setMensaje(id, texto, ok = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto;
    el.className = `mb-4 p-3 rounded text-sm border ${ok ? 'bg-green-900/40 border-green-600 text-green-100' : 'bg-red-900/40 border-red-600 text-red-100'}`;
    el.classList.remove('hidden');
}

function buildApiUrl(url) {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    if (url.startsWith('/api')) {
        return `${API_URL}${url}`;
    }
    return url;
}

async function api(url, options = {}) {
    const response = await fetch(buildApiUrl(url), options);
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (response.status === 401) {
        if (data?.message) alert(data.message);
        cerrarSesion();
    } else if (response.status === 403) {
        if (data?.pagina_inicio && !location.pathname.endsWith('/' + data.pagina_inicio)) {
            if (data?.message) alert(data.message);
            window.location.href = data.pagina_inicio;
        }
    }
    if (!response.ok) throw new Error(data?.message || 'Error en la operación');
    return data;
}

const ITEMS_MENU = [
    { href: 'v_dashboard.html', texto: 'Dashboard' },
    { href: 'v_usuarios.html', texto: 'Usuarios y roles' },
    { href: 'v_unidades.html', texto: 'Unidades de medida' },
    { href: 'v_proveedores.html', texto: 'Proveedores' },
    { href: 'v_ubicaciones.html', texto: 'Ubicaciones bodega' },
    { href: 'v_productos.html', texto: 'Productos' },
    { href: 'v_lotes.html', texto: 'Lotes' },
    { href: 'v_ingresos.html', texto: 'Ingresos de stock' },
    { href: 'v_salidas.html', texto: 'Salidas de stock' },
    { href: 'v_mermas.html', texto: 'Mermas y desperdicios' },
    { href: 'v_movimientos.html', texto: 'Historial movimientos' },
    { href: 'v_salon.html', texto: 'Puestos de venta y Salón' },
    { href: 'v_pos.html', texto: 'Vista Cajero (POS)' }
];

function navHtml(titulo) {
    const cfgRol = obtenerConfigRol(rolNombre);
    const enlacesPermitidos = ITEMS_MENU
        .filter(item => puedeVerVista(item.href))
        .map(item => link(item.href, item.texto, titulo))
        .join('');

    return `
    <aside class="w-72 min-h-screen bg-gray-950 border-r border-gray-800 p-5 fixed left-0 top-0 hidden lg:block">
        <h1 class="text-2xl font-bold text-amber-500">KidZania</h1>
        <p class="text-xs text-gray-400 mt-1">Panel de Administración · Grupo 19</p>
        <div class="mt-5 p-3 bg-gray-900 rounded border border-gray-800 text-sm text-gray-300">
            <div class="font-semibold text-white">${usuarioNombre}</div>
            <div class="uppercase text-xs text-amber-400 mt-1">${cfgRol.etiqueta}</div>
            ${cfgRol.solo_lectura ? '<div class="mt-1.5 inline-block text-[11px] bg-blue-950/70 border border-blue-700/60 text-blue-200 px-2 py-0.5 rounded">Modo Supervisión (Solo consulta)</div>' : ''}
        </div>
        <nav class="mt-6 space-y-1 text-sm">
            ${enlacesPermitidos}
        </nav>
        <div class="mt-8 pt-4 border-t border-gray-800 space-y-2">
            <a href="v_pos_login.html" class="block text-center text-xs text-amber-400 hover:text-amber-300 bg-gray-900 border border-gray-700 px-3 py-2 rounded">
                🖥️ Abrir Terminal POS
            </a>
            <button onclick="cerrarSesion('v_login.html')" class="w-full bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2 text-sm">Cerrar sesión</button>
        </div>
    </aside>
    <header class="lg:hidden bg-gray-950 border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-10">
        <div>
            <span class="font-bold text-amber-500">KidZania Admin</span>
            <span class="ml-2 text-xs text-gray-400">(${cfgRol.etiqueta})</span>
        </div>
        <button onclick="cerrarSesion('v_login.html')" class="text-sm bg-red-600 text-white rounded px-3 py-1">Salir</button>
    </header>`;
}

function link(href, texto, titulo) {
    const active = location.pathname.endsWith('/' + href) || texto === titulo;
    return `<a class="block px-3 py-2 rounded ${active ? 'bg-amber-500 text-gray-950 font-semibold' : 'text-gray-300 hover:bg-gray-900 hover:text-white'}" href="${href}">${texto}</a>`;
}

function montarLayout(titulo, subtitulo = '') {
    document.body.insertAdjacentHTML('afterbegin', navHtml(titulo));
    const main = document.getElementById('main');
    const cfgRol = obtenerConfigRol(rolNombre);

    if (main) {
        const avisoLectura = cfgRol.solo_lectura
            ? `<div class="mb-4 p-3 rounded border border-blue-700/60 bg-blue-950/40 text-blue-200 text-xs">
                 🔒 <strong>Perfil ${cfgRol.etiqueta}:</strong> cuenta con permisos de revisión, control y consulta de inventario y movimientos. Las acciones de creación, edición o baja están restringidas según Documento 0 (CU 2).
               </div>`
            : '';

        main.insertAdjacentHTML(
            'afterbegin',
            `<div class="mb-6"><h2 class="text-3xl font-bold text-white">${titulo}</h2><p class="text-gray-400 mt-1">${subtitulo}</p></div>${avisoLectura}`
        );
    }

    // Si el rol actual es de solo lectura (ej. Supervisor), ocultar controles de alta/modificación en la vista
    if (cfgRol.solo_lectura) {
        const btnAgregar = document.getElementById('btnAgregar');
        const formSection = document.getElementById('formSection');
        if (btnAgregar) btnAgregar.classList.add('hidden');
        if (formSection) formSection.classList.add('hidden');
    }
}
