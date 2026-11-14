# Instalador ParkFlow para Windows

Para un PC sin nada instalado.

1. Descarga **los dos archivos** de esta carpeta (`INSTALAR (doble clic).bat` e `instalar_parkflow.ps1`) en una misma carpeta.
2. Doble clic en `INSTALAR (doble clic).bat`. Si aparece "Windows protegió su PC": *Más información → Ejecutar de todas formas*.
3. Acepta los permisos de administrador y, cuando se abra el navegador, inicia sesión en GitHub.

Instala Git, Node.js LTS y PostgreSQL 18 (winget), crea la base `kidzania_db` y carga `kidzania_db.sql` (los datos del proyecto: productos, ventas, boletas, comandas y usuarios de prueba), clona el repo en `%USERPROFILE%\ParkFlow`, genera `Proyecto/.env`, ejecuta `npm install` y deja los accesos directos **Iniciar ParkFlow** y **Maquetas ParkFlow** en el Escritorio.
