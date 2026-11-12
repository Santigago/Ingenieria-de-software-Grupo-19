const express = require('express');
const router = express.Router();
const { obtenerUnidades, crearUnidad, cambiarEstadoUnidad } = require('../controllers/c_unidadMedidaController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/', verificarToken, requerirPermiso('unidades', 'ver'), obtenerUnidades);
router.post('/', verificarToken, requerirPermiso('unidades', 'crear'), crearUnidad);
router.patch('/:id/estado', verificarToken, requerirPermiso('unidades', 'inactivar'), cambiarEstadoUnidad);

module.exports = router;
