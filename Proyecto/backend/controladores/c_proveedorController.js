const db = require('../config/db');
const { registrarAuditoria } = require('../config/initDb');

const normalizarRut = (rut) => String(rut || '')
    .trim()
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .toUpperCase();

const tieneFormatoRutValido = (rut) => /^\d{7,8}-[0-9K]$/.test(normalizarRut(rut));

const tieneFormatoCorreoValido = (correo) => {
    if (!correo) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo).trim().toLowerCase());
};

const tieneFormatoTelefonoValido = (tel) => {
    if (!tel) return false;
    return /^[0-9+\-\s()]{7,20}$/.test(String(tel).trim());
};

// CU 6 — Registrar proveedor con identificación, contacto y condiciones comerciales
const crearProveedor = async (req, res) => {
    const {
        rut,
        nombre,
        contacto_nom = null,
        contacto_tel = null,
        contacto_correo = null,
        condiciones_comerciales = null,
        plazo_pago = null,
        modalidad_entrega = null
    } = req.body;

    if (!rut || !nombre) {
        return res.status(400).json({ message: 'Debe indicar RUT y nombre o razón social del proveedor' });
    }

    const rutLimpio = normalizarRut(rut);
    const nombreLimpio = String(nombre).trim();
    const contactoNomLimpio = contacto_nom ? String(contacto_nom).trim() : null;
    const telLimpio = contacto_tel ? String(contacto_tel).trim() : null;
    const correoLimpio = contacto_correo ? String(contacto_correo).trim().toLowerCase() : null;
    const plazoLimpio = plazo_pago ? String(plazo_pago).trim() : null;
    const modalidadLimpia = modalidad_entrega ? String(modalidad_entrega).trim() : null;

    let condicionesLimpias = condiciones_comerciales ? String(condiciones_comerciales).trim() : '';
    if (!condicionesLimpias && (plazoLimpio || modalidadLimpia)) {
        const partes = [];
        if (plazoLimpio) partes.push(`Plazo: ${plazoLimpio}`);
        if (modalidadLimpia) partes.push(`Entrega: ${modalidadLimpia}`);
        condicionesLimpias = partes.join(' · ');
    }

    if (!nombreLimpio) {
        return res.status(400).json({ message: 'El nombre o razón social del proveedor no puede quedar vacío' });
    }

    if (!tieneFormatoRutValido(rutLimpio)) {
        return res.status(400).json({
            message: 'El RUT debe tener formato válido, por ejemplo 76543210-1 o 12345678-K'
        });
    }

    if (!telLimpio || !tieneFormatoTelefonoValido(telLimpio)) {
        return res.status(400).json({
            message: 'Debe ingresar un teléfono de contacto válido para el proveedor'
        });
    }

    if (!correoLimpio || !tieneFormatoCorreoValido(correoLimpio)) {
        return res.status(400).json({
            message: 'Debe ingresar un correo electrónico de contacto con formato válido'
        });
    }

    if (!condicionesLimpias) {
        return res.status(400).json({
            message: 'Debe registrar las condiciones comerciales relevantes del proveedor (plazos de pago, modalidad de entrega o descuentos)'
        });
    }

    try {
        const { rows: existenteRows } = await db.query(
            'SELECT proveedor_id FROM public.proveedor WHERE LOWER(proveedor_rut) = LOWER($1)',
            [rutLimpio]
        );
        if (existenteRows.length > 0) {
            return res.status(400).json({ message: 'El proveedor ya se encuentra registrado con ese RUT' });
        }

        const { rows } = await db.query(`
            INSERT INTO public.proveedor (
                proveedor_rut,
                proveedor_nombre,
                proveedor_nombre_contacto,
                proveedor_telefono_contacto,
                proveedor_correo_contacto,
                proveedor_condiciones_comerciales,
                proveedor_plazo_pago,
                proveedor_modalidad_entrega,
                proveedor_estado,
                proveedor_actualizado_en
            ) VALUES ($1, $2, $3, $4, LOWER($5), $6, $7, $8, 'activo', now())
            RETURNING *
        `, [
            rutLimpio,
            nombreLimpio,
            contactoNomLimpio,
            telLimpio,
            correoLimpio,
            condicionesLimpias,
            plazoLimpio,
            modalidadLimpia
        ]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'creacion_proveedor',
            modulo: 'proveedores',
            accion: 'Registro de nuevo proveedor',
            resultado: 'exitoso',
            detalle: `Proveedor '${nombreLimpio}' (RUT ${rutLimpio}) registrado con condiciones comerciales.`
        });

        res.status(201).json({ message: 'Proveedor registrado correctamente', proveedor: rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar proveedor', error: error.message });
    }
};

// CU 6 — Consultar listado de proveedores existentes y sus vínculos con productos y lotes
const obtenerProveedores = async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                pr.proveedor_id,
                pr.proveedor_rut,
                pr.proveedor_nombre,
                pr.proveedor_nombre_contacto,
                pr.proveedor_telefono_contacto,
                pr.proveedor_correo_contacto,
                pr.proveedor_condiciones_comerciales,
                pr.proveedor_plazo_pago,
                pr.proveedor_modalidad_entrega,
                pr.proveedor_estado,
                pr.proveedor_actualizado_en,
                COUNT(DISTINCT pp.producto_id)::int AS productos_asociados,
                COUNT(DISTINCT l.lote_id)::int AS lotes_registrados,
                COALESCE(
                    ARRAY_AGG(DISTINCT p.producto_nombre) FILTER (WHERE p.producto_nombre IS NOT NULL),
                    ARRAY[]::varchar[]
                ) AS productos_nombres
            FROM public.proveedor pr
            LEFT JOIN public.producto_proveedor pp
                ON pp.proveedor_id = pr.proveedor_id AND pp.estado = 'activo'
            LEFT JOIN public.producto p
                ON p.producto_id = pp.producto_id
            LEFT JOIN public.lote l
                ON l.proveedor_id = pr.proveedor_id
            GROUP BY pr.proveedor_id
            ORDER BY pr.proveedor_nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener proveedores', error: error.message });
    }
};

