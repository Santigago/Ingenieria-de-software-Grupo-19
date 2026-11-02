# Scripts de Base de Datos - KidZania Santiago (PostgreSQL)

Scripts SQL estructurados para inicializar la base de datos relacional del sistema en PostgreSQL.

---

## 📋 Pasos para Crear la Base de Datos

### 1. Crear la base de datos
Desde la terminal con el usuario `postgres`:
```bash
createdb -U postgres kidzania_db
```
*(O desde `psql`: `CREATE DATABASE kidzania_db;`)*

### 2. Ejecutar los scripts en orden
```bash
psql -U postgres -d kidzania_db -f 01_tipos_enum.sql
psql -U postgres -d kidzania_db -f 02_creacion_tablas.sql
psql -U postgres -d kidzania_db -f 03_insercion_datos.sql
psql -U postgres -d kidzania_db -f 04_ajuste_identidad.sql
```

---

## 🗃️ Detalle de Scripts

| Archivo | Descripción |
| :--- | :--- |
| `01_tipos_enum.sql` | Tipos enumerados de PostgreSQL (estados de cuenta, roles, unidades, estados operativos). |
| `02_creacion_tablas.sql` | Definición DDL de tablas relacionales con llaves primarias, foráneas y restricciones CHECK. |
| `03_insercion_datos.sql` | Carga inicial de datos de prueba (usuarios institucionales `@kidzania.cl`, roles, proveedores, insumos). |
| `04_ajuste_identidad.sql` | Ajuste de secuencias numéricas automáticas (`IDENTITY`). |
| `05_limpieza_tablas.sql` | Script auxiliar para truncar tablas y reiniciar pruebas desde cero. |
