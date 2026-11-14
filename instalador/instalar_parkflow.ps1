# ============================================================
#  Instalador ParkFlow (Grupo 19) para un PC Windows sin nada
#  Instala Git, Node.js LTS y PostgreSQL 18 con winget,
#  clona el repo, crea la base, configura .env y arranca.
# ============================================================
$ErrorActionPreference = 'Stop'
$Repo    = 'https://github.com/Santigago/Ingenieria-de-software-Grupo-19.git'
$Destino = Join-Path $env:USERPROFILE 'ParkFlow'
$PgPass  = 'postgres'
$DbName  = 'kidzania_db'
$Puerto  = 8080

function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK: $t" -ForegroundColor Green }
function Refrescar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path','User')
}
function Instalar($id, $override) {
    $ErrorActionPreference = 'Continue'
    $lista = winget list --id $id -e --accept-source-agreements 2>$null | Out-String
    $ErrorActionPreference = 'Stop'
    if ($lista -match [regex]::Escape($id)) { Ok "$id ya estaba instalado"; return }
    Write-Host "    Instalando $id (puede pedir permiso de administrador)..."
    $a = @('install','--id',$id,'-e','--source','winget','--accept-package-agreements','--accept-source-agreements')
    if ($override) { $a += @('--override', $override) } else { $a += '--silent' }
    winget @a
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "No se pudo instalar $id (codigo $LASTEXITCODE)" }
    Ok "$id instalado"
}

try {
    Paso 'Revisando winget'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Falta winget. Abre Microsoft Store, busca "Instalador de aplicacion" (App Installer), actualizalo y vuelve a ejecutar.'
    }
    Ok 'winget disponible'

    Paso 'Instalando programas'
    Instalar 'Git.Git'
    Instalar 'OpenJS.NodeJS.LTS'
    Refrescar-Path

    Paso 'Preparando PostgreSQL 18 (propio de ParkFlow)'
    $pgDir = 'C:\Program Files\PostgreSQL\18'
    $servicio = Get-Service 'postgresql-x64-18' -ErrorAction SilentlyContinue
    if ($servicio) {
        # Ya hay un PostgreSQL 18 instalado: leer su puerto desde postgresql.conf
        $PgPort = 5432
        $conf = @(Get-ChildItem 'C:\ParkFlowPG' -Recurse -Filter postgresql.conf -ErrorAction SilentlyContinue) +
                @(Get-ChildItem $pgDir -Recurse -Filter postgresql.conf -ErrorAction SilentlyContinue) | Select-Object -First 1
        if ($conf) {
            $linea = Select-String -Path $conf.FullName -Pattern '^\s*port\s*=\s*(\d+)' | Select-Object -First 1
            if ($linea) { $PgPort = [int]$linea.Matches[0].Groups[1].Value }
        }
        if ($servicio.Status -ne 'Running') { Start-Service $servicio.Name -ErrorAction SilentlyContinue }
        Ok "PostgreSQL 18 ya estaba instalado (puerto $PgPort)"
    } else {
        # Buscar un puerto libre: en algunos PC el 5432 ya lo usa otro PostgreSQL o Docker
        $PgPort = $null
        foreach ($p in 5432..5450) {
            if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { $PgPort = $p; break }
        }
        if (-not $PgPort) { throw 'No encontre un puerto libre entre 5432 y 5450 para PostgreSQL.' }
        # Carpeta de datos SIN espacios (PowerShell 5.1 rompe las comillas internas al llamar a winget)
        $datos = 'C:\ParkFlowPG\data'
        $n = 2
        while ((Test-Path $datos) -and (Get-ChildItem $datos -Force -ErrorAction SilentlyContinue)) { $datos = "C:\ParkFlowPG\data$n"; $n++ }
        Write-Host "    Se usara el puerto $PgPort y la carpeta de datos $datos"
        Instalar 'PostgreSQL.PostgreSQL.18' "--mode unattended --unattendedmodeui minimal --superpassword $PgPass --serverport $PgPort --datadir $datos"
        Ok "PostgreSQL 18 en el puerto $PgPort"
    }

    $psqlExe = Join-Path $pgDir 'bin\psql.exe'
    if (-not (Test-Path $psqlExe)) { throw "No encontre $psqlExe. Reinicia el PC y vuelve a ejecutar." }
    function Psql { & $psqlExe -U postgres -h localhost -p $PgPort @args }
    $baseNueva = $false
    $env:PGPASSWORD = $PgPass
    $existe = $null
    $ErrorActionPreference = 'Continue'
    for ($i = 0; $i -lt 10; $i++) {
        $existe = Psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 3
    }
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) {
        throw "No pude entrar a PostgreSQL 18 (puerto $PgPort) con el usuario postgres. Si ya estaba instalado con otra clave, cambia `$PgPass al inicio de este script."
    }
    if ("$existe".Trim() -ne '1') {
        Psql -d postgres -c "CREATE DATABASE $DbName" | Out-Null
        $baseNueva = $true
        Ok "base $DbName creada"
    } else {
        $tablas = Psql -d $DbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
        if ("$tablas".Trim() -eq '0') { $baseNueva = $true; Ok "base $DbName existia vacia; se cargaran los datos" }
        else { Ok "base $DbName ya existia" }
    }

    Paso 'Descargando el codigo (si pide iniciar sesion en GitHub, entra con tu cuenta)'
    if (Test-Path (Join-Path $Destino '.git')) {
        git -C $Destino pull --ff-only
    } else {
        git clone $Repo $Destino
    }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar el repo. Revisa que tu cuenta de GitHub tenga acceso.' }
    Ok "codigo en $Destino"

    Paso 'Cargando la base de datos con los datos del proyecto'
    $dump = Join-Path $Destino 'instalador\kidzania_db.sql'
    if ($baseNueva -and (Test-Path $dump)) {
        $ErrorActionPreference = 'Continue'
        Psql -d $DbName -q -v ON_ERROR_STOP=1 -f $dump | Out-Null
        $codigo = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($codigo -ne 0) { throw 'No se pudo cargar kidzania_db.sql en la base.' }
        Ok 'datos cargados (productos, ventas, boletas, comandas, usuarios)'
    } elseif (-not $baseNueva) {
        Ok "la base $DbName ya existia; no se reemplazaron sus datos"
    } else {
        Ok 'no hay respaldo; el sistema creara datos de ejemplo al arrancar'
    }

    Paso 'Configurando .env'
    $proy = Join-Path $Destino 'Proyecto'
    $envFile = Join-Path $proy '.env'
    # Puerto web: 8080 si esta libre, si no el siguiente libre
    foreach ($p in 8080..8099) {
        if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { $Puerto = $p; break }
    }
    if (Test-Path $envFile) {
        $txt = Get-Content $envFile -Raw
    } else {
        $txt = Get-Content (Join-Path $proy '.env.example') -Raw
        $secreto = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
        $txt = $txt -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secreto"
    }
    $txt = $txt -replace '(?m)^PORT=.*$', "PORT=$Puerto"
    $txt = $txt -replace '(?m)^DB_HOST=.*$', 'DB_HOST=localhost'
    $txt = $txt -replace '(?m)^DB_PORT=.*$', "DB_PORT=$PgPort"
    $txt = $txt -replace '(?m)^DB_USER=.*$', 'DB_USER=postgres'
    $txt = $txt -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$PgPass"
    $txt = $txt -replace '(?m)^DB_NAME=.*$', "DB_NAME=$DbName"
    [IO.File]::WriteAllText($envFile, $txt)
    Ok ".env listo (web en puerto $Puerto, base en puerto $PgPort)"

    Paso 'Instalando dependencias de Node'
    Push-Location $proy
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Fallo npm install' }
    Pop-Location
    Ok 'dependencias listas'

    Paso 'Creando acceso directo "Iniciar ParkFlow" en el Escritorio'
    $bat = Join-Path $Destino 'Iniciar ParkFlow.bat'
    @"
