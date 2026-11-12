const express = require('express');
const router = express.Router();
const {
    obtenerCategorias,
    crearCategoria,
    actualizarCategoria,
    cambiarEstadoCategoria,
    obtenerProductos,
    crearProducto,
    actualizarProducto,
    definirControlStockProducto,
    cambiarEstadoProducto,
    eliminarProductoFisico,
    obtenerAuditoriaProducto,
    obtenerProveedoresProducto,
    asociarProveedoresProducto,
    desasociarProveedorProducto,
    recalcularStockDisponible,
    consultarExistenciasInventario,
    consultarStockTiempoReal,
    configurarParametrosStock,
    consultarAlertasStockCritico,
    obtenerRecetasCatalogo,
    obtenerRecetaProducto,
    guardarRecetaProducto,
    ejecutarDescuentoRecetaEndpoint
} = require('../controllers/c_productoController');
const { verificarToken, requerirPermiso } = require('../middleware/authMiddleware');

// Subflujo CU 34: Categorías de productos
router.get('/categorias', verificarToken, requerirPermiso('productos', 'ver'), obtenerCategorias);
router.post('/categorias', verificarToken, requerirPermiso('productos', 'crear'), crearCategoria);
router.put('/categorias/:id', verificarToken, requerirPermiso('productos', 'editar'), actualizarCategoria);
router.patch('/categorias/:id/estado', verificarToken, requerirPermiso('productos', 'inactivar'), cambiarEstadoCategoria);

// CU 14: Consultar y filtrar existencias de inventario y stock en tiempo real (Subflujos CU 19, 20, 21, 41, 51)
router.get('/existencias', verificarToken, requerirPermiso('productos', 'ver'), consultarExistenciasInventario);
router.post('/recalcular-stock', verificarToken, requerirPermiso('productos', 'ver'), recalcularStockDisponible);

// CU 16: Configurar límites y alertas de stock crítico (Subflujos CU 22, 23, 52)
router.get('/alertas-stock', verificarToken, requerirPermiso('productos', 'ver'), consultarAlertasStockCritico);
router.patch('/:id/parametros-stock', verificarToken, requerirPermiso('productos', 'editar'), configurarParametrosStock);

// CU 19: Definir recetas y descontar automáticamente sus insumos (Subflujos CU 26, 27)
router.get('/recetas', verificarToken, requerirPermiso('productos', 'ver'), obtenerRecetasCatalogo);
router.get('/:id/receta', verificarToken, requerirPermiso('productos', 'ver'), obtenerRecetaProducto);
router.post('/:id/receta', verificarToken, requerirPermiso('productos', 'editar'), guardarRecetaProducto);
router.put('/:id/receta', verificarToken, requerirPermiso('productos', 'editar'), guardarRecetaProducto);
router.post('/:id/descontar-receta', verificarToken, requerirPermiso('productos', 'ver'), ejecutarDescuentoRecetaEndpoint);

router.get('/:id/tiempo-real', verificarToken, requerirPermiso('productos', 'ver'), consultarStockTiempoReal);

// CU 8: Catálogo de productos (Subflujos CU 7, 35, 36, 37)
router.get('/', verificarToken, requerirPermiso('productos', 'ver'), obtenerProductos);
router.post('/', verificarToken, requerirPermiso('productos', 'crear'), crearProducto);
router.put('/:id', verificarToken, requerirPermiso('productos', 'editar'), actualizarProducto);
router.patch('/:id/control-stock', verificarToken, requerirPermiso('productos', 'editar'), definirControlStockProducto);
router.patch('/:id/estado', verificarToken, requerirPermiso('productos', 'inactivar'), cambiarEstadoProducto);
router.delete('/:id', verificarToken, requerirPermiso('productos', 'inactivar'), eliminarProductoFisico);
router.get('/:id/auditoria', verificarToken, requerirPermiso('productos', 'ver'), obtenerAuditoriaProducto);

// CU 9: Asociar productos con proveedores (Subflujo CU 8)
router.get('/:id/proveedores', verificarToken, requerirPermiso('productos', 'ver'), obtenerProveedoresProducto);
router.post('/:id/proveedores', verificarToken, requerirPermiso('productos', 'editar'), asociarProveedoresProducto);
router.delete('/:id/proveedores/:proveedorId', verificarToken, requerirPermiso('productos', 'editar'), desasociarProveedorProducto);

module.exports = router;
