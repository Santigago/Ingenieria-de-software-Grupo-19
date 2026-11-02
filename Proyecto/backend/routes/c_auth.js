const router = require('express').Router();
const { login, logout, obtenerCajerosPos, loginPos } = require('../controllers/c_authController');

router.post('/login', login);
router.post('/logout', logout);
router.get('/pos-cajeros', obtenerCajerosPos);
router.post('/pos-login', loginPos);

module.exports = router;