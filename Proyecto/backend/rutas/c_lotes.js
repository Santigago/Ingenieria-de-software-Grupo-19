const express = require('express');
const router = express.Router();
const {
    obtenerResponsablesRecepcion,
    obtenerLotes,
    registrarLote,
    consultarVencimientosYAlertas,
    actualizarUmbralVencimiento
} = require('../controladores/c_loteController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/responsables', verificarToken, requerirPermiso('lotes', 'ver'), obtenerResponsablesRecepcion);
router.get('/vencimientos', verificarToken, requerirPermiso('lotes', 'ver'), consultarVencimientosYAlertas);
router.patch('/vencimientos/umbral', verificarToken, requerirPermiso('lotes', 'editar'), actualizarUmbralVencimiento);
router.get('/', verificarToken, requerirPermiso('lotes', 'ver'), obtenerLotes);
router.post('/', verificarToken, requerirPermiso('lotes', 'crear'), registrarLote);

module.exports = router;
