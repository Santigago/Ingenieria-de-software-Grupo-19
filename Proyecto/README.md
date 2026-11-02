# Módulo de Código - Grupo 19

Este directorio contiene todo el código fuente del proyecto.

---

## 🏗️ Arquitectura de Código

Estructura separada limpiamente en frontend, backend, y base de datos:

```text
Proyecto/
├── backend/
│   ├── config/              # Conexión a base de datos y variables de entorno
│   ├── controllers/         # Controladores y lógica de negocio
│   ├── middleware/          # Autenticación, JWT y control de roles (RBAC)
│   └── routes/              # Definición de rutas y endpoints de la API REST
│
├── frontend/
│   ├── assets/              # Recursos multimedia (imágenes, iconos, logos)
│   ├── css/                 # Hojas de estilo y diseño
│   ├── js/                  # Lógica del lado del cliente y consumo de APIs
│   └── views/               # Plantillas y vistas HTML de la aplicación
│
├── database/                # Scripts SQL y migraciones
│   └── README.md            # Guía de ejecución de scripts
│
├── .env.example             # Plantilla de variables de entorno
├── .gitignore               # Exclusión de dependencias locales y archivos sensibles
├── Dockerfile               # Configuración para despliegue en contenedor
└── package.json             # Manifiesto de dependencias Node.js
```

---

## 🚀 Puesta en Marcha Local

### 1. Iniciar Base de Datos con Docker
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

### 3. Instalación de Dependencias y Ejecución
```bash
npm install
npm start
```
Abrir en el navegador: [http://localhost:8080/v_login.html](http://localhost:8080/v_login.html)

### 4. Credenciales de Administrador Inicial
- **Correo:** `carlos@kidzania.cl`
- **Contraseña:** `1234`
- **Rol:** `admin`
