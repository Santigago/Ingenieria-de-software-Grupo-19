const express = require('express');
const router = express.Router();
const {
    obtenerMetricasDashboard,
    generarReporteOperativo
} = require('../controladores/c_dashboardController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

// Según Documento 0 (Sección A.2 y UR 9.1–9.2 / CU 33), el Dashboard e informes ejecutivos son exclusivos para el rol Administrador
router.get('/resumen', verificarToken, requerirPermiso('dashboard', 'ver'), obtenerMetricasDashboard);
router.get('/reportes', verificarToken, requerirPermiso('dashboard', 'ver'), generarReporteOperativo);

module.exports = router;
