# Módulo de Código - KidZania Santiago

Este directorio contiene todo el código fuente del sistema de gestión operativa y comercial.

---

## 🏗️ Arquitectura de Código

Estructura modular en capas (Frontend, Backend y Base de Datos):

```text
Proyecto/
├── backend/
│   ├── config/              # Conexión a base de datos y sincronización de esquema
│   ├── controladores/       # Controladores REST y lógica de negocio
│   ├── middleware/          # Autenticación, JWT y control de roles (RBAC)
│   ├── rutas/               # Definición de rutas y endpoints de la API REST
│   └── tests/               # Batería de pruebas unitarias automatizadas
│
├── frontend/
│   ├── assets/              # Recursos multimedia (imágenes, iconos, logos)
│   ├── css/                 # Hojas de estilo y diseño
│   ├── js/                  # Lógica del lado del cliente y consumo de APIs
│   └── vistas/              # Plantillas y vistas HTML de la aplicación
│
├── base_de_datos/           # Scripts SQL estructurados (DDL y DML)
│   ├── 01_ddl_esquema.sql   # Definición de tablas, tipos y restricciones DDL
│   ├── 02_dml_datos_iniciales.sql # Datos maestros y siembra inicial DML
│   └── README.md            # Guía de ejecución de scripts SQL
│
├── .env.example             # Plantilla de variables de entorno
├── .gitignore               # Exclusión de dependencias locales y archivos sensibles
├── Dockerfile               # Configuración para despliegue en contenedor
├── migrar_y_sembrar.js      # Script de inicialización y verificación de base de datos
└── package.json             # Manifiesto de dependencias y scripts de prueba
```

---

## 🚀 Puesta en Marcha Local

### 1. Iniciar Base de Datos con Docker

Esta receta usa PostgreSQL 16 como opción de desarrollo. El instalador de Windows del repositorio instala PostgreSQL 18; conserva una sola instancia/base configurada por `Proyecto/.env` para cada ejecución.
```bash
docker run -d --name kidzania-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kidzania_db \
  -p 5432:5432 postgres:16
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` como `.env` y ajusta según tu entorno:
```bash
cp .env.example .env
```

### 3. Instalación de Dependencias, Migración y Ejecución
```bash
npm install
npm test      # Ejecutar pruebas unitarias automatizadas
npm start     # Iniciar servidor Express
```
Abrir en el navegador: [http://localhost:8080/v_login.html](http://localhost:8080/v_login.html)

### 4. Accesos de demostración

#### A. Acceso Administrativo (Dashboard)
- **Ruta:** [http://localhost:8080/v_login.html](http://localhost:8080/v_login.html)
- **Correo:** `carlos@kidzania.cl`
- **Contraseña:** `1234` (credencial sembrada solo para demostración local; cambiar antes de desplegar)
- **Rol:** `admin` (acceso completo a configuración, métricas y dashboard de gestión)

#### B. Terminal Táctil POS (Cajeros / Colaboradores)
- **Ruta:** [http://localhost:8080/v_pos_login.html](http://localhost:8080/v_pos_login.html)
- **Mecanismo:** Selector táctil de colaboradores registrados en pantalla + ingreso de PIN de 4 dígitos mediante numpad en pantalla o teclado físico.
- **Cajero de Muestra:** `Sofía Rojas` (PIN de desarrollo: `1234`; cambiar antes de desplegar)
- **Destino tras autenticación:** Terminal Kiosco POS ([`v_pos.html`](./frontend/vistas/v_pos.html)).
- **Seguridad y Control de Roles:** Las vistas permitidas y acciones se definen en `backend/middleware/authMiddleware.js`. El cajero inicia en POS; el personal de oficina accede a módulos según su rol.

### 5. Vistas y Controladores

La versión contiene 17 vistas HTML en `frontend/vistas/`. Los controladores REST se encuentran organizados en `backend/controladores/` y las rutas en `backend/rutas/`. El Informe de Incremento 1 incluye los renders de autenticación e inventario; el Informe de Incremento 2, POS, cajas, dashboard, cocina, salón y RRHH. Las capturas usan fixtures y documentan la interfaz; consulta `Documentos/Evidencias_Vistas/`.
