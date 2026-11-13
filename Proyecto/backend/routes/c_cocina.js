const express = require('express');
const router = express.Router();
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');
const {
    enrutarPedidoExpress,
    obtenerComandasCocina,
    cambiarEstadoPedido,
    cambiarEstadoItemComanda,
    registrarIncidenciaPedido,
    obtenerIncidenciasPedido,
    obtenerMetricasCocina
} = require('../controllers/c_cocinaController');

// Todas las rutas requieren sesión autenticada
router.use(verificarToken);

// CU 28: Enrutar pedido y generar comanda digital
router.post('/pedidos/enrutar', requerirPermiso('cocina', 'ver'), enrutarPedidoExpress);

// CU 29: Consultar pedidos/comandas en cocina (KDS)
router.get('/pedidos', requerirPermiso('cocina', 'ver'), obtenerComandasCocina);

// CU 29: Actualizar estado de comanda (en_preparacion, listo, entregado, cancelado)
router.patch('/pedidos/:id/estado', requerirPermiso('cocina', 'ver'), cambiarEstadoPedido);

// Actualizar ítem individual de comanda
router.patch('/pedidos/:id/items/:detalleId/estado', requerirPermiso('cocina', 'ver'), cambiarEstadoItemComanda);

// CU 30: Registrar incidencia operativa
router.post('/pedidos/:id/incidencias', requerirPermiso('cocina', 'ver'), registrarIncidenciaPedido);

// Consultar incidencias de un pedido
router.get('/pedidos/:id/incidencias', requerirPermiso('cocina', 'ver'), obtenerIncidenciasPedido);

// CU 30: Métricas operativas de tiempos y SLA
router.get('/metricas', requerirPermiso('cocina', 'ver'), obtenerMetricasCocina);

module.exports = router;

