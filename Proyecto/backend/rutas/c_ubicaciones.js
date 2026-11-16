const express = require('express');
const router = express.Router();
const { crearUbicacion, obtenerUbicaciones, inactivarUbicacion } = require('../controladores/c_ubicacionController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/', verificarToken, requerirPermiso('ubicaciones', 'ver'), obtenerUbicaciones);
router.post('/', verificarToken, requerirPermiso('ubicaciones', 'crear'), crearUbicacion);
router.put('/inactivar/:id', verificarToken, requerirPermiso('ubicaciones', 'inactivar'), inactivarUbicacion);

module.exports = router;
