const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    obtenerLogsSincronizacionSAP,
    obtenerEstadoIntegracionSAP,
    reintentarSincronizacionVentaSAP,
    sincronizarVentasPendientesSAP
} = require('../controladores/c_sapController');

// CU 31 (Subflujo CU 81): Listar historial de sincronizaciones con SAP B1
router.get('/logs', verificarToken, requerirPermiso('sap', 'ver'), obtenerLogsSincronizacionSAP);

// CU 31 (Subflujo CU 81): Dashboard / KPIs de estado de integración SAP
router.get('/estado', verificarToken, requerirPermiso('sap', 'ver'), obtenerEstadoIntegracionSAP);

// CU 31 (Subflujo CU 81): Sincronizar o reintentar venta individual
router.post('/sincronizar-venta/:venta_id', verificarToken, requerirPermiso('sap', 'sincronizar'), reintentarSincronizacionVentaSAP);

// CU 31 (Subflujo CU 81): Sincronización masiva de ventas pendientes hacia SAP B1
router.post('/sincronizar-pendientes', verificarToken, requerirPermiso('sap', 'sincronizar'), sincronizarVentasPendientesSAP);

module.exports = router;

