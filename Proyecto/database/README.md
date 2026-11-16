# Base de Datos - Grupo 19 (PostgreSQL)

Scripts SQL de ParkFlow para KidZania Santiago.

## Scripts

| Archivo | Tipo | Contenido |
|---|---|---|
| [`DDL_esquema_completo.sql`](./DDL_esquema_completo.sql) | **DDL** | Esquema completo: tipos ENUM, 35 tablas, claves primarias y foráneas, restricciones CHECK, índices y secuencias. |
| [`DML_datos_iniciales.sql`](./DML_datos_iniciales.sql) | **DML** | Datos iniciales: roles, usuarios de prueba, los 7 puestos de venta oficiales, unidades de medida, ubicaciones, proveedores, 11 productos con sus lotes, promociones, catálogo de motivos y turnos. |
| [`01_esquema_inicial.sql`](./01_esquema_inicial.sql) | DDL (migración) | Script idempotente (`IF NOT EXISTS`) que el servidor ejecuta automáticamente al arrancar (`backend/config/initDb.js`). No es necesario correrlo a mano. |

### Crear la base a mano (DDL + DML)

```bash
createdb -U postgres kidzania_db
psql -U postgres -d kidzania_db -f DDL_esquema_completo.sql
psql -U postgres -d kidzania_db -f DML_datos_iniciales.sql
```

> El DML se ejecuta **después** del DDL y sobre una base vacía.

### Crear la base automáticamente

Con la base vacía creada, basta con arrancar el servidor (`npm start`) o ejecutar `node migrar_y_sembrar.js`: el sistema aplica `01_esquema_inicial.sql` y siembra los mismos datos iniciales.

---

## 🐳 Base de Datos Local con Docker

Para pruebas locales de la aplicación, PostgreSQL se ejecuta en Docker:

```bash
docker run -d --name kidzania-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kidzania_db \
  -p 5432:5432 postgres:16
```

> [!TIP]
> Si el contenedor ya fue creado y está detenido, puedes reactivarlo con:
> ```bash
> docker start kidzania-postgres
> ```

---

## 🔑 Cuenta Administrador Inicial

- **Correo institucional:** `carlos@kidzania.cl`
- **Contraseña:** `1234`
- **Rol:** `admin` (acceso a todos los módulos)
