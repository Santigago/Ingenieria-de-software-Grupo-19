const express = require('express');
const router = express.Router();
const {
    obtenerPuestosVenta,
    crearPuestoVenta,
    actualizarPuestoVenta,
    cambiarEstadoPuestoVenta,
    eliminarPuestoVenta
} = require('../controladores/c_cajaController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

// CU 32 (Subflujo CU 82): Administrar puestos de venta de comida y de merch
router.get('/', verificarToken, requerirPermiso('puestos', 'ver'), obtenerPuestosVenta);
router.post('/', verificarToken, requerirPermiso('puestos', 'crear'), crearPuestoVenta);
router.put('/:id', verificarToken, requerirPermiso('puestos', 'editar'), actualizarPuestoVenta);
router.patch('/:id/estado', verificarToken, requerirPermiso('puestos', 'inactivar'), cambiarEstadoPuestoVenta);
router.delete('/:id', verificarToken, requerirPermiso('puestos', 'inactivar'), eliminarPuestoVenta);

module.exports = router;

