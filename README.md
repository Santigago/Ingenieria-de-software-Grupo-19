# Ingenieria-de-software-Grupo-19 - Entrega del Sistema

Repositorio oficial del **Grupo 19** con la entrega completa del sistema de software aplicado a **KidZania Santiago** en el marco del curso de Ingeniería de Software (IDS).

> **Nota de Entrega:** La documentación completa del proyecto (Documento 0, Incremento 1, Incremento 2, Incremento 3 e Incremento 4) se entrega de forma centralizada mediante el enlace oficial de Google Drive según las instrucciones de entrega. Este repositorio Git contiene el código fuente completo del sistema, las vistas, los controladores, las rutas y la base de datos con sus respectivos scripts DDL y DML.

---

## 🏛️ Estructura del Repositorio del Sistema

```text
.
├── Proyecto/                 # Aplicación ejecutable del sistema
│   ├── backend/              # Lógica de servidor (Node.js, Express, controladores, rutas)
│   │   ├── config/           # Conexión a base de datos y migración de esquema
│   │   ├── controladores/    # Controladores REST y lógica de negocio
│   │   ├── middleware/       # Autenticación, JWT y control de roles (RBAC)
│   │   ├── rutas/            # Definición de rutas y endpoints de la API
│   │   └── tests/            # Batería de pruebas unitarias automatizadas
│   ├── frontend/             # Interfaz web cliente
│   │   ├── assets/           # Recursos multimedia e iconos
│   │   ├── css/              # Hojas de estilo y diseño
│   │   ├── js/               # Lógica del cliente y consumo de APIs
│   │   └── vistas/           # 17 vistas HTML de la aplicación
│   ├── base_de_datos/        # Scripts SQL relacionales estructurados (DDL y DML)
│   │   ├── 01_ddl_esquema.sql   # Definición completa del esquema DDL
│   │   ├── 02_dml_datos_iniciales.sql # Inserción de datos maestros y siembra DML
│   │   └── README.md         # Guía de ejecución SQL
│   ├── instalador/           # Asistente y scripts de despliegue para Windows
│   ├── .env.example          # Plantilla de variables de entorno
│   ├── .gitignore            # Exclusiones de Git
│   ├── Dockerfile            # Configuración para despliegue en contenedor
│   ├── migrar_y_sembrar.js   # Script de sincronización y siembra
│   └── package.json          # Dependencias y scripts de prueba
└── README.md                 # Presentación principal del repositorio
```

---

## 📂 Componentes Principales

### 1. Vistas (`Proyecto/frontend/vistas/`)
17 interfaces web HTML correspondientes a todos los módulos funcionales del sistema:
- Autenticación y control de acceso (`v_login.html`, `v_pos_login.html`).
- Terminal táctil de punto de venta Kiosco POS (`v_pos.html`).
- Gestión de inventario, lotes, movimientos, ingresos, salidas y mermas (`v_productos.html`, `v_lotes.html`, `v_movimientos.html`, `v_ingresos.html`, `v_salidas.html`, `v_mermas.html`).
- Proveedores, ubicaciones y unidades de medida (`v_proveedores.html`, `v_ubicaciones.html`, `v_unidades.html`).
- Sistema KDS de cocina y control de salón (`v_cocina.html`, `v_salon.html`).
- Administración de usuarios, turnos y asistencia RRHH (`v_usuarios.html`, `v_asistencia.html`, `v_dashboard.html`).

### 2. Controladores (`Proyecto/backend/controladores/`) y Rutas (`Proyecto/backend/rutas/`)
Controladores modulares y endpoints REST que implementan las reglas de negocio, validaciones, transacciones ACID y control de acceso basado en roles (RBAC).

### 3. Base de Datos (`Proyecto/base_de_datos/`)
- **`01_ddl_esquema.sql` / `DDL_esquema_completo.sql`**: Definición DDL de tablas, tipos enumerados, claves foráneas, restricciones de integridad e índices.
- **`02_dml_datos_iniciales.sql` / `DML_datos_iniciales.sql`**: Script DML con datos maestros iniciales (usuarios con contraseñas/PINs BCrypt, proveedores, categorías, catálogo de motivos, puestos de venta, catálogo de productos, lotes de inventario inicial, promociones comerciales, turnos y asistencias).

---

## 🚀 Puesta en Marcha Local

### 1. Iniciar PostgreSQL con Docker
```bash
docker run -d --name kidzania-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kidzania_db \
  -p 5432:5432 postgres:16
```

### 2. Configurar Variables de Entorno y Dependencias
```bash
cd Proyecto
cp .env.example .env
npm install
```

### 3. Ejecución y Pruebas
```bash
npm test      # Batería de pruebas unitarias automatizadas
npm start     # Iniciar servidor Express
```
Abrir en el navegador:
- **Administración (Dashboard):** [http://localhost:8080/v_login.html](http://localhost:8080/v_login.html) (`carlos@kidzania.cl` / `1234`)
- **Terminal Táctil POS (Cajeros):** [http://localhost:8080/v_pos_login.html](http://localhost:8080/v_pos_login.html) (Cajero de muestra: `Sofía Rojas` / PIN `1234`)

---

## 👥 Equipo - Grupo 19
- **Asignatura:** Ingeniería de Software (IDS)
- **Caso de Negocio:** KidZania Santiago
