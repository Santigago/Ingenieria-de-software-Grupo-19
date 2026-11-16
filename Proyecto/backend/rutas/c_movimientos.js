const express = require('express');
const router = express.Router();
const {
    obtenerMotivosCatalogo,
    crearMotivoCatalogo,
    actualizarMotivoCatalogo,
    cambiarEstadoMotivoCatalogo,
    eliminarMotivoCatalogo,
    validarDisponibilidadStock,
    registrarIngreso,
    registrarSalida,
    registrarMerma,
    obtenerMermas,
    obtenerMovimientos,
    obtenerConteosFisicos,
    registrarConteoFisico,
    obtenerAjustesInventario,
    registrarAjusteInventario,
    obtenerTransferenciasInternas,
    registrarTransferenciaInterna
} = require('../controladores/c_movimientoController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

// CU 18: Administrar catálogos operativos de motivos (Subflujos CU 45, 46, 47, 54)
router.get('/motivos', verificarToken, requerirPermiso('movimientos', 'ver'), obtenerMotivosCatalogo);
router.post('/motivos', verificarToken, requerirPermiso('movimientos', 'crear'), crearMotivoCatalogo);
router.put('/motivos/:id', verificarToken, requerirPermiso('movimientos', 'crear'), actualizarMotivoCatalogo);
router.patch('/motivos/:id/estado', verificarToken, requerirPermiso('movimientos', 'crear'), cambiarEstadoMotivoCatalogo);
router.delete('/motivos/:id', verificarToken, requerirPermiso('movimientos', 'crear'), eliminarMotivoCatalogo);

// CU 12: Ajustar inventario mediante conteo físico y transferencias internas (Subflujos CU 14, 15, 16, 43, 53)
router.get('/conteos', verificarToken, requerirPermiso('movimientos', 'ver'), obtenerConteosFisicos);
router.post('/conteos', verificarToken, requerirPermiso('movimientos', 'crear'), registrarConteoFisico);
router.get('/ajustes', verificarToken, requerirPermiso('movimientos', 'ver'), obtenerAjustesInventario);
router.post('/ajustes', verificarToken, requerirPermiso('movimientos', 'crear'), registrarAjusteInventario);
router.get('/transferencias', verificarToken, requerirPermiso('movimientos', 'ver'), obtenerTransferenciasInternas);
router.post('/transferencias', verificarToken, requerirPermiso('movimientos', 'crear'), registrarTransferenciaInterna);

router.get('/disponibilidad', verificarToken, requerirPermiso('movimientos', 'ver'), validarDisponibilidadStock);
router.get('/mermas', verificarToken, requerirPermiso('mermas', 'ver'), obtenerMermas);
router.post('/mermas', verificarToken, requerirPermiso('mermas', 'crear'), registrarMerma);
router.get('/', verificarToken, requerirPermiso('movimientos', 'ver'), obtenerMovimientos);
router.post('/ingresos', verificarToken, requerirPermiso('movimientos', 'crear'), registrarIngreso);
router.post('/salidas', verificarToken, requerirPermiso('movimientos', 'crear'), registrarSalida);

module.exports = router;
