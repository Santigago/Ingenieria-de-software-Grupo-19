const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initDatabase } = require('./config/initDb');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar y migrar esquema de base de datos al iniciar la aplicación
initDatabase();

// Directorios de frontend
const frontendDir = path.join(__dirname, '../frontend');
const vistasDir = path.join(frontendDir, 'vistas');
const jsDir = path.join(frontendDir, 'js');

// Servir vistas estáticas (accesibles en /vistas/..., /views/... y en la raíz /...)
app.use(express.static(vistasDir));
app.use('/vistas', express.static(vistasDir));
app.use('/views', express.static(vistasDir));

// Servir scripts estáticos (accesibles en /js/... y en la raíz)
app.use('/js', express.static(jsDir));
app.use(express.static(jsDir));
app.use(express.static(frontendDir));

// Redirigir la raíz al login
app.get('/', (req, res) => {
    res.redirect('/v_login.html');
});

// Rutas funcionales de la API
app.use('/api/auth', require('./rutas/c_auth'));
app.use('/api/dashboard', require('./rutas/c_dashboard'));
app.use('/api/admin/usuarios', require('./rutas/c_usuarios'));
app.use('/api/mesas', require('./rutas/c_mesas'));
app.use('/api/puestos', require('./rutas/c_puestos'));
app.use('/api/cajas', require('./rutas/c_cajas'));
app.use('/api/productos', require('./rutas/c_productos'));
app.use('/api/lotes', require('./rutas/c_lotes'));
app.use('/api/proveedores', require('./rutas/c_proveedores'));
app.use('/api/movimientos', require('./rutas/c_movimientos'));
app.use('/api/unidades', require('./rutas/c_unidades'));
app.use('/api/ubicaciones', require('./rutas/c_ubicaciones'));
app.use('/api/boletas', require('./rutas/c_boletas'));
app.use('/api/sap', require('./rutas/c_sap'));
app.use('/api/promociones', require('./rutas/c_promociones'));
app.use('/api/cocina', require('./rutas/c_cocina'));
app.use('/api/pedidos', require('./rutas/c_pedidos'));
app.use('/api/rrhh', require('./rutas/c_rrhh'));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'API operativa' });
});

const PORT = process.env.PORT || 8080;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor operativo en puerto ${PORT}: http://localhost:${PORT}/v_login.html`);
    });
}

module.exports = app;
