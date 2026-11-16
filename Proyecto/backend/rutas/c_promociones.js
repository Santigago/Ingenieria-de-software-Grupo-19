const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    obtenerPromociones,
    obtenerPromocionPorId,
    crearPromocion,
    actualizarPromocion,
    cambiarEstadoPromocion,
    validarYAplicarPromocion
} = require('../controladores/c_promocionController');

// CU 22 (Subflujo CU 31): Listar promociones y descuentos comerciales
router.get('/', verificarToken, requerirPermiso('promociones', 'ver'), obtenerPromociones);

// CU 22 (Subflujos CU 65 y CU 66): Validar código de promoción y evaluar no-acumulabilidad en el POS
router.post('/validar-codigo', verificarToken, requerirPermiso('promociones', 'ver'), validarYAplicarPromocion);

// CU 22 (Subflujo CU 31): Ver detalle de promoción por ID
router.get('/:id', verificarToken, requerirPermiso('promociones', 'ver'), obtenerPromocionPorId);

// CU 22 (Subflujo CU 31): Crear nueva promoción
router.post('/', verificarToken, requerirPermiso('promociones', 'crear'), crearPromocion);

// CU 22 (Subflujo CU 31): Actualizar datos de promoción
router.put('/:id', verificarToken, requerirPermiso('promociones', 'editar'), actualizarPromocion);

// CU 22 (Subflujo CU 31): Activar / Inactivar promoción
router.patch('/:id/estado', verificarToken, requerirPermiso('promociones', 'inactivar'), cambiarEstadoPromocion);

module.exports = router;

