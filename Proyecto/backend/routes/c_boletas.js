const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    obtenerBoletas,
    obtenerBoletaPorFolio,
    reimprimirBoleta
} = require('../controllers/c_boletaController');

// CU 27 (Subflujo CU 80): Listar boletas electrónicas emitidas
router.get('/', verificarToken, requerirPermiso('boletas', 'ver'), obtenerBoletas);

// CU 27 (Subflujo CU 80): Ver detalle de boleta por folio único
router.get('/:folio', verificarToken, requerirPermiso('boletas', 'ver'), obtenerBoletaPorFolio);

// CU 27 (Subflujo CU 87): Reimprimir boleta electrónica sin alterar folio ni contabilidad
router.post('/:folio/reimprimir', verificarToken, requerirPermiso('boletas', 'reimprimir'), reimprimirBoleta);

module.exports = router;