// CU 6 (Sección B.2 Documento 0): Editar datos de contacto y condiciones comerciales con trazabilidad
const actualizarProveedor = async (req, res) => {
    const { id } = req.params;
    const {
        rut,
        nombre,
        contacto_nom = null,
        contacto_tel = null,
        contacto_correo = null,
        condiciones_comerciales = null,
        plazo_pago = null,
        modalidad_entrega = null
    } = req.body;

    if (!rut || !nombre) {
        return res.status(400).json({ message: 'Debe indicar RUT y nombre o razón social del proveedor' });
    }

    const rutLimpio = normalizarRut(rut);
    const nombreLimpio = String(nombre).trim();
    const contactoNomLimpio = contacto_nom ? String(contacto_nom).trim() : null;
    const telLimpio = contacto_tel ? String(contacto_tel).trim() : null;
    const correoLimpio = contacto_correo ? String(contacto_correo).trim().toLowerCase() : null;
    const plazoLimpio = plazo_pago ? String(plazo_pago).trim() : null;
    const modalidadLimpia = modalidad_entrega ? String(modalidad_entrega).trim() : null;
    const condicionesLimpias = condiciones_comerciales ? String(condiciones_comerciales).trim() : '';

    if (!nombreLimpio) {
        return res.status(400).json({ message: 'El nombre del proveedor no puede quedar vacío' });
    }
    if (!tieneFormatoRutValido(rutLimpio)) {
        return res.status(400).json({ message: 'El RUT debe tener formato válido, por ejemplo 76543210-1 o 12345678-K' });
    }
    if (!telLimpio || !tieneFormatoTelefonoValido(telLimpio)) {
        return res.status(400).json({ message: 'Debe ingresar un teléfono de contacto válido' });
    }
    if (!correoLimpio || !tieneFormatoCorreoValido(correoLimpio)) {
        return res.status(400).json({ message: 'Debe ingresar un correo electrónico de contacto con formato válido' });
    }
    if (!condicionesLimpias) {
        return res.status(400).json({ message: 'Las condiciones comerciales no pueden quedar vacías' });
    }

    try {
        const { rows: previos } = await db.query(
            'SELECT * FROM public.proveedor WHERE proveedor_id = $1',
            [id]
        );
        if (previos.length === 0) {
            return res.status(404).json({ message: 'Proveedor no encontrado' });
        }
        const anterior = previos[0];

        const { rows: dupRows } = await db.query(
            'SELECT proveedor_id FROM public.proveedor WHERE LOWER(proveedor_rut) = LOWER($1) AND proveedor_id <> $2',
            [rutLimpio, id]
        );
        if (dupRows.length > 0) {
            return res.status(400).json({ message: 'Ya existe otro proveedor registrado con ese RUT' });
        }

        const { rows } = await db.query(`
            UPDATE public.proveedor
            SET proveedor_rut = $1,
                proveedor_nombre = $2,
                proveedor_nombre_contacto = $3,
                proveedor_telefono_contacto = $4,
                proveedor_correo_contacto = LOWER($5),
                proveedor_condiciones_comerciales = $6,
                proveedor_plazo_pago = $7,
                proveedor_modalidad_entrega = $8,
                proveedor_actualizado_en = now()
            WHERE proveedor_id = $9
            RETURNING *
        `, [
            rutLimpio,
            nombreLimpio,
            contactoNomLimpio,
            telLimpio,
            correoLimpio,
            condicionesLimpias,
            plazoLimpio,
            modalidadLimpia,
            id
        ]);

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'actualizacion_proveedor',
            modulo: 'proveedores',
            accion: 'Modificación de ficha y condiciones comerciales de proveedor',
            resultado: 'exitoso',
            detalle: `Proveedor #${id} (${anterior.proveedor_nombre} -> ${nombreLimpio}). Tel: ${anterior.proveedor_telefono_contacto || '-'} -> ${telLimpio}. Condiciones actualizadas.`
        });

        res.json({
            message: 'Proveedor actualizado correctamente con trazabilidad',
            proveedor: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar proveedor', error: error.message });
    }
};

