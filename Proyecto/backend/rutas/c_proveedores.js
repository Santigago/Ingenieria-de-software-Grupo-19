const express = require('express');
const router = express.Router();
const {
    crearProveedor,
    obtenerProveedores,
    actualizarProveedor,
    cambiarEstadoProveedor,
    eliminarProveedor
} = require('../controladores/c_proveedorController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/', verificarToken, requerirPermiso('proveedores', 'ver'), obtenerProveedores);
router.post('/', verificarToken, requerirPermiso('proveedores', 'crear'), crearProveedor);
router.put('/:id', verificarToken, requerirPermiso('proveedores', 'editar'), actualizarProveedor);
router.patch('/:id/estado', verificarToken, requerirPermiso('proveedores', 'inactivar'), cambiarEstadoProveedor);
router.delete('/:id', verificarToken, requerirPermiso('proveedores', 'inactivar'), eliminarProveedor);

module.exports = router;
