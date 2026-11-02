# Ingenieria-de-software-Grupo-19

Repositorio oficial del **Grupo 19** para el desarrollo del proyecto de software aplicado a **KidZania Santiago** en el marco del curso de Ingeniería de Software (IDS).

---

## 🏛️ Estructura del Repositorio

El repositorio mantiene una estricta separación de responsabilidades en su raíz:

```text
.
├── Documentos/               # Todos los archivos y entregables del proyecto de software
│   ├── Documento_0/      
│   ├── Incremento_1/      
│   ├── Incremento_2/
│   ├── ...
│   └── Recursos/             
│
├── Proyecto/                 # Todos los archivos de código del proyecto de software
│   ├── backend/              # Lógica de servidor (Node.js, Express, controladores, rutas)
│   ├── frontend/             # Interfaz web (vistas HTML, estilos CSS, scripts JS, assets)
│   ├── database/             # Scripts SQL y esquemas relacionales
│   ├── .env.example          # Plantilla de variables de entorno
│   ├── .gitignore            # Exclusiones de Git para el código fuente
│   ├── Dockerfile            # Configuración para despliegue
│   └── package.json          # Dependencias y scripts de ejecución
│
└── README.md                 # Presentación principal del repositorio
```

---

## 📂 Directorios Principales

### 1. [`Documentos/`](./Documentos/)
Documentos y diagramas del proyecto:
- **Documento 0**: Diagramas de casos de uso (DCU), modelos BPMN de procesos operativos, carta de aceptación y análisis de gestión.
- **Incremento 1**: Modelo conceptual/lógico (MERE), esquema físico de base de datos, arquitectura de componentes, árbol de navegación y videos demostrativos.
- **Incremento 2**: Refinamiento de modelos, casos de prueba y entregables finales.
- **Recursos**: Plantillas y directrices metodológicas.

### 2. [`Proyecto/`](./Proyecto/)
Módulo ejecutable del software:
- **`backend/`**: API REST construida sobre Express, con autenticación, middlewares de seguridad y controladores modulares.
- **`frontend/`**: Vistas web y cliente estático estructurado por módulos.
- **`database/`**: Scripts estructurados para base de datos PostgreSQL.

---

## 🚀 Inicio Rápido del Proyecto

Para ejecutar la aplicación localmente:

1. **Iniciar PostgreSQL con Docker:**
   ```bash
   docker run -d --name kidzania-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kidzania_db -p 5432:5432 postgres:16
   ```

2. **Ingresar a la carpeta del proyecto y configurar `.env`:**
   ```bash
   cd Proyecto
   cp .env.example .env
   ```

3. **Instalar dependencias y ejecutar:**
   ```bash
   npm install
   npm start
   ```
   Abrir en el navegador:
   - **Administración (Dashboard):** [http://localhost:8080/v_login.html](http://localhost:8080/v_login.html) (`carlos@kidzania.cl` / `1234`)
   - **Terminal Táctil POS (Cajeros):** [http://localhost:8080/v_pos_login.html](http://localhost:8080/v_pos_login.html) (Selección táctil + PIN `1234`)


---

## 👥 Equipo - Grupo 19
- **Asignatura:** Ingeniería de Software (IDS)
- **Caso de Negocio:** KidZania Santiago
