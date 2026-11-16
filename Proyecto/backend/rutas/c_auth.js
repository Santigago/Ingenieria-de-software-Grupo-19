const router = require('express').Router();
const { login, logout, obtenerCajerosPos, loginPos, obtenerSesionPermisos } = require('../controladores/c_authController');
const { verificarToken } = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/logout', logout);
router.get('/pos-cajeros', obtenerCajerosPos);
router.post('/pos-login', loginPos);
router.get('/permisos', verificarToken, obtenerSesionPermisos);

module.exports = router;
