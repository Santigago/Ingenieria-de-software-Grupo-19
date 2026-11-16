const router = require('express').Router();
const {
    crearUsuario,
    obtenerUsuarios,
    obtenerRoles,
    actualizarEstadoUsuario,
    asignarPinTrabajador,
    desbloquearUsuario,
    obtenerBitacoraAuditoria
} = require('../controladores/c_userController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

router.get('/roles', verificarToken, requerirPermiso('usuarios', 'ver'), obtenerRoles);
router.get('/auditoria', verificarToken, requerirPermiso('usuarios', 'ver'), obtenerBitacoraAuditoria);
router.get('/', verificarToken, requerirPermiso('usuarios', 'ver'), obtenerUsuarios);
router.post('/', verificarToken, requerirPermiso('usuarios', 'crear'), crearUsuario);
router.patch('/:id/estado', verificarToken, requerirPermiso('usuarios', 'inactivar'), actualizarEstadoUsuario);
router.patch('/:id/pin', verificarToken, requerirPermiso('usuarios', 'asignar_pin'), asignarPinTrabajador);
router.patch('/:id/desbloquear', verificarToken, requerirPermiso('usuarios', 'desbloquear'), desbloquearUsuario);

module.exports = router;
