const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

const TIPOS_NEGOCIO_VALIDOS = ['comida', 'merch'];
const TIPOS_CONTROL_STOCK_VALIDOS = ['lote', 'unidad'];

const registrarAuditoriaProducto = async ({
    productoId,
    usuarioId = null,
    accion,
    motivo = null,
    valoresAnteriores = null,
    valoresNuevos = null
}) => {
    try {
        await db.query(
            `INSERT INTO public.auditoria_producto
             (producto_id, usuario_id, accion, motivo, valores_anteriores, valores_nuevos)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                productoId,
                usuarioId,
                accion,
                motivo,
                valoresAnteriores ? JSON.stringify(valoresAnteriores) : null,
                valoresNuevos ? JSON.stringify(valoresNuevos) : null
            ]
        );
    } catch (error) {
        console.error('Error al registrar auditoría de producto:', error.message);
    }
};

// =========================================================================
// SUBFLUJO CU 34: Gestionando Categorías de Productos
// =========================================================================
const obtenerCategorias = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                c.categoria_id,
                c.categoria_nombre,
                c.categoria_descripcion,
                c.categoria_estado,
                c.creado_en,
                COUNT(DISTINCT p.producto_id)::int AS productos_asociados
            FROM public.categoria_producto c
            LEFT JOIN public.producto p
                ON p.categoria_id = c.categoria_id
                OR LOWER(p.producto_categoria) = LOWER(c.categoria_nombre)
            GROUP BY c.categoria_id
            ORDER BY c.categoria_nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener categorías de productos', error: error.message });
    }
};

const crearCategoria = async (req, res) => {
    const { nombre, descripcion = '', estado = 'activo' } = req.body;

    if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
    }
    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de categoría no válido' });
    }

    const nombreLimpio = String(nombre).trim();
    const descLimpia = descripcion ? String(descripcion).trim() : null;

    try {
        const { rows: dup } = await db.query(
            'SELECT categoria_id FROM public.categoria_producto WHERE LOWER(categoria_nombre) = LOWER($1)',
            [nombreLimpio]
        );
        if (dup.length > 0) {
            return res.status(400).json({ message: 'Ya existe una categoría con ese nombre' });
        }

        const { rows } = await db.query(
            `INSERT INTO public.categoria_producto (categoria_nombre, categoria_descripcion, categoria_estado)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [nombreLimpio, descLimpia, estado]
        );

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_categoria_producto',
            modulo: 'productos',
            accion: 'CREAR_CATEGORIA_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Categoría creada: ${rows[0].categoria_nombre} (ID ${rows[0].categoria_id})`
        });

        res.status(201).json({ message: 'Categoría de producto creada correctamente', categoria: rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Ya existe una categoría con ese nombre' });
        }
        res.status(500).json({ message: 'Error al crear categoría de producto', error: error.message });
    }
};

const actualizarCategoria = async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion = '', estado } = req.body;

    if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
    }
    if (estado !== undefined && !['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de categoría no válido' });
    }

    const nombreLimpio = String(nombre).trim();
    const descLimpia = descripcion ? String(descripcion).trim() : null;

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.categoria_producto WHERE categoria_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }
        const catActual = actualRows[0];

        const { rows: dup } = await db.query(
            'SELECT categoria_id FROM public.categoria_producto WHERE LOWER(categoria_nombre) = LOWER($1) AND categoria_id <> $2',
            [nombreLimpio, id]
        );
        if (dup.length > 0) {
            return res.status(400).json({ message: 'Ya existe otra categoría con ese nombre' });
        }

        const estadoFinal = estado || catActual.categoria_estado;

        const { rows } = await db.query(
            `UPDATE public.categoria_producto
             SET categoria_nombre = $1,
                 categoria_descripcion = $2,
                 categoria_estado = $3
             WHERE categoria_id = $4
             RETURNING *`,
            [nombreLimpio, descLimpia, estadoFinal, id]
        );

        await db.query(
            `UPDATE public.producto
             SET producto_categoria = $1
             WHERE categoria_id = $2 OR LOWER(producto_categoria) = LOWER($3)`,
            [nombreLimpio, id, catActual.categoria_nombre]
        );

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'actualizacion_categoria_producto',
            modulo: 'productos',
            accion: 'ACTUALIZAR_CATEGORIA_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Categoría ID ${id} actualizada (${catActual.categoria_nombre} -> ${nombreLimpio}, estado: ${estadoFinal})`
        });

        res.json({ message: 'Categoría actualizada correctamente', categoria: rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar categoría', error: error.message });
    }
};

const cambiarEstadoCategoria = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de categoría no válido' });
    }

    try {
        const { rows } = await db.query(
            `UPDATE public.categoria_producto
             SET categoria_estado = $1
             WHERE categoria_id = $2
             RETURNING *`,
            [estado, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_estado_categoria_producto',
            modulo: 'productos',
            accion: estado === 'inactivo' ? 'INACTIVAR_CATEGORIA_PRODUCTO' : 'ACTIVAR_CATEGORIA_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Categoría ${rows[0].categoria_nombre} (ID ${id}) marcada como ${estado}`
        });

        res.json({
            message: `Categoría ${estado === 'inactivo' ? 'inactivada' : 'activada'} correctamente`,
            categoria: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cambiar estado de categoría', error: error.message });
    }
};

// =========================================================================
// CU 8: Mantener catálogo de productos (Subflujos CU 7, 35, 36, 37)
// =========================================================================
const obtenerProductos = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_precio,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                COALESCE(p.producto_tipo_control_stock, 'lote') AS producto_tipo_control_stock,
                p.producto_estado,
                p.producto_stock_actual,
                COALESCE(p.producto_stock_minimo, 5) AS producto_stock_minimo,
                p.producto_stock_maximo,
                COALESCE(p.alerta_canal_sistema, true) AS alerta_canal_sistema,
                COALESCE(p.alerta_canal_correo, false) AS alerta_canal_correo,
                p.alerta_correo_destino,
                (p.producto_stock_actual <= COALESCE(p.producto_stock_minimo, 5)) AS stock_critico,
                p.producto_motivo_baja,
                p.producto_fecha_baja,
                p.producto_actualizado_en,
                p.producto_unidad_medida_id,
                u.unidad_medida_codigo,
                u.unidad_medida_nombre,
                u.unidad_medida_clasificacion,
                COUNT(DISTINCT pp.proveedor_id)::int AS proveedores_asociados,
                COALESCE(
                    ARRAY_AGG(DISTINCT pr.proveedor_nombre) FILTER (WHERE pr.proveedor_nombre IS NOT NULL),
                    ARRAY[]::text[]
                ) AS proveedores_nombres,
                COUNT(DISTINCT l.lote_id)::int AS lotes_registrados
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.producto_proveedor pp ON pp.producto_id = p.producto_id AND pp.estado = 'activo'
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = pp.proveedor_id AND pr.proveedor_estado = 'activo'
            LEFT JOIN public.lote l ON l.producto_id = p.producto_id
            GROUP BY p.producto_id, u.unidad_medida_id
            ORDER BY p.producto_nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener productos', error: error.message });
    }
};

const resolverCategoriaActiva = async ({ categoria_id, categoria }) => {
    if (categoria_id) {
        const { rows } = await db.query(
            "SELECT categoria_id, categoria_nombre FROM public.categoria_producto WHERE categoria_id = $1 AND categoria_estado = 'activo'",
            [categoria_id]
        );
        return rows[0] || null;
    }
    if (categoria && String(categoria).trim()) {
        const { rows } = await db.query(
            "SELECT categoria_id, categoria_nombre FROM public.categoria_producto WHERE LOWER(categoria_nombre) = LOWER($1) AND categoria_estado = 'activo'",
            [String(categoria).trim()]
        );
        return rows[0] || null;
    }
    return null;
};