// CU 6 (Sección B.2): Inactivar / Activar preservando integridad referencial
const cambiarEstadoProveedor = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({ message: 'Estado no válido' });
    }

    try {
        const { rows: infoRows } = await db.query(`
            SELECT
                pr.proveedor_id,
                pr.proveedor_nombre,
                pr.proveedor_rut,
                COUNT(DISTINCT pp.producto_id)::int AS productos_asociados,
                COUNT(DISTINCT l.lote_id)::int AS lotes_asociados,
                COUNT(DISTINCT m.movimiento_id)::int AS movimientos_asociados
            FROM public.proveedor pr
            LEFT JOIN public.producto_proveedor pp ON pp.proveedor_id = pr.proveedor_id
            LEFT JOIN public.lote l ON l.proveedor_id = pr.proveedor_id
            LEFT JOIN public.movimiento_stock m ON m.proveedor_id = pr.proveedor_id
            WHERE pr.proveedor_id = $1
            GROUP BY pr.proveedor_id
        `, [id]);

        if (infoRows.length === 0) {
            return res.status(404).json({ message: 'Proveedor no encontrado' });
        }

        const prov = infoRows[0];
        await db.query(
            'UPDATE public.proveedor SET proveedor_estado = $1, proveedor_actualizado_en = now() WHERE proveedor_id = $2',
            [estado, id]
        );

        await registrarAuditoria({
            usuario_id: req.user?.id || null,
            actor_usuario_id: req.user?.id || null,
            evento_tipo: 'cambio_estado_proveedor',
            modulo: 'proveedores',
            accion: `Cambio de estado de proveedor a ${estado}`,
            resultado: 'exitoso',
            detalle: `Proveedor '${prov.proveedor_nombre}' (${prov.proveedor_rut}) marcado como ${estado}. Vínculos preservados: ${prov.productos_asociados} productos, ${prov.lotes_asociados} lotes.`
        });

        res.json({
            message: estado === 'inactivo'
                ? `Proveedor marcado como inactivo preservando integridad histórica (${prov.productos_asociados} productos y ${prov.lotes_asociados} lotes asociados).`
                : 'Proveedor reactivado correctamente'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar proveedor', error: error.message });
    }
};

const eliminarProveedor = async (req, res) => {
    req.body.estado = 'inactivo';
    return cambiarEstadoProveedor(req, res);
};

module.exports = {
    crearProveedor,
    obtenerProveedores,
    actualizarProveedor,
    cambiarEstadoProveedor,
    eliminarProveedor
};
