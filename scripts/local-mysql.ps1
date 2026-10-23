param(
  [Parameter(Position = 0)]
  [ValidateSet('init', 'start', 'stop', 'status', 'reset')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LocalDir = Join-Path $Root '.local\mysql'
$DataDir = Join-Path $LocalDir 'data'
$PidFile = Join-Path $LocalDir 'mysqld.pid'
$LogFile = Join-Path $LocalDir 'mysqld.err'

$Port = if ($env:BIBLIOTHECA_DB_PORT) { [int]$env:BIBLIOTHECA_DB_PORT } else { 3308 }

$mysqlHome = $env:MYSQL_HOME
if (-not $mysqlHome) {
  $candidates = @(
    'C:\Program Files\MySQL\MySQL Server 8.0',
    'C:\Program Files\MySQL\MySQL Server 8.4',
    'C:\Program Files\MariaDB 11.4',
    'C:\Program Files\MariaDB 10.11'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'bin\mysqld.exe')) {
      $mysqlHome = $candidate
      break
    }
  }
}

if (-not $mysqlHome -or -not (Test-Path -LiteralPath (Join-Path $mysqlHome 'bin\mysqld.exe'))) {
  throw "MySQL/MariaDB server binaries were not found. Install MySQL 8 (or MariaDB) and set MYSQL_HOME to its install folder, e.g. `$env:MYSQL_HOME='C:\Program Files\MySQL\MySQL Server 8.0'."
}

$mysqld = Join-Path $mysqlHome 'bin\mysqld.exe'
$mysql = Join-Path $mysqlHome 'bin\mysql.exe'
$mysqladmin = Join-Path $mysqlHome 'bin\mysqladmin.exe'

function Invoke-MysqlAdmin {
  param([string[]]$AdminArgs)
  if (-not (Test-Path -LiteralPath $mysqladmin)) { return 1 }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  & $mysqladmin --no-defaults @AdminArgs 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  return $code
}

function Test-Server {
  return (Invoke-MysqlAdmin -AdminArgs @('-h', '127.0.0.1', '-P', "$Port", '-u', 'root', '--connect-timeout=2', 'ping')) -eq 0
}

function Initialize-Instance {
  if (Test-Path -LiteralPath (Join-Path $DataDir 'mysql')) {
    Write-Host "Local MySQL data directory already exists: $DataDir"
    return
  }
  New-Item -ItemType Directory -Force -Path $LocalDir, $DataDir | Out-Null
  Write-Host "Initializing local MySQL instance in $DataDir ..."
  & $mysqld --no-defaults --initialize-insecure --basedir="$mysqlHome" --datadir="$DataDir" 2>&1 | Tee-Object -FilePath $LogFile
  if ($LASTEXITCODE -ne 0) { throw "MySQL initialization failed. See $LogFile" }
  Write-Host 'Local MySQL instance initialized (user: root, no password, local-only).'
}

function Start-Instance {
  if (Test-Server) {
    Write-Host "Local MySQL is already running on 127.0.0.1:$Port."
    return
  }
  if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'mysql'))) {
    Initialize-Instance
  }
  New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
  if (Test-Path -LiteralPath $PidFile) { Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue }

  $arguments = @(
    '--no-defaults',
    "--basedir=`"$mysqlHome`"",
    "--datadir=`"$DataDir`"",
    "--port=$Port",
    '--bind-address=127.0.0.1',
    '--mysqlx=0',
    "--pid-file=`"$PidFile`"",
    "--log-error=`"$LogFile`""
  ) -join ' '

  Write-Host "Starting local MySQL on 127.0.0.1:$Port ..."
  $process = Start-Process -FilePath $mysqld -ArgumentList $arguments -WindowStyle Hidden -PassThru

  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Milliseconds 700
    if (Test-Server) {
      Write-Host "Local MySQL is ready (PID $($process.Id), port $Port)."
      return
    }
    if ($process.HasExited) { break }
  }

  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $LogFile) {
    Write-Host '--- MySQL error log (tail) ---'
    Get-Content -LiteralPath $LogFile -Tail 30
  }
  throw 'Local MySQL did not start. Check the error log above.'
}

function Stop-Instance {
  if (-not (Test-Server)) {
    Write-Host 'Local MySQL is not running.'
    return
  }
  Write-Host "Stopping local MySQL on port $Port ..."
  Invoke-MysqlAdmin -AdminArgs @('-h', '127.0.0.1', '-P', "$Port", '-u', 'root', 'shutdown') | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not (Test-Server)) { Write-Host 'Stopped.'; return }
  }
  if (Test-Path -LiteralPath $PidFile) {
    $pidValue = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($pidValue) { Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue }
  }
  Write-Host 'Stop requested.'
}

function Show-Status {
  if (Test-Server) {
    $version = & $mysql --no-defaults -h 127.0.0.1 -P $Port -u root -N -e 'SELECT VERSION();'
    Write-Host "Running on 127.0.0.1:$Port (MySQL/MariaDB $version)."
  } else {
    Write-Host "Not running. Start it with: npm run db:local:start (port $Port)"
  }
}

function Reset-Instance {
  Stop-Instance
  if (Test-Path -LiteralPath $LocalDir) {
    Write-Host "Removing $LocalDir ..."
    Remove-Item -LiteralPath $LocalDir -Recurse -Force
  }
  Write-Host 'Local MySQL data removed. Run npm run db:local:init to start fresh.'
}

switch ($Action) {
  'init' { Initialize-Instance }
  'start' { Start-Instance }
  'stop' { Stop-Instance }
  'status' { Show-Status }
  'reset' { Reset-Instance }
}