const crearProducto = async (req, res) => {
    const {
        codigo,
        nombre,
        categoria,
        categoria_id,
        unidad_medida_id,
        tipo_negocio = 'comida',
        tipo_control_stock = 'lote',
        estado = 'activo',
        precio = 0
    } = req.body;

    if (!codigo || !nombre || (!categoria && !categoria_id) || !unidad_medida_id) {
        return res.status(400).json({ message: 'Debe indicar código, nombre, categoría y unidad de medida' });
    }
    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de producto no válido' });
    }
    if (!TIPOS_NEGOCIO_VALIDOS.includes(tipo_negocio)) {
        return res.status(400).json({ message: 'Tipo de negocio no válido (debe ser comida o merch)' });
    }
    if (!TIPOS_CONTROL_STOCK_VALIDOS.includes(tipo_control_stock)) {
        return res.status(400).json({ message: 'Tipo de control de stock no válido (debe ser lote o unidad)' });
    }
    if (Number(precio) < 0) {
        return res.status(400).json({ message: 'El precio no puede ser negativo' });
    }

    try {
        const catResuelta = await resolverCategoriaActiva({ categoria_id, categoria });
        if (!catResuelta) {
            return res.status(400).json({ message: 'La categoría seleccionada no existe o se encuentra inactiva' });
        }

        const { rows: unidadRows } = await db.query(
            "SELECT unidad_medida_id FROM public.unidad_medida_personalizada WHERE unidad_medida_id = $1 AND unidad_medida_estado = 'activo'",
            [unidad_medida_id]
        );
        if (unidadRows.length === 0) {
            return res.status(400).json({ message: 'La unidad de medida seleccionada no existe o está inactiva' });
        }

        const { rows } = await db.query(`
            INSERT INTO public.producto
            (
                producto_codigo,
                producto_nombre,
                producto_precio,
                producto_categoria,
                categoria_id,
                producto_tipo_negocio,
                producto_tipo_control_stock,
                producto_estado,
                producto_unidad_medida_id,
                producto_actualizado_en
            )
            VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8, $9, now())
            RETURNING *
        `, [
            String(codigo).trim(),
            String(nombre).trim(),
            Number(precio),
            catResuelta.categoria_nombre,
            catResuelta.categoria_id,
            tipo_negocio,
            tipo_control_stock,
            estado,
            Number(unidad_medida_id)
        ]);

        const nuevo = rows[0];

        await registrarAuditoriaProducto({
            productoId: nuevo.producto_id,
            usuarioId: req.user?.id || null,
            accion: 'CREAR_PRODUCTO',
            motivo: 'Registro inicial en catálogo',
            valoresAnteriores: null,
            valoresNuevos: {
                codigo: nuevo.producto_codigo,
                nombre: nuevo.producto_nombre,
                categoria: nuevo.producto_categoria,
                tipo_negocio: nuevo.producto_tipo_negocio,
                tipo_control_stock: nuevo.producto_tipo_control_stock,
                unidad_medida_id: nuevo.producto_unidad_medida_id,
                precio: nuevo.producto_precio,
                estado: nuevo.producto_estado
            }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_producto',
            modulo: 'productos',
            accion: 'CREAR_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Producto registrado: ${nuevo.producto_codigo} - ${nuevo.producto_nombre} (${nuevo.producto_tipo_negocio}, control por ${nuevo.producto_tipo_control_stock})`
        });

        res.status(201).json({ message: 'Producto registrado correctamente en el catálogo', producto: nuevo });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Ya existe un producto con ese código' });
        }
        res.status(500).json({ message: 'Error al crear producto', error: error.message });
    }
};

// Subflujo CU 35: Actualizando Productos con Auditoría
const actualizarProducto = async (req, res) => {
    const { id } = req.params;
    const {
        codigo,
        nombre,
        categoria,
        categoria_id,
        unidad_medida_id,
        tipo_negocio,
        tipo_control_stock,
        precio,
        motivo_cambio = 'Actualización de ficha de producto'
    } = req.body;

    if (!codigo || !nombre || (!categoria && !categoria_id) || !unidad_medida_id) {
        return res.status(400).json({ message: 'Debe indicar código, nombre, categoría y unidad de medida' });
    }
    if (tipo_negocio !== undefined && !TIPOS_NEGOCIO_VALIDOS.includes(tipo_negocio)) {
        return res.status(400).json({ message: 'Tipo de negocio no válido (debe ser comida o merch)' });
    }
    if (tipo_control_stock !== undefined && !TIPOS_CONTROL_STOCK_VALIDOS.includes(tipo_control_stock)) {
        return res.status(400).json({ message: 'Tipo de control de stock no válido (debe ser lote o unidad)' });
    }
    if (precio !== undefined && Number(precio) < 0) {
        return res.status(400).json({ message: 'El precio no puede ser negativo' });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const prodActual = actualRows[0];

        const { rows: dupCodigo } = await db.query(
            'SELECT producto_id FROM public.producto WHERE UPPER(producto_codigo) = UPPER($1) AND producto_id <> $2',
            [String(codigo).trim(), id]
        );
        if (dupCodigo.length > 0) {
            return res.status(400).json({ message: 'Ya existe otro producto con ese código' });
        }

        const catResuelta = await resolverCategoriaActiva({ categoria_id, categoria });
        if (!catResuelta) {
            return res.status(400).json({ message: 'La categoría seleccionada no existe o se encuentra inactiva' });
        }

        const { rows: unidadRows } = await db.query(
            "SELECT unidad_medida_id FROM public.unidad_medida_personalizada WHERE unidad_medida_id = $1 AND unidad_medida_estado = 'activo'",
            [unidad_medida_id]
        );
        if (unidadRows.length === 0) {
            return res.status(400).json({ message: 'La unidad de medida seleccionada no existe o está inactiva' });
        }

        const nuevoTipoNegocio = tipo_negocio || prodActual.producto_tipo_negocio || 'comida';
        const nuevoControlStock = tipo_control_stock || prodActual.producto_tipo_control_stock || 'lote';

        // Validación de coherencia de tipo de control de stock (Subflujo CU 37)
        if (prodActual.producto_tipo_control_stock === 'lote' && nuevoControlStock === 'unidad') {
            const { rows: lotesActivos } = await db.query(
                'SELECT COUNT(*)::int AS total FROM public.lote WHERE producto_id = $1 AND lote_cantidad_disponible > 0',
                [id]
            );
            if (lotesActivos[0]?.total > 0) {
                return res.status(400).json({
                    message: 'No se puede cambiar el control de stock a "unidad" mientras el producto tenga lotes activos con saldo disponible'
                });
            }
        }

        const valoresAnteriores = {
            codigo: prodActual.producto_codigo,
            nombre: prodActual.producto_nombre,
            categoria: prodActual.producto_categoria,
            categoria_id: prodActual.categoria_id,
            tipo_negocio: prodActual.producto_tipo_negocio,
            tipo_control_stock: prodActual.producto_tipo_control_stock,
            unidad_medida_id: prodActual.producto_unidad_medida_id,
            precio: Number(prodActual.producto_precio)
        };

        const { rows } = await db.query(`
            UPDATE public.producto
            SET producto_codigo = UPPER($1),
                producto_nombre = $2,
                producto_precio = $3,
                producto_categoria = $4,
                categoria_id = $5,
                producto_tipo_negocio = $6,
                producto_tipo_control_stock = $7,
                producto_unidad_medida_id = $8,
                producto_actualizado_en = now()
            WHERE producto_id = $9
            RETURNING *
        `, [
            String(codigo).trim(),
            String(nombre).trim(),
            precio !== undefined ? Number(precio) : Number(prodActual.producto_precio),
            catResuelta.categoria_nombre,
            catResuelta.categoria_id,
            nuevoTipoNegocio,
            nuevoControlStock,
            Number(unidad_medida_id),
            id
        ]);

        const actualizado = rows[0];
        const valoresNuevos = {
            codigo: actualizado.producto_codigo,
            nombre: actualizado.producto_nombre,
            categoria: actualizado.producto_categoria,
            categoria_id: actualizado.categoria_id,
            tipo_negocio: actualizado.producto_tipo_negocio,
            tipo_control_stock: actualizado.producto_tipo_control_stock,
            unidad_medida_id: actualizado.producto_unidad_medida_id,
            precio: Number(actualizado.producto_precio)
        };

        await registrarAuditoriaProducto({
            productoId: actualizado.producto_id,
            usuarioId: req.user?.id || null,
            accion: 'ACTUALIZAR_PRODUCTO',
            motivo: motivo_cambio,
            valoresAnteriores,
            valoresNuevos
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'actualizacion_producto',
            modulo: 'productos',
            accion: 'ACTUALIZAR_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Producto ID ${id} (${actualizado.producto_codigo}) actualizado. Motivo: ${motivo_cambio}`
        });

        res.json({ message: 'Producto actualizado correctamente con registro de auditoría', producto: actualizado });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Ya existe otro producto con ese código' });
        }
        res.status(500).json({ message: 'Error al actualizar producto', error: error.message });
    }
};

// Subflujo CU 37: Definiendo Tipo de control de stock
const definirControlStockProducto = async (req, res) => {
    const { id } = req.params;
    const { tipo_control_stock, motivo = 'Definición de tipo de control de stock' } = req.body;

    if (!TIPOS_CONTROL_STOCK_VALIDOS.includes(tipo_control_stock)) {
        return res.status(400).json({ message: 'Tipo de control de stock no válido (debe ser lote o unidad)' });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const prodActual = actualRows[0];

        if (prodActual.producto_tipo_control_stock === 'lote' && tipo_control_stock === 'unidad') {
            const { rows: lotesActivos } = await db.query(
                'SELECT COUNT(*)::int AS total FROM public.lote WHERE producto_id = $1 AND lote_cantidad_disponible > 0',
                [id]
            );
            if (lotesActivos[0]?.total > 0) {
                return res.status(400).json({
                    message: 'Incoherencia detectada: no se puede cambiar a control por unidad mientras existan lotes activos con stock disponible'
                });
            }
        }

        const { rows } = await db.query(
            `UPDATE public.producto
             SET producto_tipo_control_stock = $1,
                 producto_actualizado_en = now()
             WHERE producto_id = $2
             RETURNING *`,
            [tipo_control_stock, id]
        );

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: 'DEFINIR_CONTROL_STOCK',
            motivo,
            valoresAnteriores: { tipo_control_stock: prodActual.producto_tipo_control_stock },
            valoresNuevos: { tipo_control_stock }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_control_stock_producto',
            modulo: 'productos',
            accion: 'DEFINIR_CONTROL_STOCK_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Control de stock de producto ${prodActual.producto_codigo} cambiado de ${prodActual.producto_tipo_control_stock} a ${tipo_control_stock}`
        });

        res.json({
            message: `Tipo de control de stock actualizado a "${tipo_control_stock}"`,
            producto: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al definir tipo de control de stock', error: error.message });
    }
};

