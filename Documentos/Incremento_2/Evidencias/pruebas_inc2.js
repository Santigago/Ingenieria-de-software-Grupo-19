// Ejecuta las pruebas funcionales del Incremento 2 (punto de venta, caja, boletas, cocina, puestos y SAP simulado)
// sobre la app local y guarda capturas como evidencia. Uso: node pruebas_inc2.js <url_base> <carpeta_salida>
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8091';
const SALIDA = process.argv[3] || path.join(__dirname, 'evidencias_inc2');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Credenciales de prueba documentadas en el README del proyecto
const ADMIN = { correo: 'carlos@kidzania.cl', clave: '1234' };
const PINES = { 'Sofía': '1234', 'Matías': '5678' }; // PIN de prueba sembrados por initDb.js
const resultados = [];
fs.mkdirSync(SALIDA, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--window-size=1400,900'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 800 });
    page.on('dialog', d => d.accept());

    const shot = async (nombre, completa = false) => { await espera(300); await page.screenshot({ path: path.join(SALIDA, nombre + '.png'), fullPage: completa }); };
    const ir = async pagina => { await page.goto(`${BASE}/${pagina}`, { waitUntil: 'networkidle0' }); await espera(700); };
    const salir = async () => { if (!page.url().startsWith('http')) await ir('v_login.html'); await page.evaluate(() => localStorage.clear()); };
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    const texto = sel => ev(s => { const e = document.querySelector(s); return e ? e.innerText.trim().replace(/\s+/g, ' ') : ''; }, sel);
    const registrar = async (id, descripcion, esperado, fn) => {
        try { const obtenido = await fn(); resultados.push({ id, descripcion, esperado, obtenido, ok: true }); console.log(`${id} OK: ${obtenido}`); }
        catch (e) { e.message += ' [URL ' + page.url().split('/').pop() + ']'; resultados.push({ id, descripcion, esperado, obtenido: 'ERROR: ' + e.message, ok: false }); console.log(`${id} ERROR: ${e.message}`); await shot(id + '_error'); }
    };
    const loginPin = async nombre => {
        await salir(); await ir('v_pos_login.html');
        await ev(n => [...document.querySelectorAll('[onclick^="selectCajero"]')].find(e => e.innerText.includes(n)).click(), nombre);
        await espera(400);
        for (const d of PINES[nombre]) { await ev(x => pressKey(x), d); await espera(150); }
        await espera(300);
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
            ev(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Ingresar'); if (b) b.click(); })]);
        await espera(1200);
    };
    const loginOficina = async () => {
        await salir(); await ir('v_login.html');
        await ev(a => { document.getElementById('email').value = a.correo; document.getElementById('password').value = a.clave; }, ADMIN);
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.click('#btnSubmit')]);
        await espera(1000);
        if (!page.url().includes('v_dashboard')) throw new Error('Login de oficina no llegó al dashboard: ' + page.url());
    };
    const pagar = async (metodo, extra = {}) => {
        await ev((m, x) => {
            const s = document.getElementById('ventaMetodoPago'); s.value = m; s.dispatchEvent(new Event('change'));
            if (x.recibido) { const i = document.getElementById('ventaMontoRecibido'); i.value = x.recibido; i.dispatchEvent(new Event('input')); }
            if (x.autorizacion) { const i = document.getElementById('ventaCodigoAutorizacion'); i.value = x.autorizacion; i.dispatchEvent(new Event('input')); }
        }, metodo, extra);
        await espera(300);
    };
    const confirmarVenta = async () => { await ev(() => document.getElementById('formVentaTurno').requestSubmit()); await espera(2200); };
    const folioBoleta = () => texto('#boletaFolioTitulo');
    const cerrarBoleta = async () => { await ev(() => { if (typeof cerrarModalBoletaPos === 'function') cerrarModalBoletaPos(); }); await espera(500); };
    const agregar = async (...ids) => { for (const id of ids) { await ev(i => agregarProductoAlCarrito(i), id); await espera(200); } };

    await registrar('P01', 'Abrir caja en un puesto con fondo inicial', 'La caja queda abierta en el puesto con su fondo inicial', async () => {
        await loginPin('Sofía'); await shot('P01a_apertura_caja');
        await ev(() => { seleccionarPuestoParaAbrir(1); const f = document.getElementById('inputFondoInicialApertura'); f.value = 50000; f.dispatchEvent(new Event('input')); });
        await espera(400); await shot('P01b_puesto_y_fondo');
        await ev(() => document.getElementById('formAbrirCaja').requestSubmit()); await espera(2500); await shot('P01c_caja_abierta');
        return (await texto('#kpiCajaPuestoNombre')) + ' | fondo ' + (await texto('#kpiCajaFondoInicial'));
    });
    await registrar('P02', 'Registrar una venta con productos del catálogo del puesto', 'Calcula neto, IVA y total de la venta', async () => {
        await agregar(1, 1, 2); await shot('P02_carrito_venta');
        return `Neto ${await texto('#carritoNetoTxt')} | IVA ${await texto('#carritoIvaTxt')} | Total ${await texto('#carritoSubtotalTxt')}`;
    });
    await registrar('P03', 'Cobrar en efectivo con vuelto y emitir boleta', 'Registra la venta, calcula el vuelto y emite la boleta con folio', async () => {
        await pagar('efectivo', { recibido: 10000 }); await shot('P03a_pago_efectivo', true); await confirmarVenta(); await shot('P03b_boleta_emitida');
        return 'Boleta: ' + await folioBoleta();
    });
    await registrar('P04', 'Reimprimir boleta conservando el folio', 'La copia mantiene el folio original', async () => {
        await ev(() => document.getElementById('btnReimprimirBoletaPos').click()); await espera(1800); await shot('P04_reimpresion_boleta');
        const m = await texto('#mensajePos'); await cerrarBoleta(); return (await folioBoleta()) + ' ' + m;
    });
    await registrar('P05', 'Cobrar con tarjeta de débito', 'Registra la venta con código de autorización', async () => {
        await agregar(5); await pagar('tarjeta_debito', { autorizacion: '482913' }); await shot('P05a_pago_debito', true);
        await confirmarVenta(); await shot('P05b_boleta_debito'); const f = await folioBoleta(); await cerrarBoleta(); return 'Boleta: ' + f;
    });
    await registrar('P06', 'Registrar un pago combinado', 'La suma de los medios cubre el total y se emite la boleta', async () => {
        await agregar(3, 2); await ev(() => cambiarModoPagoPos('combinado')); await espera(600);
        await ev(() => document.querySelectorAll('#listaTramosPagoCombinado input').forEach(i => { if (/autoriz/i.test(i.placeholder || '') && !i.value) { i.value = '771204'; i.dispatchEvent(new Event('input')); } }));
        await espera(300); await shot('P06a_pago_combinado', true); await confirmarVenta(); await shot('P06b_boleta_combinada');
        const f = await folioBoleta(); await cerrarBoleta(); await ev(() => cambiarModoPagoPos('unico')); return 'Boleta: ' + f;
    });
    await registrar('P07', 'Aplicar una promoción con código', 'Aplica el descuento y lo refleja en el total', async () => {
        await agregar(4, 4, 4); await ev(() => { const i = document.getElementById('inputCodigoPromocion'); i.value = 'PROMO-KIDZ10'; aplicarCodigoPromocionPos(); });
        await espera(1500); await shot('P07a_promocion_aplicada', true); const m = await texto('#mensajePromoPos');
        await pagar('efectivo', { recibido: 5000 }); await confirmarVenta(); await shot('P07b_boleta_con_descuento'); await cerrarBoleta(); return m;
    });
    await registrar('P08', 'Rechazar un código de promoción inexistente', 'Informa que el código no es válido', async () => {
        await agregar(2); await ev(() => { const i = document.getElementById('inputCodigoPromocion'); i.value = 'PROMO-FALSA'; aplicarCodigoPromocionPos(); });
        await espera(1500); await shot('P08_promocion_invalida', true); const m = await texto('#mensajePromoPos'); await ev(() => vaciarCarritoPos()); return m;
    });
    await registrar('P09', 'Comandas digitales en la pantalla de cocina', 'Los productos de preparación de las ventas llegan a cocina', async () => {
        await loginPin('Matías'); if (!page.url().includes('v_cocina')) await ir('v_cocina.html'); await espera(1500); await shot('P09_comandas_cocina');
        return `Pendientes: ${await texto('#kpiPendientes')} | URL ${page.url().split('/').pop()}`;
    });
    const pedidos = () => ev(async () => { const d = await api(`${API_URL}/api/cocina/pedidos`, { headers: authHeaders }); return (d.data || d).map(p => ({ id: p.pedido_id, num: p.numero_pedido || p.pedido_numero || p.pedido_id, estado: p.estado_pedido })); });
    await registrar('P10', 'Cambiar el estado de un pedido en cocina', 'Pasa por en preparación, listo y entregado', async () => {
        const lista = await pedidos(); const p = lista.find(x => x.estado === 'pendiente'); if (!p) throw new Error('No hay pedidos pendientes');
        await ev(id => cambiarEstadoPedido(id, 'en_preparacion'), p.id); await espera(1500); await shot('P10a_en_preparacion');
        await ev(id => cambiarEstadoPedido(id, 'listo'), p.id); await espera(1500); await shot('P10b_listo_para_retiro');
        await ev(() => document.getElementById('btnFiltroListos').click()); await espera(1200); await shot('P10d_pantalla_retiro'); await ev(() => document.getElementById('btnFiltroActivos').click()); await espera(800);
        await ev(id => cambiarEstadoPedido(id, 'entregado'), p.id); await espera(1500); await shot('P10c_entregado');
        return `Pedido ${p.num}: pendiente → en preparación → listo → entregado`;
    });
    await registrar('P11', 'Registrar una incidencia operativa', 'La incidencia queda asociada al pedido', async () => {
        const p = (await pedidos()).find(x => ['pendiente', 'en_preparacion'].includes(x.estado)); if (!p) throw new Error('No hay pedidos activos');
        await ev(x => abrirModalIncidencia(x.id, x.num), p); await espera(500);
        await ev(() => { const s = document.getElementById('incidenciaTipo'); if (s.tagName === 'SELECT') s.selectedIndex = Math.min(1, s.options.length - 1); else s.value = 'demora';
            document.getElementById('incidenciaDescripcion').value = 'Demora por alta afluencia en hora punta';
            document.getElementById('incidenciaRetrasoMin').value = 5; document.getElementById('incidenciaAccionCorrectiva').value = 'Se reforzó la línea de preparación'; });
        const antes = await texto('#kpiIncidencias');
        await shot('P11a_form_incidencia'); await ev(() => [...document.querySelectorAll('#modalIncidencia button')].find(b => /Guardar Incidencia/i.test(b.innerText)).click()); await espera(2000); await shot('P11b_incidencia_registrada');
        return `Pedido ${p.num}: incidencias del turno ${antes} -> ${await texto('#kpiIncidencias')} ${await texto('#mensaje')}`;
    });
    await registrar('P12', 'Cancelar un pedido con motivo', 'El pedido queda cancelado registrando el motivo', async () => {
        const p = (await pedidos()).find(x => ['pendiente', 'en_preparacion'].includes(x.estado)); if (!p) throw new Error('No hay pedidos activos');
        await ev(x => abrirModalCancelarPedido(x.id, x.num), p); await espera(500);
        await ev(() => { document.getElementById('cancelarMotivo').value = 'El visitante desistió de la compra'; });
        await shot('P12a_form_cancelacion'); await ev(() => document.getElementById('formCancelarPedido').requestSubmit()); await espera(1500); await shot('P12b_pedido_cancelado');
        return `Pedido ${p.num}: ${await texto('#mensaje')}`;
    });
    await registrar('P13', 'Gestionar puestos e impedir inactivar uno con caja abierta', 'Lista los 7 puestos y rechaza la inactivación', async () => {
        await loginOficina(); await ir('v_salon.html'); await ev(() => cambiarVistaTab('puestos')); await espera(1200); await shot('P13a_puestos_venta');
        await ev(() => alternarEstadoPuesto(1, 'inactivo')); await espera(1500); await shot('P13b_inactivacion_rechazada');
        return await texto('#mensaje');
    });
    await registrar('P14', 'Monitorear cajas abiertas y consultar el historial de ventas', 'Muestra la caja abierta y las ventas con su boleta', async () => {
        await ev(() => cambiarVistaTab('ventas')); await espera(1500); await shot('P14a_historial_ventas', true);
        return `Cajas abiertas: ${await texto('#kpiCajasAbiertas')} | Ventas: ${await texto('#kpiVentasTotalCant')} por ${await texto('#kpiVentasTotalMonto')}`;
    });
    await registrar('P15', 'Sincronizar una venta con SAP Business One (simulado)', 'Registra el estado de sincronización de la venta', async () => {
        const id = await ev(async () => { const d = await api(`${API_URL}/api/cajas/ventas`, { headers: authHeaders }); const l = d.data || d.ventas || d; return (Array.isArray(l) ? l : [])[0]?.venta_id; });
        if (!id) throw new Error('Sin ventas');
        await ev(v => abrirModalDetalleVenta(v), id); await espera(1200); await shot('P15a_detalle_venta_sap');
        await ev(() => reintentarSapSalon()); await espera(2000); await shot('P15b_sincronizacion_sap');
        return `Venta ${id}: ${await texto('#modalVentaContenido')}`.slice(0, 220);
    });
    await registrar('P18', 'Impedir aplicar dos promociones incompatibles', 'Rechaza la segunda promoción por no ser acumulable', async () => {
        await loginPin('Sofía'); await agregar(6, 6);
        await ev(() => { const i = document.getElementById('inputCodigoPromocion'); i.value = 'PROMO-KIDZ10'; aplicarCodigoPromocionPos(); }); await espera(1500);
        await ev(() => { const i = document.getElementById('inputCodigoPromocion'); i.value = 'PROMO-COMBO-DESC'; aplicarCodigoPromocionPos(); }); await espera(1500);
        await shot('P18_promociones_incompatibles', true); const m = await texto('#mensajePromoPos'); await ev(() => vaciarCarritoPos()); return m;
    });
    await registrar('P16', 'Cerrar caja con arqueo y detectar diferencia', 'Calcula el efectivo esperado y clasifica la diferencia', async () => {
        await loginPin('Sofía'); await ev(() => abrirModalCierreCaja()); await espera(1500); await shot('P16a_resumen_cierre');
        await ev(() => { const esp = Number(String(document.getElementById('arqEfectivoEsperado').innerText).replace(/[^0-9]/g, '')); const i = document.getElementById('inputEfectivoContadoArqueo'); i.value = esp - 1000; i.dispatchEvent(new Event('input')); document.getElementById('inputObservacionCierre').value = 'Faltante detectado en el conteo'; });
        await espera(500); await shot('P16b_diferencia_arqueo'); const dif = await texto('#lblEstadoArqueoVivo');
        await ev(() => document.getElementById('formCerrarCajaArqueo').requestSubmit()); await espera(2500); await shot('P16c_comprobante_cierre');
        return `Estado en vivo: ${dif} | ${await texto('#compMensajeResultado')}`;
    });
    await registrar('P17', 'Consultar la auditoría de arqueos de caja', 'Lista el cierre con su diferencia', async () => {
        await loginOficina(); await ir('v_salon.html'); await ev(() => cambiarVistaTab('ventas')); await espera(800);
        await ev(() => { if (typeof cargarArqueosDeCaja === 'function') cargarArqueosDeCaja(); }); await espera(1500);
        await ev(() => { const t = document.getElementById('tablaArqueosAuditoria'); if (t) t.scrollIntoView(); }); await espera(400);
        await page.screenshot({ path: path.join(SALIDA, 'P17_auditoria_arqueos.png') });
        return `Arqueos: ${await texto('#kpiArqueosTotal')} | faltantes: ${await texto('#kpiArqueosFaltantes')}`;
    });

    fs.writeFileSync(path.join(SALIDA, 'resultados.json'), JSON.stringify({ resultados }, null, 2));
    await browser.close();
})();
