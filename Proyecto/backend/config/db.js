const { Pool } = require('pg');

// Configuración de la conexión a PostgreSQL mediante variables de entorno (.env)
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kidzania_db',
    max: 10
});

// Verificación de conexión inicial
pool.connect()
    .then(client => {
        console.log(`Conexión exitosa a la base de datos PostgreSQL: ${process.env.DB_NAME || 'kidzania_db'}`);
        client.release();
    })
    .catch(err => {
        console.error('Error conectando a la base de datos:', err.message);
    });

module.exports = pool;