// Subflujo CU 36: Baja Lógica de Productos
const cambiarEstadoProducto = async (req, res) => {
    const { id } = req.params;
    const { estado, motivo } = req.body;

    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado no válido' });
    }

    if (estado === 'inactivo' && (!motivo || !String(motivo).trim())) {
        return res.status(400).json({
            message: 'Debe indicar el motivo obligatorio para realizar la baja lógica del producto'
        });
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const prodActual = actualRows[0];
        const motivoLimpio = motivo ? String(motivo).trim() : null;

        const { rows } = await db.query(
            `UPDATE public.producto
             SET producto_estado = $1,
                 producto_motivo_baja = $2,
                 producto_fecha_baja = CASE WHEN $1 = 'inactivo' THEN now() ELSE NULL END,
                 producto_actualizado_en = now()
             WHERE producto_id = $3
             RETURNING *`,
            [estado, estado === 'inactivo' ? motivoLimpio : null, id]
        );

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: estado === 'inactivo' ? 'BAJA_LOGICA_PRODUCTO' : 'REACTIVAR_PRODUCTO',
            motivo: motivoLimpio || 'Reactivación de producto',
            valoresAnteriores: {
                estado: prodActual.producto_estado,
                motivo_baja: prodActual.producto_motivo_baja
            },
            valoresNuevos: {
                estado,
                motivo_baja: estado === 'inactivo' ? motivoLimpio : null
            }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: estado === 'inactivo' ? 'baja_logica_producto' : 'reactivacion_producto',
            modulo: 'productos',
            accion: estado === 'inactivo' ? 'BAJA_LOGICA_PRODUCTO' : 'REACTIVAR_PRODUCTO',
            resultado: 'exitoso',
            detalle: estado === 'inactivo'
                ? `Baja lógica de producto ${prodActual.producto_codigo} (${prodActual.producto_nombre}). Motivo: ${motivoLimpio}`
                : `Reactivación de producto ${prodActual.producto_codigo} (${prodActual.producto_nombre})`
        });

        res.json({
            message: estado === 'inactivo'
                ? 'Baja lógica del producto registrada correctamente (historial de lotes y movimientos preservado)'
                : 'Producto reactivado correctamente',
            producto: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar estado del producto', error: error.message });
    }
};

// Bloqueo explícito de eliminación física (Subflujo CU 36)
const eliminarProductoFisico = async (req, res) => {
    return res.status(400).json({
        message: 'La eliminación física de productos está bloqueada para preservar la trazabilidad histórica de lotes y movimientos. Utilice la baja lógica indicando el motivo.'
    });
};

// Consultar historial de auditoría de un producto (Subflujo CU 35 y CU 36)
const obtenerAuditoriaProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query(`
            SELECT
                a.auditoria_producto_id,
                a.producto_id,
                a.usuario_id,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre,
                u.usuario_correo,
                a.accion,
                a.motivo,
                a.valores_anteriores,
                a.valores_nuevos,
                a.fecha_hora
            FROM public.auditoria_producto a
            LEFT JOIN public.usuario u ON u.usuario_id = a.usuario_id
            WHERE a.producto_id = $1
            ORDER BY a.fecha_hora DESC, a.auditoria_producto_id DESC
        `, [id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener auditoría del producto', error: error.message });
    }
};

// =========================================================================
// CU 9: Asociar productos con proveedores (Subflujo CU 8)
// =========================================================================
const obtenerProveedoresProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: prodRows } = await db.query(
            'SELECT producto_id, producto_codigo, producto_nombre FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const { rows } = await db.query(`
            SELECT
                pp.producto_id,
                pp.proveedor_id,
                pp.estado AS asociacion_estado,
                pp.fecha_asociacion,
                pr.proveedor_nombre,
                pr.proveedor_rut,
                pr.proveedor_nombre_contacto AS proveedor_contacto,
                pr.proveedor_telefono_contacto AS proveedor_telefono,
                pr.proveedor_correo_contacto AS proveedor_correo,
                pr.proveedor_plazo_pago,
                pr.proveedor_modalidad_entrega,
                pr.proveedor_condiciones_comerciales,
                pr.proveedor_estado
            FROM public.producto_proveedor pp
            JOIN public.proveedor pr ON pr.proveedor_id = pp.proveedor_id
            WHERE pp.producto_id = $1
            ORDER BY pp.estado ASC, pr.proveedor_nombre ASC
        `, [id]);

        res.json({
            producto: prodRows[0],
            proveedores: rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener proveedores asociados al producto', error: error.message });
    }
};

const asociarProveedoresProducto = async (req, res) => {
    const { id } = req.params;
    const { proveedor_id, proveedores_ids } = req.body;

    const listaIds = Array.isArray(proveedores_ids)
        ? proveedores_ids.map(Number).filter(Boolean)
        : (proveedor_id ? [Number(proveedor_id)] : []);

    if (listaIds.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos un proveedor para asociar al producto' });
    }

    try {
        const { rows: prodRows } = await db.query(
            'SELECT producto_id, producto_codigo, producto_nombre, producto_estado FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const producto = prodRows[0];

        // Validar que cada proveedor exista y se encuentre activo (Subflujo CU 8)
        const proveedoresValidados = [];
        for (const provId of listaIds) {
            const { rows: provRows } = await db.query(
                "SELECT proveedor_id, proveedor_nombre, proveedor_estado FROM public.proveedor WHERE proveedor_id = $1 AND proveedor_estado = 'activo'",
                [provId]
            );
            if (provRows.length === 0) {
                return res.status(400).json({
                    message: `El proveedor seleccionado (ID ${provId}) no existe o no se encuentra activo`
                });
            }
            proveedoresValidados.push(provRows[0]);
        }

        for (const prov of proveedoresValidados) {
            await db.query(`
                INSERT INTO public.producto_proveedor (producto_id, proveedor_id, estado, fecha_asociacion)
                VALUES ($1, $2, 'activo', CURRENT_DATE)
                ON CONFLICT (producto_id, proveedor_id)
                DO UPDATE SET estado = 'activo', fecha_asociacion = CURRENT_DATE
            `, [id, prov.proveedor_id]);
        }

        const nombresProveedores = proveedoresValidados.map(p => p.proveedor_nombre).join(', ');

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: 'ASOCIAR_PROVEEDOR',
            motivo: `Asociación de proveedor(es): ${nombresProveedores}`,
            valoresAnteriores: null,
            valoresNuevos: { proveedores_ids: listaIds, proveedores_nombres: nombresProveedores }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'asociacion_proveedor_producto',
            modulo: 'productos',
            accion: 'ASOCIAR_PROVEEDOR_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Producto ${producto.producto_codigo} asociado con proveedor(es): ${nombresProveedores}`
        });

        res.status(201).json({
            message: 'Proveedor(es) asociado(s) correctamente a la ficha del producto',
            proveedores_asociados: proveedoresValidados
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al asociar proveedores al producto', error: error.message });
    }
};

const desasociarProveedorProducto = async (req, res) => {
    const { id, proveedorId } = req.params;

    try {
        const { rows } = await db.query(`
            UPDATE public.producto_proveedor
            SET estado = 'inactivo'
            WHERE producto_id = $1 AND proveedor_id = $2
            RETURNING *
        `, [id, proveedorId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Asociación entre producto y proveedor no encontrada' });
        }

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: 'DESASOCIAR_PROVEEDOR',
            motivo: `Inactivación de vínculo con proveedor ID ${proveedorId}`,
            valoresAnteriores: { proveedor_id: Number(proveedorId), estado: 'activo' },
            valoresNuevos: { proveedor_id: Number(proveedorId), estado: 'inactivo' }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'desasociacion_proveedor_producto',
            modulo: 'productos',
            accion: 'DESASOCIAR_PROVEEDOR_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Asociación inactivada entre producto ID ${id} y proveedor ID ${proveedorId}`
        });

        res.json({ message: 'Vínculo con proveedor inactivado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al desasociar proveedor del producto', error: error.message });
    }
};

// =========================================================================
// CU 14: Consultar y filtrar existencias de inventario (Subflujos CU 19, 20, 21, 41, 51)
// =========================================================================
const obtenerUmbralVencimientoConfigurado = async () => {
    try {
        const { rows } = await db.query(
            "SELECT valor FROM public.configuracion_sistema WHERE clave = 'umbral_dias_vencimiento' LIMIT 1"
        );
        const val = rows.length > 0 ? parseInt(rows[0].valor, 10) : 7;
        return Number.isFinite(val) && val > 0 ? val : 7;
    } catch (_) {
        return 7;
    }
};

