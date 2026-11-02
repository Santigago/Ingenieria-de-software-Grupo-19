const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend estático
const frontendDir = path.join(__dirname, '../frontend');
app.use(express.static(frontendDir));
app.use('/views', express.static(path.join(frontendDir, 'views')));
app.use('/js', express.static(path.join(frontendDir, 'js')));

// Redirigir la raíz al login
app.get('/', (req, res) => {
    res.redirect('/v_login.html');
});

// Rutas funcionales de la API
app.use('/api/auth', require('./routes/c_auth'));
app.use('/api/dashboard', require('./routes/c_dashboard'));
app.use('/api/admin/usuarios', require('./routes/c_usuarios'));
app.use('/api/mesas', require('./routes/c_mesas'));
app.use('/api/productos', require('./routes/c_productos'));
app.use('/api/lotes', require('./routes/c_lotes'));
app.use('/api/proveedores', require('./routes/c_proveedores'));
app.use('/api/movimientos', require('./routes/c_movimientos'));
app.use('/api/unidades', require('./routes/c_unidades'));
app.use('/api/ubicaciones', require('./routes/c_ubicaciones'));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'API operativa - Grupo 19 Demo' });
});

const PORT = process.env.PORT || 8080;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor operativo en puerto ${PORT}: http://localhost:${PORT}/v_login.html`);
    });
}

module.exports = app;
