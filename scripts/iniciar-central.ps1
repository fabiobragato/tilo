# Central de Projetos: sobe o servidor local (se ainda não estiver no ar) e abre o navegador já autenticado.
# Usado pelo atalho da área de trabalho (ver instalar-atalho.ps1). Janela oculta; logs em central.log.
param([string]$Projeto = '')
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
$porta = if ($env:CENTRAL_PORT) { [int]$env:CENTRAL_PORT } else { 4777 }

function Test-Porta { try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', $porta); $true } catch { $false } }

if (-not (Test-Porta)) {
  # Nunca usar API paga: só a assinatura (login do Claude Code do usuário).
  $env:ANTHROPIC_API_KEY = ''
  $env:ANTHROPIC_AUTH_TOKEN = ''
  Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory $raiz -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $raiz 'central.log') -RedirectStandardError (Join-Path $raiz 'central.err.log')
  for ($i = 0; $i -lt 40 -and -not (Test-Porta); $i++) { Start-Sleep -Milliseconds 250 }
}

$tokenFile = Join-Path $raiz '.token'
$token = if (Test-Path $tokenFile) { (Get-Content $tokenFile -Raw).Trim() } else { '' }
# O link com token grava o cookie e redireciona para "/"; com -Projeto abre direto o painel dele depois do cookie.
Start-Process ("http://localhost:$porta/" + $(if ($token) { "?t=$token" } else { '' }))
