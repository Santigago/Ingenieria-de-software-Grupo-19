# Base de Datos - Grupo 19 (PostgreSQL)

Directorio reservado para los esquemas SQL definitivos (DDL, DML y migraciones) del proyecto para KidZania Santiago, una vez definidos en el Documento 0 e Incremento 1.

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
