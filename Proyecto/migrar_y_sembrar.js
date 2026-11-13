const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./backend/config/db');
const { initDatabase } = require('./backend/config/initDb');

async function main() {
    console.log('🚀 ========================================================');
    console.log('   PARKFLOW - KIDZANIA SANTIAGO (GRUPO 19)');
    console.log('   MIGRACIÓN Y SEMILLA DE DATOS COMPLETA');
    console.log('========================================================\n');

    try {
        await initDatabase();

        // Verificar datos sembrados
        const { rows: prods } = await db.query('SELECT COUNT(*)::int AS count FROM public.producto WHERE producto_estado = \'activo\'');
        const { rows: puestos } = await db.query('SELECT COUNT(*)::int AS count FROM public.puesto_venta WHERE puesto_estado = \'activo\'');
        const { rows: lotes } = await db.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(lote_cantidad_disponible), 0)::numeric AS stock_total FROM public.lote');
        const { rows: promos } = await db.query('SELECT COUNT(*)::int AS count FROM public.promocion WHERE estado = \'activo\'');
        const { rows: usuarios } = await db.query('SELECT COUNT(*)::int AS count FROM public.usuario');

        console.log('\n📊 ESTADO DEL SISTEMA TRAS LA INICIALIZACIÓN:');
        console.log(`   • Usuarios registrados:      ${usuarios[0]?.count || 0}`);
        console.log(`   • Puestos de venta activos:   ${puestos[0]?.count || 0} (7 oficiales KidZania)`);
        console.log(`   • Productos en catálogo:      ${prods[0]?.count || 0} artículos (Comida y Merch)`);
        console.log(`   • Lotes y Stock disponible:   ${lotes[0]?.count || 0} lotes (${lotes[0]?.stock_total || 0} unidades físicas)`);
        console.log(`   • Promociones comerciales:    ${promos[0]?.count || 0} cupones activos (CU 22)`);
        console.log('\n✅ ¡Base de datos poblada y lista para operar!');
        console.log('   Puede iniciar o reiniciar su servidor con: npm start');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error durante la migración y siembra de datos:', error);
        process.exit(1);
    }
}

main();