// Subflujo CU 41: Calculando Stock Disponible a partir de movimientos e inventario por lotes
const recalcularStockDisponible = async (req, res) => {
    const productoId = req.body?.producto_id || req.query?.producto_id || null;
    const params = [];
    let whereProd = '';
    if (productoId) {
        params.push(Number(productoId));
        whereProd = 'WHERE p.producto_id = $1';
    }

    try {
        const { rows: calculos } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_tipo_control_stock,
                p.producto_stock_actual AS stock_anterior,
                COALESCE(mov.total_ingresos, 0)::numeric(12,2) AS total_ingresos,
                COALESCE(mov.total_salidas, 0)::numeric(12,2) AS total_salidas,
                GREATEST(COALESCE(mov.total_ingresos, 0) - COALESCE(mov.total_salidas, 0), 0)::numeric(12,2) AS stock_por_movimientos,
                COALESCE(lot.stock_lotes, 0)::numeric(12,2) AS stock_por_lotes
            FROM public.producto p
            LEFT JOIN (
                SELECT
                    producto_id,
                    SUM(CASE WHEN movimiento_tipo = 'ingreso' THEN movimiento_cantidad ELSE 0 END) AS total_ingresos,
                    SUM(CASE WHEN movimiento_tipo = 'salida' THEN movimiento_cantidad ELSE 0 END) AS total_salidas
                FROM public.movimiento_stock
                GROUP BY producto_id
            ) mov ON mov.producto_id = p.producto_id
            LEFT JOIN (
                SELECT
                    producto_id,
                    SUM(lote_cantidad_disponible) AS stock_lotes
                FROM public.lote
                GROUP BY producto_id
            ) lot ON lot.producto_id = p.producto_id
            ${whereProd}
            ORDER BY p.producto_id ASC
        `, params);

        const actualizados = [];
        for (const item of calculos) {
            const tieneMovimientos = Number(item.total_ingresos) > 0 || Number(item.total_salidas) > 0;
            const tieneLotes = Number(item.stock_por_lotes) > 0;
            let stockCalculado = Number(item.stock_anterior);

            if (item.producto_tipo_control_stock === 'lote' && tieneLotes) {
                stockCalculado = Number(item.stock_por_lotes);
            } else if (tieneMovimientos) {
                stockCalculado = Number(item.stock_por_movimientos);
            }

            if (stockCalculado !== Number(item.stock_anterior)) {
                await db.query(
                    'UPDATE public.producto SET producto_stock_actual = $1, producto_actualizado_en = now() WHERE producto_id = $2',
                    [stockCalculado, item.producto_id]
                );
            }

            actualizados.push({
                producto_id: item.producto_id,
                producto_codigo: item.producto_codigo,
                producto_nombre: item.producto_nombre,
                stock_anterior: Number(item.stock_anterior),
                total_ingresos: Number(item.total_ingresos),
                total_salidas: Number(item.total_salidas),
                stock_por_movimientos: Number(item.stock_por_movimientos),
                stock_por_lotes: Number(item.stock_por_lotes),
                stock_disponible_calculado: stockCalculado
            });
        }

        res.json({
            message: 'Cálculo y verificación de stock disponible completado (CU 41)',
            total_evaluados: actualizados.length,
            productos: actualizados
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al recalcular stock disponible', error: error.message });
    }
};

// Subflujos CU 19 (Buscando Productos), CU 20 (Aplicando Filtros de Inventario), CU 21 (Consultando Existencias) y CU 41 (Calculando Stock Disponible)
const consultarExistenciasInventario = async (req, res) => {
    const {
        q = '',
        producto_id,
        categoria_id,
        categoria,
        proveedor_id,
        ubicacion_id,
        lote_codigo,
        estado,
        tipo_negocio,
        estado_vencimiento,
        dias_vencimiento,
        solo_con_stock
    } = req.query;

    try {
        const umbralConfig = await obtenerUmbralVencimientoConfigurado();
        const diasUmbral = dias_vencimiento !== undefined && dias_vencimiento !== ''
            ? Math.max(0, parseInt(dias_vencimiento, 10) || umbralConfig)
            : umbralConfig;

        const { rows: prodRows } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_precio,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                COALESCE(p.producto_tipo_control_stock, 'lote') AS producto_tipo_control_stock,
                p.producto_estado,
                p.producto_stock_actual,
                COALESCE(p.producto_stock_minimo, 5) AS producto_stock_minimo,
                p.producto_stock_maximo,
                u.unidad_medida_codigo,
                u.unidad_medida_nombre,
                COALESCE(mov.total_ingresos, 0)::numeric(12,2) AS total_ingresos,
                COALESCE(mov.total_salidas, 0)::numeric(12,2) AS total_salidas,
                GREATEST(COALESCE(mov.total_ingresos, 0) - COALESCE(mov.total_salidas, 0), 0)::numeric(12,2) AS stock_calculado_movimientos
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN (
                SELECT
                    producto_id,
                    SUM(CASE WHEN movimiento_tipo = 'ingreso' THEN movimiento_cantidad ELSE 0 END) AS total_ingresos,
                    SUM(CASE WHEN movimiento_tipo = 'salida' THEN movimiento_cantidad ELSE 0 END) AS total_salidas
                FROM public.movimiento_stock
                GROUP BY producto_id
            ) mov ON mov.producto_id = p.producto_id
            ORDER BY p.producto_nombre ASC
        `);

        const { rows: loteRows } = await db.query(`
            SELECT
                l.lote_id,
                l.lote_codigo,
                l.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                p.producto_estado,
                um.unidad_medida_codigo,
                l.lote_cantidad_ingresada,
                l.lote_cantidad_disponible,
                COALESCE(l.lote_costo_unitario, 0) AS lote_costo_unitario,
                ROUND(COALESCE(l.lote_costo_unitario, 0) * l.lote_cantidad_disponible, 2) AS valor_stock_lote,
                l.lote_documento_respaldo,
                l.lote_fecha_recepcion,
                l.lote_fecha_vencimiento,
                (l.lote_fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                l.proveedor_id,
                pr.proveedor_nombre,
                pr.proveedor_rut,
                l.ubicacion_id,
                ub.ubicacion_codigo,
                ub.ubicacion_nombre
            FROM public.lote l
            JOIN public.producto p ON p.producto_id = l.producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = p.producto_unidad_medida_id
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = l.proveedor_id
            LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = l.ubicacion_id
            ORDER BY l.lote_fecha_vencimiento ASC NULLS LAST, l.lote_id DESC
        `);

        const clasificarVencimiento = (diasRestantes) => {
            if (diasRestantes === null || diasRestantes === undefined) return 'sin_vencimiento';
            const d = Number(diasRestantes);
            if (d < 0) return 'vencido';
            if (d <= 3 && d <= diasUmbral) return 'critico';
            if (d <= diasUmbral) return 'por_vencer';
            return 'vigente';
        };

        const lotesEnriquecidos = loteRows.map(l => {
            const estVenc = clasificarVencimiento(l.dias_restantes);
            return {
                ...l,
                lote_cantidad_ingresada: Number(l.lote_cantidad_ingresada),
                lote_cantidad_disponible: Number(l.lote_cantidad_disponible),
                lote_costo_unitario: Number(l.lote_costo_unitario),
                valor_stock_lote: Number(l.valor_stock_lote),
                estado_vencimiento: estVenc
            };
        });

        const textoBusqueda = String(q || '').trim().toLowerCase();
        const codigoLoteFiltro = String(lote_codigo || '').trim().toLowerCase();

        // Filtrar lotes según criterios acumulativos (Subflujos CU 19 y CU 20)
        const lotesFiltrados = lotesEnriquecidos.filter(l => {
            if (solo_con_stock === 'true' && l.lote_cantidad_disponible <= 0) return false;
            if (producto_id && Number(l.producto_id) !== Number(producto_id)) return false;
            if (categoria_id && Number(l.categoria_id) !== Number(categoria_id)) return false;
            if (categoria && String(l.producto_categoria || '').toLowerCase() !== String(categoria).trim().toLowerCase()) return false;
            if (proveedor_id && Number(l.proveedor_id) !== Number(proveedor_id)) return false;
            if (ubicacion_id && Number(l.ubicacion_id) !== Number(ubicacion_id)) return false;
            if (codigoLoteFiltro && !String(l.lote_codigo || '').toLowerCase().includes(codigoLoteFiltro)) return false;
            if (estado && estado !== 'todos' && l.producto_estado !== estado) return false;
            if (tipo_negocio && tipo_negocio !== 'todos' && l.producto_tipo_negocio !== tipo_negocio) return false;
            if (estado_vencimiento && estado_vencimiento !== 'todos') {
                if (estado_vencimiento === 'alertas') {
                    if (!['vencido', 'critico', 'por_vencer'].includes(l.estado_vencimiento)) return false;
                } else if (estado_vencimiento === 'por_vencer') {
                    if (!['critico', 'por_vencer'].includes(l.estado_vencimiento)) return false;
                } else if (l.estado_vencimiento !== estado_vencimiento) {
                    return false;
                }
            }
            if (textoBusqueda) {
                const coincideTexto =
                    String(l.producto_codigo || '').toLowerCase().includes(textoBusqueda) ||
                    String(l.producto_nombre || '').toLowerCase().includes(textoBusqueda) ||
                    String(l.producto_categoria || '').toLowerCase().includes(textoBusqueda) ||
                    String(l.lote_codigo || '').toLowerCase().includes(textoBusqueda) ||
                    String(l.proveedor_nombre || '').toLowerCase().includes(textoBusqueda) ||
                    String(l.ubicacion_nombre || '').toLowerCase().includes(textoBusqueda);
                if (!coincideTexto) return false;
            }
            return true;
        });

        const lotesPorProductoMap = new Map();
        for (const l of lotesEnriquecidos) {
            if (!lotesPorProductoMap.has(l.producto_id)) {
                lotesPorProductoMap.set(l.producto_id, []);
            }
            lotesPorProductoMap.get(l.producto_id).push(l);
        }

        const hayFiltroEspecLote = Boolean(
            proveedor_id ||
            ubicacion_id ||
            codigoLoteFiltro ||
            (estado_vencimiento && estado_vencimiento !== 'todos')
        );

        const existenciasConsolidadas = [];
        for (const p of prodRows) {
            if (producto_id && Number(p.producto_id) !== Number(producto_id)) continue;
            if (categoria_id && Number(p.categoria_id) !== Number(categoria_id)) continue;
            if (categoria && String(p.producto_categoria || '').toLowerCase() !== String(categoria).trim().toLowerCase()) continue;
            if (estado && estado !== 'todos' && p.producto_estado !== estado) continue;
            if (tipo_negocio && tipo_negocio !== 'todos' && p.producto_tipo_negocio !== tipo_negocio) continue;

            const todosLotesProd = lotesPorProductoMap.get(p.producto_id) || [];
            const lotesCoincidentesProd = lotesFiltrados.filter(l => l.producto_id === p.producto_id);

            if (hayFiltroEspecLote && lotesCoincidentesProd.length === 0) {
                continue;
            }

            if (textoBusqueda) {
                const coincideProd =
                    String(p.producto_codigo || '').toLowerCase().includes(textoBusqueda) ||
                    String(p.producto_nombre || '').toLowerCase().includes(textoBusqueda) ||
                    String(p.producto_categoria || '').toLowerCase().includes(textoBusqueda) ||
                    String(p.producto_estado || '').toLowerCase().includes(textoBusqueda);
                if (!coincideProd && lotesCoincidentesProd.length === 0) {
                    continue;
                }
            }

            const lotesConStock = todosLotesProd.filter(l => l.lote_cantidad_disponible > 0);
            const stockLotesDisp = lotesConStock.reduce((acc, l) => acc + l.lote_cantidad_disponible, 0);
            const valorStockLotes = lotesConStock.reduce((acc, l) => acc + l.valor_stock_lote, 0);
            const stockActual = Number(p.producto_stock_actual);
            const stockMinimo = Number(p.producto_stock_minimo || 5);

            if (solo_con_stock === 'true' && stockActual <= 0 && stockLotesDisp <= 0) {
                continue;
            }

            const ubicacionesUnicas = [...new Set(lotesConStock.map(l => l.ubicacion_codigo ? `${l.ubicacion_codigo} (${l.ubicacion_nombre})` : null).filter(Boolean))];
            const proveedoresUnicos = [...new Set(lotesConStock.map(l => l.proveedor_nombre).filter(Boolean))];
            const proximoVenc = lotesConStock.length > 0 ? lotesConStock[0].lote_fecha_vencimiento : null;
            const diasProximoVenc = lotesConStock.length > 0 ? lotesConStock[0].dias_restantes : null;

            existenciasConsolidadas.push({
                producto_id: p.producto_id,
                producto_codigo: p.producto_codigo,
                producto_nombre: p.producto_nombre,
                producto_categoria: p.producto_categoria,
                categoria_id: p.categoria_id,
                producto_tipo_negocio: p.producto_tipo_negocio,
                producto_tipo_control_stock: p.producto_tipo_control_stock,
                producto_estado: p.producto_estado,
                unidad_medida_codigo: p.unidad_medida_codigo,
                producto_precio: Number(p.producto_precio),
                producto_stock_actual: stockActual,
                producto_stock_minimo: stockMinimo,
                stock_disponible_lotes: Number(stockLotesDisp.toFixed(2)),
                total_ingresos: Number(p.total_ingresos),
                total_salidas: Number(p.total_salidas),
                stock_calculado_movimientos: Number(p.stock_calculado_movimientos),
                valorizacion_stock: Number((valorStockLotes > 0 ? valorStockLotes : stockActual * Number(p.producto_precio)).toFixed(2)),
                stock_critico: stockActual <= stockMinimo,
                lotes_activos: lotesConStock.length,
                proximo_vencimiento: proximoVenc,
                dias_proximo_vencimiento: diasProximoVenc,
                estado_proximo_vencimiento: clasificarVencimiento(diasProximoVenc),
                ubicaciones: ubicacionesUnicas,
                proveedores: proveedoresUnicos
            });
        }

        const totalUnidadesStock = existenciasConsolidadas.reduce((acc, item) => acc + item.producto_stock_actual, 0);
        const valorizacionTotal = existenciasConsolidadas.reduce((acc, item) => acc + item.valorizacion_stock, 0);
        const productosCriticos = existenciasConsolidadas.filter(item => item.stock_critico).length;
        const lotesVencidosCount = lotesFiltrados.filter(l => l.lote_cantidad_disponible > 0 && l.estado_vencimiento === 'vencido').length;
        const lotesPorVencerCount = lotesFiltrados.filter(l => l.lote_cantidad_disponible > 0 && ['critico', 'por_vencer'].includes(l.estado_vencimiento)).length;

        res.json({
            filtros_aplicados: {
                q: textoBusqueda || null,
                producto_id: producto_id ? Number(producto_id) : null,
                categoria_id: categoria_id ? Number(categoria_id) : null,
                categoria: categoria || null,
                proveedor_id: proveedor_id ? Number(proveedor_id) : null,
                ubicacion_id: ubicacion_id ? Number(ubicacion_id) : null,
                lote_codigo: codigoLoteFiltro || null,
                estado: estado || 'todos',
                tipo_negocio: tipo_negocio || 'todos',
                estado_vencimiento: estado_vencimiento || 'todos',
                dias_vencimiento: diasUmbral,
                solo_con_stock: solo_con_stock === 'true'
            },
            umbral_dias_vencimiento: diasUmbral,
            sin_coincidencias: existenciasConsolidadas.length === 0 && lotesFiltrados.length === 0,
            resumen: {
                total_productos: existenciasConsolidadas.length,
                total_unidades_stock: Number(totalUnidadesStock.toFixed(2)),
                total_lotes_filtrados: lotesFiltrados.length,
                valorizacion_total_stock: Number(valorizacionTotal.toFixed(2)),
                productos_stock_critico: productosCriticos,
                lotes_vencidos: lotesVencidosCount,
                lotes_por_vencer: lotesPorVencerCount
            },
            existencias_consolidadas: existenciasConsolidadas,
            desglose_lotes: lotesFiltrados
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar existencias de inventario', error: error.message });
    }
};

// Subflujo CU 51: Consultando Stock en Tiempo Real (cantidad disponible, ubicación, lotes activos y últimos movimientos)
const consultarStockTiempoReal = async (req, res) => {
    const { id } = req.params;

    try {
        const umbralConfig = await obtenerUmbralVencimientoConfigurado();

        const { rows: prodRows } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_precio,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                COALESCE(p.producto_tipo_control_stock, 'lote') AS producto_tipo_control_stock,
                p.producto_estado,
                p.producto_stock_actual,
                COALESCE(p.producto_stock_minimo, 5) AS producto_stock_minimo,
                p.producto_actualizado_en,
                u.unidad_medida_codigo,
                u.unidad_medida_nombre
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            WHERE p.producto_id = $1
        `, [id]);

        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado para consulta en tiempo real' });
        }
        const producto = prodRows[0];

        const { rows: movResumen } = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN movimiento_tipo = 'ingreso' THEN movimiento_cantidad ELSE 0 END), 0)::numeric(12,2) AS total_ingresos,
                COALESCE(SUM(CASE WHEN movimiento_tipo = 'salida' THEN movimiento_cantidad ELSE 0 END), 0)::numeric(12,2) AS total_salidas
            FROM public.movimiento_stock
            WHERE producto_id = $1
        `, [id]);

        const { rows: lotesActivos } = await db.query(`
            SELECT
                l.lote_id,
                l.lote_codigo,
                l.lote_cantidad_ingresada,
                l.lote_cantidad_disponible,
                COALESCE(l.lote_costo_unitario, 0) AS lote_costo_unitario,
                l.lote_documento_respaldo,
                l.lote_fecha_recepcion,
                l.lote_fecha_vencimiento,
                (l.lote_fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                pr.proveedor_nombre,
                ub.ubicacion_id,
                ub.ubicacion_codigo,
                ub.ubicacion_nombre
            FROM public.lote l
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = l.proveedor_id
            LEFT JOIN public.ubicacion_bodega ub ON ub.ubicacion_id = l.ubicacion_id
            WHERE l.producto_id = $1 AND l.lote_cantidad_disponible > 0
            ORDER BY l.lote_fecha_vencimiento ASC NULLS LAST, l.lote_id ASC
        `, [id]);

        const { rows: ultimosMovimientos } = await db.query(`
            SELECT
                m.movimiento_id,
                m.movimiento_tipo,
                m.movimiento_motivo,
                cm.motivo_codigo,
                cm.motivo_nombre AS motivo_catalogo_nombre,
                m.movimiento_fecha,
                m.movimiento_cantidad,
                m.movimiento_costo_unitario,
                m.movimiento_costo_total,
                m.movimiento_observacion,
                l.lote_codigo,
                pr.proveedor_nombre,
                TRIM(CONCAT(u.usuario_nombres, ' ', u.usuario_apellido_paterno)) AS usuario_nombre
            FROM public.movimiento_stock m
            LEFT JOIN public.catalogo_motivo cm ON cm.motivo_id = m.motivo_catalogo_id
            LEFT JOIN public.lote l ON l.lote_id = m.lote_id
            LEFT JOIN public.proveedor pr ON pr.proveedor_id = m.proveedor_id
            LEFT JOIN public.usuario u ON u.usuario_id = m.usuario_id
            WHERE m.producto_id = $1
            ORDER BY m.movimiento_fecha DESC, m.movimiento_id DESC
            LIMIT 15
        `, [id]);

        const ubicacionesMap = new Map();
        for (const l of lotesActivos) {
            const clave = l.ubicacion_codigo ? `${l.ubicacion_codigo} - ${l.ubicacion_nombre}` : 'Sin ubicación asignada';
            const actual = ubicacionesMap.get(clave) || { ubicacion: clave, cantidad_disponible: 0, lotes: 0 };
            actual.cantidad_disponible = Number((actual.cantidad_disponible + Number(l.lote_cantidad_disponible)).toFixed(2));
            actual.lotes += 1;
            ubicacionesMap.set(clave, actual);
        }

        const totalIngresos = Number(movResumen[0].total_ingresos || 0);
        const totalSalidas = Number(movResumen[0].total_salidas || 0);
        const stockCalculadoMovimientos = Math.max(0, Number((totalIngresos - totalSalidas).toFixed(2)));
        const stockEnLotes = Number(lotesActivos.reduce((acc, l) => acc + Number(l.lote_cantidad_disponible), 0).toFixed(2));
        const stockActual = Number(producto.producto_stock_actual);
        const stockMinimo = Number(producto.producto_stock_minimo || 5);

        let estadoStock = 'disponible';
        if (stockActual <= 0) estadoStock = 'sin_stock';
        else if (stockActual <= stockMinimo) estadoStock = 'critico';

        res.json({
            consultado_en: new Date().toISOString(),
            producto: {
                ...producto,
                producto_precio: Number(producto.producto_precio),
                producto_stock_actual: stockActual,
                producto_stock_minimo: stockMinimo
            },
            tiempo_real: {
                stock_disponible: stockActual,
                stock_en_lotes_activos: stockEnLotes,
                total_ingresos_registrados: totalIngresos,
                total_salidas_registradas: totalSalidas,
                stock_calculado_movimientos: stockCalculadoMovimientos,
                estado_stock: estadoStock,
                lotes_activos_count: lotesActivos.length,
                ubicaciones: Array.from(ubicacionesMap.values())
            },
            lotes_activos: lotesActivos.map(l => {
                const d = l.dias_restantes !== null && l.dias_restantes !== undefined ? Number(l.dias_restantes) : null;
                let est = 'vigente';
                if (d === null) est = 'sin_vencimiento';
                else if (d < 0) est = 'vencido';
                else if (d <= 3) est = 'critico';
                else if (d <= umbralConfig) est = 'por_vencer';
                return {
                    ...l,
                    lote_cantidad_ingresada: Number(l.lote_cantidad_ingresada),
                    lote_cantidad_disponible: Number(l.lote_cantidad_disponible),
                    lote_costo_unitario: Number(l.lote_costo_unitario),
                    estado_vencimiento: est
                };
            }),
            ultimos_movimientos: ultimosMovimientos
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar stock en tiempo real', error: error.message });
    }
};

// =========================================================================
// CU 16: Configurar límites y alertas de stock crítico (Subflujos CU 22, CU 23, CU 52)
// =========================================================================
const REGEX_EMAIL_ALERTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const configurarParametrosStock = async (req, res) => {
    const { id } = req.params;
    const {
        stock_minimo,
        stock_maximo = null,
        alerta_canal_sistema = true,
        alerta_canal_correo = false,
        alerta_correo_destino = null
    } = req.body;

    const minNum = Number(stock_minimo);
    if (stock_minimo === undefined || stock_minimo === null || stock_minimo === '' || !Number.isFinite(minNum) || minNum < 0) {
        return res.status(400).json({
            message: 'El stock mínimo es obligatorio y debe ser un valor numérico mayor o igual a cero (CU 22)'
        });
    }

    let maxNum = null;
    if (stock_maximo !== undefined && stock_maximo !== null && String(stock_maximo).trim() !== '') {
        maxNum = Number(stock_maximo);
        if (!Number.isFinite(maxNum) || maxNum <= minNum) {
            return res.status(400).json({
                message: 'Inconsistencia en parámetros de stock: el stock máximo debe ser estrictamente mayor que el stock mínimo (CU 22)'
            });
        }
    }

    const canalSistema = Boolean(alerta_canal_sistema);
    const canalCorreo = Boolean(alerta_canal_correo);
    const correoLimpio = alerta_correo_destino ? String(alerta_correo_destino).trim().toLowerCase() : null;

    // Subflujo CU 52: Validar configuración de correos de destino cuando se activa notificación por correo
    if (canalCorreo) {
        if (!correoLimpio || !REGEX_EMAIL_ALERTA.test(correoLimpio)) {
            return res.status(400).json({
                message: 'Para activar alertas por correo electrónico debe indicar un correo de destino válido (CU 52)'
            });
        }
    }

    try {
        const { rows: actualRows } = await db.query(
            'SELECT * FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (actualRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const prodActual = actualRows[0];

        const { rows } = await db.query(`
            UPDATE public.producto
            SET producto_stock_minimo = $1,
                producto_stock_maximo = $2,
                alerta_canal_sistema = $3,
                alerta_canal_correo = $4,
                alerta_correo_destino = $5,
                producto_actualizado_en = now()
            WHERE producto_id = $6
            RETURNING *
        `, [minNum, maxNum, canalSistema, canalCorreo, correoLimpio, id]);

        const actualizado = rows[0];
        const stockActual = Number(actualizado.producto_stock_actual);
        const enAlertaBajo = stockActual <= minNum;

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: 'CONFIGURAR_PARAMETROS_STOCK',
            motivo: 'Configuración de límites mínimo/máximo y canales de alerta de stock crítico (CU 16)',
            valoresAnteriores: {
                stock_minimo: prodActual.producto_stock_minimo,
                stock_maximo: prodActual.producto_stock_maximo,
                alerta_canal_sistema: prodActual.alerta_canal_sistema,
                alerta_canal_correo: prodActual.alerta_canal_correo,
                alerta_correo_destino: prodActual.alerta_correo_destino
            },
            valoresNuevos: {
                stock_minimo: minNum,
                stock_maximo: maxNum,
                alerta_canal_sistema: canalSistema,
                alerta_canal_correo: canalCorreo,
                alerta_correo_destino: correoLimpio
            }
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'configuracion_stock_critico',
            modulo: 'productos',
            accion: 'CONFIGURAR_LIMITES_ALERTA_STOCK',
            resultado: 'exitoso',
            detalle: `Producto ${actualizado.producto_codigo}: Mín=${minNum}, Máx=${maxNum ?? 'S/L'}, Canal Sistema=${canalSistema}, Canal Correo=${canalCorreo} (${correoLimpio || 'N/A'})`
        });

        res.json({
            message: 'Parámetros de stock mínimo/máximo y canales de alerta configurados correctamente (CU 16)',
            producto: actualizado,
            alerta_activa: enAlertaBajo ? {
                nivel: stockActual <= 0 ? 'quiebre_stock' : 'stock_bajo',
                mensaje: `El stock actual (${stockActual}) se encuentra bajo o igual al umbral mínimo configurado (${minNum})`
            } : null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al configurar parámetros de stock', error: error.message });
    }
};

const consultarAlertasStockCritico = async (req, res) => {
    const { solo_alertas = 'false', categoria_id, tipo_negocio } = req.query;

    try {
        const { rows } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                p.categoria_id,
                COALESCE(p.producto_tipo_negocio, 'comida') AS producto_tipo_negocio,
                p.producto_estado,
                p.producto_stock_actual,
                COALESCE(p.producto_stock_minimo, 5) AS producto_stock_minimo,
                p.producto_stock_maximo,
                COALESCE(p.alerta_canal_sistema, true) AS alerta_canal_sistema,
                COALESCE(p.alerta_canal_correo, false) AS alerta_canal_correo,
                p.alerta_correo_destino,
                u.unidad_medida_codigo
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            WHERE p.producto_estado = 'activo'
            ORDER BY (p.producto_stock_actual - COALESCE(p.producto_stock_minimo, 5)) ASC, p.producto_nombre ASC
        `);

        const evaluados = rows
            .filter(p => {
                if (categoria_id && Number(p.categoria_id) !== Number(categoria_id)) return false;
                if (tipo_negocio && tipo_negocio !== 'todos' && p.producto_tipo_negocio !== tipo_negocio) return false;
                return true;
            })
            .map(p => {
                const stock = Number(p.producto_stock_actual);
                const min = Number(p.producto_stock_minimo);
                const max = p.producto_stock_maximo !== null && p.producto_stock_maximo !== undefined ? Number(p.producto_stock_maximo) : null;

                let estadoAlerta = 'normal';
                let mensajeAlerta = 'Stock dentro de rango operativo normal';
                let deficit = 0;

                if (stock <= 0) {
                    estadoAlerta = 'quiebre_stock';
                    deficit = min;
                    mensajeAlerta = `Quiebre de stock (0 ${p.unidad_medida_codigo}; mínimo requerido: ${min})`;
                } else if (stock <= min) {
                    estadoAlerta = 'stock_bajo';
                    deficit = Number((min - stock).toFixed(2));
                    mensajeAlerta = `Stock crítico bajo mínimo (${stock} / ${min} ${p.unidad_medida_codigo})`;
                } else if (max !== null && stock > max) {
                    estadoAlerta = 'sobreabastecimiento';
                    mensajeAlerta = `Sobreabastecimiento sobre máximo (${stock} / ${max} ${p.unidad_medida_codigo})`;
                }

                return {
                    ...p,
                    producto_stock_actual: stock,
                    producto_stock_minimo: min,
                    producto_stock_maximo: max,
                    estado_alerta: estadoAlerta,
                    deficit_reposicion: deficit,
                    mensaje_alerta: mensajeAlerta
                };
            });

        const alertasActivas = evaluados.filter(p => ['quiebre_stock', 'stock_bajo', 'sobreabastecimiento'].includes(p.estado_alerta));

        res.json({
            resumen: {
                total_productos_evaluados: evaluados.length,
                total_alertas_activas: alertasActivas.length,
                quiebres_stock: evaluados.filter(p => p.estado_alerta === 'quiebre_stock').length,
                stock_bajo: evaluados.filter(p => p.estado_alerta === 'stock_bajo').length,
                sobreabastecimiento: evaluados.filter(p => p.estado_alerta === 'sobreabastecimiento').length,
                normales: evaluados.filter(p => p.estado_alerta === 'normal').length
            },
            alertas_activas: alertasActivas,
            productos: solo_alertas === 'true' ? alertasActivas : evaluados
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar alertas de stock crítico', error: error.message });
    }
};

// =========================================================================
// CU 19: Definir recetas y descontar automáticamente sus insumos (Subflujos CU 26 y CU 27)
// =========================================================================
const obtenerRecetasCatalogo = async (req, res) => {
    try {
        const { rows: comidas } = await db.query(`
            SELECT
                p.producto_id,
                p.producto_codigo,
                p.producto_nombre,
                p.producto_categoria,
                p.producto_precio,
                p.producto_estado,
                p.producto_stock_actual,
                u.unidad_medida_codigo
            FROM public.producto p
            JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
            WHERE COALESCE(p.producto_tipo_negocio, 'comida') = 'comida'
            ORDER BY p.producto_nombre ASC
        `);

        const { rows: itemsReceta } = await db.query(`
            SELECT
                r.receta_id,
                r.producto_id,
                r.insumo_producto_id,
                r.receta_cantidad,
                r.observacion,
                r.actualizado_en,
                ins.producto_codigo AS insumo_codigo,
                ins.producto_nombre AS insumo_nombre,
                ins.producto_estado AS insumo_estado,
                ins.producto_stock_actual AS insumo_stock_actual,
                um.unidad_medida_id,
                um.unidad_medida_codigo,
                um.unidad_medida_nombre
            FROM public.receta r
            JOIN public.producto ins ON ins.producto_id = COALESCE(r.insumo_producto_id, r.producto_id)
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = COALESCE(r.unidad_medida_id, ins.producto_unidad_medida_id)
            WHERE r.insumo_producto_id IS NOT NULL
            ORDER BY r.receta_id ASC
        `);

        const mapaRecetas = new Map();
        for (const item of itemsReceta) {
            if (!mapaRecetas.has(item.producto_id)) {
                mapaRecetas.set(item.producto_id, []);
            }
            mapaRecetas.get(item.producto_id).push({
                receta_id: item.receta_id,
                insumo_producto_id: item.insumo_producto_id,
                insumo_codigo: item.insumo_codigo,
                insumo_nombre: item.insumo_nombre,
                insumo_estado: item.insumo_estado,
                insumo_stock_actual: Number(item.insumo_stock_actual),
                cantidad_requerida: Number(item.receta_cantidad),
                unidad_medida_id: item.unidad_medida_id,
                unidad_medida_codigo: item.unidad_medida_codigo,
                unidad_medida_nombre: item.unidad_medida_nombre,
                observacion: item.observacion
            });
        }

        const resultado = comidas.map(c => {
            const ingredientes = mapaRecetas.get(c.producto_id) || [];
            let porcionesDisponibles = null;
            if (ingredientes.length > 0) {
                porcionesDisponibles = Math.min(
                    ...ingredientes.map(ing =>
                        ing.cantidad_requerida > 0
                            ? Math.floor(ing.insumo_stock_actual / ing.cantidad_requerida)
                            : 0
                    )
                );
            }
            return {
                ...c,
                tiene_receta: ingredientes.length > 0,
                total_ingredientes: ingredientes.length,
                porciones_preparables: porcionesDisponibles,
                ingredientes
            };
        });

        res.json(resultado);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener catálogo de recetas', error: error.message });
    }
};

const obtenerRecetaProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: prodRows } = await db.query(
            'SELECT producto_id, producto_codigo, producto_nombre, COALESCE(producto_tipo_negocio, \'comida\') AS producto_tipo_negocio, producto_estado FROM public.producto WHERE producto_id = $1',
            [id]
        );
        if (prodRows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const { rows: items } = await db.query(`
            SELECT
                r.receta_id,
                r.producto_id,
                r.insumo_producto_id,
                r.receta_cantidad AS cantidad_requerida,
                r.observacion,
                r.actualizado_en,
                ins.producto_codigo AS insumo_codigo,
                ins.producto_nombre AS insumo_nombre,
                ins.producto_estado AS insumo_estado,
                ins.producto_stock_actual AS insumo_stock_actual,
                um.unidad_medida_id,
                um.unidad_medida_codigo,
                um.unidad_medida_nombre
            FROM public.receta r
            JOIN public.producto ins ON ins.producto_id = r.insumo_producto_id
            JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = COALESCE(r.unidad_medida_id, ins.producto_unidad_medida_id)
            WHERE r.producto_id = $1 AND r.insumo_producto_id IS NOT NULL
            ORDER BY r.receta_id ASC
        `, [id]);

        res.json({
            producto: prodRows[0],
            tiene_receta: items.length > 0,
            ingredientes: items.map(i => ({
                ...i,
                cantidad_requerida: Number(i.cantidad_requerida),
                insumo_stock_actual: Number(i.insumo_stock_actual)
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar receta del producto', error: error.message });
    }
};

// Subflujo CU 26: Registrando Receta de Producto (solo productos de comida, validando insumos activos y cantidades > 0)
const guardarRecetaProducto = async (req, res) => {
    const { id } = req.params;
    const { ingredientes } = req.body;

    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
        return res.status(400).json({
            message: 'Debe especificar al menos un insumo con su cantidad para registrar la receta del producto (CU 26)'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: prodRows } = await client.query(
            "SELECT producto_id, producto_codigo, producto_nombre, COALESCE(producto_tipo_negocio, 'comida') AS producto_tipo_negocio, producto_estado FROM public.producto WHERE producto_id = $1",
            [id]
        );
        if (prodRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'El producto seleccionado no existe' });
        }
        const producto = prodRows[0];

        if (producto.producto_tipo_negocio !== 'comida') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'Solo los productos de tipo comida admiten definición de receta. Los artículos de merchandising descuentan directamente su propio stock (CU 26)'
            });
        }

        const insumosValidados = [];
        const idsVistos = new Set();

        for (const item of ingredientes) {
            const insumoProdId = Number(item.insumo_producto_id || item.producto_id);
            const cant = Number(item.cantidad || item.receta_cantidad);

            if (!insumoProdId || !Number.isFinite(cant) || cant <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'Cada ingrediente de la receta debe indicar un insumo válido y una cantidad mayor a cero (CU 26)'
                });
            }
            if (insumoProdId === Number(id)) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: 'Un producto no puede incluirse a sí mismo como insumo de su propia receta'
                });
            }
            if (idsVistos.has(insumoProdId)) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El insumo ID ${insumoProdId} está duplicado en la receta; consolide su cantidad en una sola línea`
                });
            }
            idsVistos.add(insumoProdId);

            const { rows: insRows } = await client.query(`
                SELECT
                    p.producto_id,
                    p.producto_codigo,
                    p.producto_nombre,
                    p.producto_estado,
                    p.producto_unidad_medida_id,
                    u.unidad_medida_codigo,
                    u.unidad_medida_estado
                FROM public.producto p
                JOIN public.unidad_medida_personalizada u ON u.unidad_medida_id = p.producto_unidad_medida_id
                WHERE p.producto_id = $1
            `, [insumoProdId]);

            if (insRows.length === 0 || insRows[0].producto_estado !== 'activo') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El insumo seleccionado (ID ${insumoProdId}) no existe o se encuentra inactivo en el inventario (CU 26)`
                });
            }
            if (insRows[0].unidad_medida_estado !== 'activo') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `La unidad de medida del insumo "${insRows[0].producto_nombre}" se encuentra inactiva`
                });
            }

            insumosValidados.push({
                insumo_producto_id: insumoProdId,
                insumo_codigo: insRows[0].producto_codigo,
                insumo_nombre: insRows[0].producto_nombre,
                unidad_medida_id: insRows[0].producto_unidad_medida_id,
                unidad_medida_codigo: insRows[0].unidad_medida_codigo,
                cantidad: Number(cant.toFixed(2)),
                observacion: item.observacion ? String(item.observacion).trim() : null
            });
        }

        const { rows: recetaAnterior } = await client.query(
            'SELECT insumo_producto_id, receta_cantidad, observacion FROM public.receta WHERE producto_id = $1 AND insumo_producto_id IS NOT NULL',
            [id]
        );

        await client.query('DELETE FROM public.receta WHERE producto_id = $1', [id]);

        const insertados = [];
        for (const ing of insumosValidados) {
            const { rows: rIns } = await client.query(`
                INSERT INTO public.receta
                (producto_id, insumo_producto_id, receta_cantidad, unidad_medida_id, observacion, actualizado_en)
                VALUES ($1, $2, $3, $4, $5, now())
                RETURNING *
            `, [id, ing.insumo_producto_id, ing.cantidad, ing.unidad_medida_id, ing.observacion]);
            insertados.push({ ...rIns[0], ...ing });
        }

        await client.query('COMMIT');

        await registrarAuditoriaProducto({
            productoId: Number(id),
            usuarioId: req.user?.id || null,
            accion: 'GUARDAR_RECETA_PRODUCTO',
            motivo: `Definición/actualización de receta con ${insumosValidados.length} ingrediente(s) (CU 26)`,
            valoresAnteriores: recetaAnterior,
            valoresNuevos: insumosValidados
        });

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'registro_receta_producto',
            modulo: 'productos',
            accion: 'GUARDAR_RECETA_PRODUCTO',
            resultado: 'exitoso',
            detalle: `Receta guardada para ${producto.producto_codigo} (${producto.producto_nombre}) con ${insumosValidados.length} insumo(s)`
        });

        res.status(201).json({
            message: 'Receta del producto registrada y validada correctamente (CU 26)',
            producto,
            ingredientes: insertados
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al guardar receta del producto', error: error.message });
    } finally {
        client.release();
    }
};

// Subflujo CU 27: Descontando Automáticamente Insumos por Venta (función reutilizable dentro de transacción de venta/salida)
const descontarInsumosRecetaPorVenta = async (client, { productoId, cantidadVendida, usuarioId = null, referenciaVenta = null }) => {
    const { rows: recetaRows } = await client.query(`
        SELECT
            r.receta_id,
            r.insumo_producto_id,
            r.receta_cantidad,
            ins.producto_codigo AS insumo_codigo,
            ins.producto_nombre AS insumo_nombre,
            ins.producto_precio AS insumo_precio,
            ins.producto_stock_actual AS insumo_stock_actual,
            COALESCE(ins.producto_stock_minimo, 5) AS insumo_stock_minimo,
            ins.producto_tipo_control_stock,
            um.unidad_medida_codigo
        FROM public.receta r
        JOIN public.producto ins ON ins.producto_id = r.insumo_producto_id
        JOIN public.unidad_medida_personalizada um ON um.unidad_medida_id = COALESCE(r.unidad_medida_id, ins.producto_unidad_medida_id)
        WHERE r.producto_id = $1 AND r.insumo_producto_id IS NOT NULL
        FOR UPDATE OF ins
    `, [productoId]);

    if (recetaRows.length === 0) {
        return { tiene_receta: false, descuentos: [], alertas_stock: [] };
    }

    const faltantes = [];
    const requerimientos = recetaRows.map(r => {
        const requerido = Number((Number(r.receta_cantidad) * Number(cantidadVendida)).toFixed(2));
        const disponible = Number(r.insumo_stock_actual || 0);
        if (disponible < requerido) {
            faltantes.push({
                insumo_producto_id: r.insumo_producto_id,
                insumo_codigo: r.insumo_codigo,
                insumo_nombre: r.insumo_nombre,
                unidad_medida: r.unidad_medida_codigo,
                cantidad_requerida: requerido,
                stock_disponible: disponible,
                deficit: Number((requerido - disponible).toFixed(2))
            });
        }
        return { ...r, cantidad_requerida: requerido, stock_disponible: disponible };
    });

    if (faltantes.length > 0) {
        const detalleFaltantes = faltantes
            .map(f => `${f.insumo_nombre} (requiere ${f.cantidad_requerida} ${f.unidad_medida}, disponible ${f.stock_disponible} ${f.unidad_medida})`)
            .join('; ');
        return {
            ok: false,
            tiene_receta: true,
            insumos_insuficientes: faltantes,
            mensaje: `Stock insuficiente de insumos para preparar la receta (CU 27): ${detalleFaltantes}`
        };
    }

    const descuentosAplicados = [];
    const alertasGeneradas = [];

    for (const reqItem of requerimientos) {
        let restantePorDescontar = reqItem.cantidad_requerida;
        let loteUsadoId = null;

        // Si el insumo tiene lotes activos con stock, descontar siguiendo orden FEFO
        const { rows: lotesInsumo } = await client.query(`
            SELECT lote_id, lote_codigo, lote_cantidad_disponible, COALESCE(lote_costo_unitario, 0) AS lote_costo_unitario
            FROM public.lote
            WHERE producto_id = $1 AND lote_cantidad_disponible > 0
            ORDER BY lote_fecha_vencimiento ASC NULLS LAST, lote_id ASC
            FOR UPDATE
        `, [reqItem.insumo_producto_id]);

        for (const lote of lotesInsumo) {
            if (restantePorDescontar <= 0) break;
            const dispLote = Number(lote.lote_cantidad_disponible);
            const descLote = Math.min(dispLote, restantePorDescontar);
            await client.query(
                'UPDATE public.lote SET lote_cantidad_disponible = GREATEST(lote_cantidad_disponible - $1, 0) WHERE lote_id = $2',
                [descLote, lote.lote_id]
            );
            if (!loteUsadoId) loteUsadoId = lote.lote_id;
            restantePorDescontar = Number((restantePorDescontar - descLote).toFixed(2));
        }

        const { rows: updIns } = await client.query(`
            UPDATE public.producto
            SET producto_stock_actual = GREATEST(producto_stock_actual - $1, 0),
                producto_actualizado_en = now()
            WHERE producto_id = $2
            RETURNING producto_stock_actual
        `, [reqItem.cantidad_requerida, reqItem.insumo_producto_id]);

        const nuevoStockInsumo = Number(updIns[0].producto_stock_actual);
        const costoUnit = Number(reqItem.insumo_precio || 0);
        const costoTotal = Number((reqItem.cantidad_requerida * costoUnit).toFixed(2));

        const { rows: movRows } = await client.query(`
            INSERT INTO public.movimiento_stock
            (
                movimiento_tipo,
                movimiento_motivo,
                movimiento_fecha,
                movimiento_cantidad,
                movimiento_costo_unitario,
                movimiento_costo_total,
                movimiento_observacion,
                producto_id,
                lote_id,
                usuario_id
            )
            VALUES ('salida', 'venta', now(), $1, $2, $3, $4, $5, $6, $7)
            RETURNING movimiento_id
        `, [
            reqItem.cantidad_requerida,
            costoUnit,
            costoTotal,
            `[CU 27 - Descuento automático de insumo por receta] ${referenciaVenta || 'Venta de producto preparado'}`,
            reqItem.insumo_producto_id,
            loteUsadoId,
            usuarioId
        ]);

        if (nuevoStockInsumo <= Number(reqItem.insumo_stock_minimo)) {
            alertasGeneradas.push({
                insumo_producto_id: reqItem.insumo_producto_id,
                insumo_codigo: reqItem.insumo_codigo,
                insumo_nombre: reqItem.insumo_nombre,
                stock_resultante: nuevoStockInsumo,
                stock_minimo: Number(reqItem.insumo_stock_minimo)
            });
        }

        descuentosAplicados.push({
            movimiento_id: movRows[0].movimiento_id,
            insumo_producto_id: reqItem.insumo_producto_id,
            insumo_codigo: reqItem.insumo_codigo,
            insumo_nombre: reqItem.insumo_nombre,
            cantidad_descontada: reqItem.cantidad_requerida,
            unidad_medida: reqItem.unidad_medida_codigo,
            stock_resultante: nuevoStockInsumo
        });
    }

    return {
        ok: true,
        tiene_receta: true,
        descuentos: descuentosAplicados,
        alertas_stock: alertasGeneradas
    };
};

const ejecutarDescuentoRecetaEndpoint = async (req, res) => {
    const { id } = req.params;
    const { cantidad_vendida = 1, referencia_venta = null } = req.body;
    const cant = Number(cantidad_vendida);

    if (!Number.isFinite(cant) || cant <= 0) {
        return res.status(400).json({ message: 'La cantidad vendida debe ser mayor a cero (CU 27)' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const resultado = await descontarInsumosRecetaPorVenta(client, {
            productoId: Number(id),
            cantidadVendida: cant,
            usuarioId: req.user?.id || null,
            referenciaVenta: referencia_venta || `Venta de ${cant} unidad(es) de producto ID ${id}`
        });

        if (resultado.ok === false) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: resultado.mensaje,
                insumos_insuficientes: resultado.insumos_insuficientes
            });
        }

        await client.query('COMMIT');
        res.json({
            message: 'Insumos de la receta descontados automáticamente con trazabilidad (CU 27)',
            ...resultado
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al descontar insumos de la receta', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
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
    descontarInsumosRecetaPorVenta,
    ejecutarDescuentoRecetaEndpoint
};
