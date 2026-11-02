const API_URL = '';
const token = localStorage.getItem('token');
const rolId = localStorage.getItem('rol');
const rolNombre = localStorage.getItem('rol_nombre') || '';
const usuarioNombre = localStorage.getItem('usuario') || 'Usuario';

const esAdmin = rolId === '1' || rolNombre === 'admin';
const esPaginaLogin = location.pathname.endsWith('/v_login.html') || location.pathname.endsWith('/v_pos_login.html');
const esPaginaPos = location.pathname.endsWith('/v_pos.html');

// Validación de sesión activa
if (!token && !esPaginaLogin) {
    window.location.href = 'v_login.html';
}

// Control estricto de roles: un cajero/operador nunca puede acceder a vistas de administración
if (token && !esAdmin && !esPaginaLogin && !esPaginaPos) {
    window.location.href = 'v_pos.html';
}

const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
const jsonHeaders = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

function cerrarSesion(redireccion = 'v_login.html') {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('rol_nombre');
    localStorage.removeItem('usuario');
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
    if (response.status === 401 || response.status === 403) {
        if (data?.message) alert(data.message);
        if (response.status === 401) cerrarSesion();
    }
    if (!response.ok) throw new Error(data?.message || 'Error en la operación');
    return data;
}

function navHtml(titulo) {
    return `
    <aside class="w-72 min-h-screen bg-gray-950 border-r border-gray-800 p-5 fixed left-0 top-0 hidden lg:block">
        <h1 class="text-2xl font-bold text-amber-500">KidZania</h1>
        <p class="text-xs text-gray-400 mt-1">Panel de Administración · Grupo 19</p>
        <div class="mt-5 p-3 bg-gray-900 rounded border border-gray-800 text-sm text-gray-300">
            <div class="font-semibold text-white">${usuarioNombre}</div>
            <div class="uppercase text-xs text-amber-400 mt-1">${rolNombre || 'Administrador'}</div>
        </div>
        <nav class="mt-6 space-y-1 text-sm">
            ${link('v_dashboard.html','Dashboard', titulo)}
            ${link('v_usuarios.html','Usuarios y roles', titulo)}
            ${link('v_unidades.html','Unidades de medida', titulo)}
            ${link('v_proveedores.html','Proveedores', titulo)}
            ${link('v_ubicaciones.html','Ubicaciones bodega', titulo)}
            ${link('v_productos.html','Productos', titulo)}
            ${link('v_lotes.html','Lotes', titulo)}
            ${link('v_ingresos.html','Ingresos de stock', titulo)}
            ${link('v_salidas.html','Salidas de stock', titulo)}
            ${link('v_movimientos.html','Historial movimientos', titulo)}
            ${link('v_salon.html','Salón / Mesas', titulo)}
            ${link('v_pos.html','Vista Cajero (POS)', titulo)}
        </nav>
        <div class="mt-8 pt-4 border-t border-gray-800 space-y-2">
            <a href="v_pos_login.html" class="block text-center text-xs text-amber-400 hover:text-amber-300 bg-gray-900 border border-gray-700 px-3 py-2 rounded">
                🖥️ Abrir Terminal POS
            </a>
            <button onclick="cerrarSesion('v_login.html')" class="w-full bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2 text-sm">Cerrar sesión</button>
        </div>
    </aside>
    <header class="lg:hidden bg-gray-950 border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-10">
        <span class="font-bold text-amber-500">KidZania Admin</span>
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
    if (main) {
        main.insertAdjacentHTML('afterbegin', `<div class="mb-6"><h2 class="text-3xl font-bold text-white">${titulo}</h2><p class="text-gray-400 mt-1">${subtitulo}</p></div>`);
    }
}
