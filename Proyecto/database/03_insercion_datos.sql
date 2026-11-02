-- =============================================================
-- Inserción de Datos Iniciales - Solo Cuenta Administrador
-- =============================================================

INSERT INTO public.rol (rol_id, rol_nombre) VALUES
    (1, 'admin'),
    (2, 'operador_inventario'),
    (3, 'encargado_rrhh'),
    (4, 'supervisor'),
    (5, 'colaborador');

INSERT INTO public.usuario (
    usuario_id,
    usuario_run,
    usuario_apellido_paterno,
    usuario_apellido_materno,
    usuario_nombres,
    usuario_correo,
    usuario_estado_cuenta,
    usuario_contrasena,
    rol_id
) VALUES
    (1, '12345678-9', 'Gonzalez', 'Lopez', 'Carlos', 'carlos@kidzania.cl', 'activo', '1234', 1);
