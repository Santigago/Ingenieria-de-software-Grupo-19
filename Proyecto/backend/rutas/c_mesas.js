const express = require('express');
const router = express.Router();
const { obtenerMesas, actualizarEstadoMesa } = require('../controladores/c_mesaController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/', verificarToken, requerirPermiso('mesas', 'ver'), obtenerMesas);
router.patch('/:id/estado', verificarToken, requerirPermiso('mesas', 'editar'), actualizarEstadoMesa);

module.exports = router;
