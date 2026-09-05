param(
    [Parameter(Position = 0)]
    [string]$SonarHostUrl,

    [Parameter(Position = 1)]
    [string]$Token,

    [Parameter(Position = 2)]
    [string]$ProjectKey = "Livesim"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) {
    throw @"
Die SonarQube-URL muss explizit übergeben werden.

Verwendung:
`$token = Read-Host "SonarQube Token" -MaskInput
.\sonar.ps1 -SonarHostUrl "https://sonarqube.example.com" -Token `$token
"@
}

$parsedSonarUri = $null
$isValidSonarUri =
    [Uri]::TryCreate($SonarHostUrl, [UriKind]::Absolute, [ref]$parsedSonarUri) -and
    $parsedSonarUri.Scheme -in @("http", "https") -and
    -not [string]::IsNullOrWhiteSpace($parsedSonarUri.Host)

if (-not $isValidSonarUri) {
    throw "SonarHostUrl muss eine vollständige HTTP- oder HTTPS-URL sein."
}

$SonarHostUrl = $SonarHostUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw @"
Der SonarQube-Token muss explizit übergeben werden.

Token verdeckt einlesen:
`$token = Read-Host "SonarQube Token" -MaskInput

Danach erneut ausführen:
.\sonar.ps1 -SonarHostUrl "$SonarHostUrl" -Token `$token
"@
}

$scannerCandidates = @(
    (Join-Path $PSScriptRoot "node_modules\.bin\sonar-scanner-npm.cmd"),
    (Join-Path $PSScriptRoot "node_modules\.bin\sonar-scanner.cmd")
)
$scannerPath = $scannerCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($scannerPath)) {
    throw @"
SonarScanner wurde nicht gefunden. Geprüfte Pfade:
$($scannerCandidates -join [Environment]::NewLine)

Führe zuerst "pnpm install" aus.
"@
}

$packageManagerCommand = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $packageManagerCommand) {
    $packageManagerCommand = Get-Command "pnpm" -ErrorAction SilentlyContinue
}
if ($null -eq $packageManagerCommand) {
    $packageManagerCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
}
if ($null -eq $packageManagerCommand) {
    $packageManagerCommand = Get-Command "npm" -ErrorAction SilentlyContinue
}
if ($null -eq $packageManagerCommand) {
    throw "pnpm oder npm wurde nicht gefunden. Installiere Node.js und die Projektabhängigkeiten."
}

$previousPath = $env:PATH
if ($null -eq (Get-Command "node.exe" -ErrorAction SilentlyContinue)) {
    $embeddedNodeDirectory = Join-Path (Split-Path $packageManagerCommand.Source -Parent) "..\..\node\bin"
    if (Test-Path -LiteralPath (Join-Path $embeddedNodeDirectory "node.exe") -PathType Leaf) {
        $env:PATH = "$embeddedNodeDirectory;$env:PATH"
    }
    else {
        throw "Node.js wurde nicht gefunden. Installiere Node.js oder stelle sicher, dass node.exe im PATH liegt."
    }
}

Push-Location $PSScriptRoot
try {
    Write-Host "Führe die LifeSim-Tests mit Coverage aus ..."
    & $packageManagerCommand.Source "run" "test:coverage"
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        Write-Error "Die Tests sind mit Code $testExitCode fehlgeschlagen. SonarQube wurde nicht gestartet."
        exit $testExitCode
    }

    Write-Host "Starte SonarQube-Analyse für '$ProjectKey' ..."
    Write-Host "Server: $SonarHostUrl"

    $previousSonarToken = $env:SONAR_TOKEN
    $scannerExitCode = 1
    try {
        $env:SONAR_TOKEN = $Token
        & $scannerPath `
            "-Dsonar.host.url=$SonarHostUrl" `
            "-Dsonar.projectKey=$ProjectKey"

        $scannerExitCode = $LASTEXITCODE
    }
    finally {
        if ($null -eq $previousSonarToken) {
            Remove-Item Env:SONAR_TOKEN -ErrorAction SilentlyContinue
        }
        else {
            $env:SONAR_TOKEN = $previousSonarToken
        }
    }

    if ($scannerExitCode -ne 0) {
        Write-Error "Die SonarQube-Analyse ist mit Code $scannerExitCode fehlgeschlagen."
        exit $scannerExitCode
    }

    Write-Host "SonarQube-Analyse erfolgreich abgeschlossen."
    exit 0
}
finally {
    $env:PATH = $previousPath
    Pop-Location
}
