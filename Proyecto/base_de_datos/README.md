# Base de Datos PostgreSQL - ParkFlow KidZania

Directorio oficial con los scripts DDL y DML estructurados para la persistencia del sistema de gestión operativa y comercial.

---

## 📁 Contenido del Directorio

- **`01_ddl_esquema.sql`**: Script DDL que crea todos los tipos enumerados, tablas relacionales, llaves primarias, llaves foráneas, restricciones de integridad (`CHECK`, `UNIQUE`), secuencias e índices del modelo de datos de KidZania Santiago.
- **`02_dml_datos_iniciales.sql`**: Script DML que siembra los datos maestros iniciales requeridos para la operación del sistema:
  - Roles oficiales y usuarios con credenciales y PINs cifrados en BCrypt.
  - Unidades de medida y ubicaciones de bodega.
  - Proveedores y categorías de productos.
  - Catálogo de motivos oficiales para movimientos de inventario y mermas.
  - Puestos de venta oficiales de KidZania.
  - Catálogo de productos con costos, precios y configuración de cocina.
  - Lotes de stock inicial con fechas de recepción y vencimiento.
  - Promociones y cupones comerciales vigentes.
  - Turnos planificados y registros de asistencia demostrativos.

---

## 🚀 Ejecución de Scripts SQL

### Opción 1: Mediante cliente `psql` (Docker o Local)

```bash
# 1. Ejecutar DDL (Estructura y Esquema)
psql -h localhost -p 5432 -U postgres -d kidzania_db -f 01_ddl_esquema.sql

# 2. Ejecutar DML (Datos Maestros e Iniciales)
psql -h localhost -p 5432 -U postgres -d kidzania_db -f 02_dml_datos_iniciales.sql
```

### Opción 2: Automática mediante Node.js
Al iniciar el servidor (`npm start`) o ejecutar `node migrar_y_sembrar.js`, el inicializador valida y sincroniza el esquema automáticamente.

---

## 🔑 Credenciales de Acceso Sembradas

- **Administrador:** `carlos@kidzania.cl` / `1234`
- **Operador de Inventario:** `inventario@kidzania.cl` / `1234`
- **Encargado RRHH:** `rrhh@kidzania.cl` / `1234`
- **Supervisor de Turno:** `supervisor@kidzania.cl` / `1234`
- **Cajero POS:** `sofia.rojas@kidzania.cl` / Contraseña `1234` / PIN `1234`
- **Cocina KDS:** `matias.morales@kidzania.cl` / Contraseña `1234` / PIN `5678`
