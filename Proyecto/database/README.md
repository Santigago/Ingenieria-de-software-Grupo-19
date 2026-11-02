# Scripts de Base de Datos - Demo Funcional (PostgreSQL)

Scripts SQL necesarios para inicializar la base de datos de la demo funcional temporal importada del proyecto anterior.

---

## 📋 Orden de Ejecución en PostgreSQL

Para inicializar la base de datos localmente:

```bash
# 1. Crear base de datos
createdb -U postgres brewflow_db

# 2. Ejecutar scripts en orden
psql -U postgres -d brewflow_db -f "BrewFlow - Tipos de ENUM.sql"
psql -U postgres -d brewflow_db -f "BrewFlow - Creacion de Tablas.sql"
psql -U postgres -d brewflow_db -f "BrewFlow - Insercion de Datos.sql"
psql -U postgres -d brewflow_db -f "BrewFlow - Ajuste de identidad.sql"
```

---

## 🗃️ Archivos Incluidos

- `BrewFlow - Tipos de ENUM.sql`: Tipos enumerados de estados y roles.
- `BrewFlow - Creacion de Tablas.sql`: Esquema DDL con llaves foráneas y checks.
- `BrewFlow - Insercion de Datos.sql`: Datos semilla iniciales (usuarios, productos, lotes).
- `BrewFlow - Ajuste de identidad.sql`: Configuración de secuencias numéricas.
- `BrewFlow - Limpieza de Tablas.sql`: Script de truncado para reinicio rápido de pruebas.
