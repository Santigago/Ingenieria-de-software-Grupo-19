const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    crearTurnoPlanificado,
    obtenerTurnosPlanificados,
    registrarMarcajeAsistencia,
    obtenerHistorialAsistencia,
    validarInconsistenciasAsistencia,
    obtenerCumplimientoLaboral
} = require('../controllers/c_rrhhController');

router.use(verificarToken);

// CU 70: Registrar turno planificado
router.post('/turnos', requerirPermiso('rrhh', 'crear'), crearTurnoPlanificado);

// Consultar turnos planificados
router.get('/turnos', requerirPermiso('rrhh', 'ver'), obtenerTurnosPlanificados);

// CU 67: Registrar asistencia (Marcaje Entrada / Salida - Reloj Control)
router.post('/asistencia/marcar', requerirPermiso('rrhh', 'marcar'), registrarMarcajeAsistencia);

// CU 68: Consultar historial de asistencia con filtros
router.get('/asistencia', requerirPermiso('rrhh', 'ver'), obtenerHistorialAsistencia);

// CU 69: Validar asistencia y detección de inconsistencias
router.get('/asistencia/inconsistencias', requerirPermiso('rrhh', 'validar'), validarInconsistenciasAsistencia);

// CU 71: Controlando cumplimiento y KPIs laborales
router.get('/cumplimiento', requerirPermiso('rrhh', 'cumplimiento'), obtenerCumplimientoLaboral);

module.exports = router;

