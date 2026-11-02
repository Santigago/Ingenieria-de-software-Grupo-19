# Scripts de Base de Datos - KidZania Santiago (PostgreSQL)

Scripts SQL estructurados para inicializar la base de datos relacional del sistema en PostgreSQL.

---

## 📋 Pasos para Iniciar la Base de Datos con Docker

### 1. Iniciar el contenedor de PostgreSQL
Ejecuta el siguiente comando para levantar PostgreSQL en Docker con la base de datos `kidzania_db`:

```bash
docker run -d --name kidzania-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kidzania_db \
  -p 5432:5432 postgres:16
```

> [!TIP]
> Si el contenedor ya existe y está detenido, puedes iniciarlo con: `docker start kidzania-postgres`

### 2. Ejecutar los scripts en orden
Desde el directorio `Proyecto/database/`:

```bash
cd Proyecto/database

PGPASSWORD=postgres psql -h localhost -U postgres -d kidzania_db -f 01_tipos_enum.sql
PGPASSWORD=postgres psql -h localhost -U postgres -d kidzania_db -f 02_creacion_tablas.sql
PGPASSWORD=postgres psql -h localhost -U postgres -d kidzania_db -f 03_insercion_datos.sql
PGPASSWORD=postgres psql -h localhost -U postgres -d kidzania_db -f 04_ajuste_identidad.sql
```

---

## 🗃️ Detalle de Scripts

| Archivo | Descripción |
| :--- | :--- |
| `01_tipos_enum.sql` | Tipos enumerados de PostgreSQL (estados de cuenta, roles, unidades, estados operativos). |
| `02_creacion_tablas.sql` | Definición DDL de tablas relacionales con llaves primarias, foráneas y restricciones CHECK. |
| `03_insercion_datos.sql` | Carga inicial de datos: define roles y crea la cuenta **administrador inicial**. |
| `04_ajuste_identidad.sql` | Ajuste de secuencias numéricas automáticas (`IDENTITY`). |
| `05_limpieza_tablas.sql` | Script auxiliar para truncar tablas y reiniciar pruebas desde cero. |

---

## 🔑 Cuenta Administrador Inicial

- **Correo institucional:** `carlos@kidzania.cl`
- **Contraseña:** `1234`
- **Rol:** `admin` (acceso a todos los módulos)
