const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    cancelarPedido,
    cancelarItemPedido,
    consultarPedidoPorId
} = require('../controllers/c_pedidosController');

router.use(verificarToken);

// CU 24: Consultar pedido
router.get('/:id', requerirPermiso('pedidos', 'ver'), consultarPedidoPorId);

// CU 24: Cancelar pedido completo (CU orig. 55)
router.post('/:id/cancelar', requerirPermiso('pedidos', 'cancelar'), cancelarPedido);

// CU 24: Cancelar ítem individual (CU orig. 55)
router.post('/:id/items/:detalleId/cancelar', requerirPermiso('pedidos', 'cancelar'), cancelarItemPedido);

module.exports = router;