@echo off
title ParkFlow - no cierres esta ventana
cd /d "$proy"
start "" cmd /c "timeout /t 6 >nul & start http://localhost:$Puerto/v_pos_login.html"
node backend\server.js
pause
"@ | Set-Content -Path $bat -Encoding ASCII
    $escritorio = [Environment]::GetFolderPath('Desktop')
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut((Join-Path $escritorio 'Iniciar ParkFlow.lnk'))
    $lnk.TargetPath = $bat; $lnk.WorkingDirectory = $proy; $lnk.Save()
    $lnk2 = $ws.CreateShortcut((Join-Path $escritorio 'Maquetas ParkFlow.lnk'))
    $lnk2.TargetPath = (Join-Path $Destino 'Documentos\Maquetas\index.html'); $lnk2.Save()
    Ok 'accesos directos creados'

    Paso 'Arrancando ParkFlow'
    Start-Process $bat
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' LISTO. En unos segundos se abre el navegador.'              -ForegroundColor Green
    Write-Host "  POS:      http://localhost:$Puerto/v_pos_login.html"
    Write-Host "  Oficina:  http://localhost:$Puerto/v_login.html"
    Write-Host "  Maquetas: $Destino\Documentos\Maquetas\index.html"
    Write-Host '  Usuarios y claves de prueba: Proyecto\README.md'
    Write-Host '  Proxima vez: doble clic en "Iniciar ParkFlow" del Escritorio.'
    Write-Host '============================================================' -ForegroundColor Green
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Si acaba de instalar programas, reinicia el PC y vuelve a ejecutar el instalador.' -ForegroundColor Yellow
}
Read-Host "`nPresiona Enter para cerrar"
