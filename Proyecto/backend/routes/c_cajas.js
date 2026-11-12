const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/c_cajaController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

// CU 25 (Subflujo CU 78): Consultar estado actual de caja y abrir caja en puesto de venta
router.get('/estado-actual', verificarToken, requerirPermiso('cajas', 'ver'), obtenerEstadoCajaActual);
router.post('/abrir', verificarToken, requerirPermiso('cajas', 'abrir'), abrirCaja);

// CU 21 (Subflujos CU 28, 29, 30, 64) y CU 23 (Subflujos CU 32, 63): Cálculo de total y registro de venta con pagos simples o combinados
router.post('/calcular-total', verificarToken, requerirPermiso('cajas', 'ver'), calcularTotalVentaPos);
router.post('/ventas-turno', verificarToken, requerirPermiso('cajas', 'abrir'), registrarVentaTurnoCaja);

// CU 34 (Subflujos CU 83, 84, 89): Monitorear cajas abiertas, consultar historial de ventas y arqueos de caja
router.get('/abiertas', verificarToken, requerirPermiso('cajas', 'ver'), obtenerMonitoreoCajasAbiertas);
router.get('/ventas', verificarToken, requerirPermiso('cajas', 'ver'), obtenerHistorialVentas);
router.get('/ventas/:id', verificarToken, requerirPermiso('cajas', 'ver'), obtenerDetalleVenta);
router.get('/arqueos', verificarToken, requerirPermiso('cajas', 'ver'), obtenerArqueosCaja);
router.get('/arqueos/:id', verificarToken, requerirPermiso('cajas', 'ver'), obtenerDetalleArqueoCaja);
router.get('/historial', verificarToken, requerirPermiso('cajas', 'ver'), obtenerHistorialCajas);

// CU 26 (Subflujo CU 79): Resumen pre-cierre y cierre de caja con arqueo
router.get('/mi-caja/resumen-cierre', verificarToken, requerirPermiso('cajas', 'ver'), obtenerResumenCierreCaja);
router.get('/:id/resumen-cierre', verificarToken, requerirPermiso('cajas', 'ver'), obtenerResumenCierreCaja);
router.post('/cerrar', verificarToken, requerirPermiso('cajas', 'cerrar'), cerrarCajaConArqueo);
router.post('/:id/cerrar', verificarToken, requerirPermiso('cajas', 'cerrar'), cerrarCajaConArqueo);

module.exports = router;

