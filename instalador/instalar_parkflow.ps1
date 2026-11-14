# ============================================================
#  Instalador ParkFlow (Grupo 19) para un PC Windows sin nada
#  Instala Git, Node.js LTS y PostgreSQL 16 con winget,
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
    $a = @('install','--id',$id,'-e','--accept-package-agreements','--accept-source-agreements')
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
    Instalar 'PostgreSQL.PostgreSQL.16' "--mode unattended --unattendedmodeui minimal --superpassword $PgPass --serverport 5432"
    Refrescar-Path

    Paso 'Preparando PostgreSQL'
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $psql) { throw 'No encontre psql.exe en C:\Program Files\PostgreSQL. Reinicia el PC y vuelve a ejecutar.' }
    Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Where-Object Status -ne 'Running' | Start-Service -ErrorAction SilentlyContinue
    $env:PGPASSWORD = $PgPass
    $existe = $null
    $ErrorActionPreference = 'Continue'
    for ($i = 0; $i -lt 10; $i++) {
        $existe = & $psql.FullName -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 3
    }
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) {
        throw "No pude entrar a PostgreSQL con el usuario postgres. Si PostgreSQL ya estaba instalado con otra clave, cambia `$PgPass al inicio de este script."
    }
    if ("$existe".Trim() -ne '1') {
        & $psql.FullName -U postgres -h localhost -c "CREATE DATABASE $DbName" | Out-Null
        Ok "base $DbName creada"
    } else { Ok "base $DbName ya existia" }

    Paso 'Descargando el codigo (si pide iniciar sesion en GitHub, entra con tu cuenta)'
    if (Test-Path (Join-Path $Destino '.git')) {
        git -C $Destino pull --ff-only
    } else {
        git clone $Repo $Destino
    }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar el repo. Revisa que tu cuenta de GitHub tenga acceso.' }
    Ok "codigo en $Destino"

    Paso 'Configurando .env'
    $proy = Join-Path $Destino 'Proyecto'
    $envFile = Join-Path $proy '.env'
    if (-not (Test-Path $envFile)) {
        $txt = Get-Content (Join-Path $proy '.env.example') -Raw
        $secreto = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
        $txt = $txt -replace '(?m)^PORT=.*$', "PORT=$Puerto"
        $txt = $txt -replace '(?m)^DB_HOST=.*$', 'DB_HOST=localhost'
        $txt = $txt -replace '(?m)^DB_USER=.*$', 'DB_USER=postgres'
        $txt = $txt -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$PgPass"
        $txt = $txt -replace '(?m)^DB_NAME=.*$', "DB_NAME=$DbName"
        $txt = $txt -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secreto"
        [IO.File]::WriteAllText($envFile, $txt)
        Ok '.env creado'
    } else { Ok '.env ya existia (no se toco)' }

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
