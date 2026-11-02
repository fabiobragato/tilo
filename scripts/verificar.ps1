# Tilo — Project Knowledge: confere os pré-requisitos e diz exatamente o que falta.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\verificar.ps1 [-TestarLogin]
#   -TestarLogin  faz uma chamada mínima ao Claude (modelo haiku) para provar que o login da assinatura funciona (gasta um pouco de uso).
param([switch]$TestarLogin)
$ErrorActionPreference = 'Continue'
$raiz = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
$falhas = 0; $avisos = 0
function Ok($t)    { Write-Host "  [ok]    $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [aviso] $t" -ForegroundColor Yellow; $script:avisos++ }
function Falha($t, $como) { Write-Host "  [FALTA] $t" -ForegroundColor Red; Write-Host "          -> $como" -ForegroundColor Red; $script:falhas++ }

Write-Host "`nTilo: verificação`n" -ForegroundColor Cyan

# 1. Windows (atalho e launcher são PowerShell)
if ($env:OS -eq 'Windows_NT') { Ok 'Windows' } else { Aviso 'Sistema não é Windows: o servidor roda (node server.mjs), mas o atalho e o launcher são só para Windows.' }

# 2. Node 20+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Falha 'Node.js não encontrado no PATH' 'Instale o Node 20 ou mais novo (https://nodejs.org) e abra um terminal novo.' }
else {
  $v = (& node --version).TrimStart('v'); $maior = [int]($v.Split('.')[0])
  if ($maior -ge 20) { Ok "Node $v" } else { Falha "Node $v é antigo demais" 'Instale o Node 20 ou mais novo.' }
}

# 3. Git Bash (o Claude Code no Windows exige shell POSIX; o bash.exe do WSL em System32 não serve)
$gitBash = $null
if ($env:CLAUDE_CODE_GIT_BASH_PATH -and (Test-Path $env:CLAUDE_CODE_GIT_BASH_PATH)) { $gitBash = $env:CLAUDE_CODE_GIT_BASH_PATH }
else {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    $base = Split-Path (Split-Path $git.Source -Parent) -Parent
    foreach ($c in @((Join-Path $base 'bin\bash.exe'), (Join-Path $base 'usr\bin\bash.exe'))) { if (Test-Path $c) { $gitBash = $c; break } }
  }
}
foreach ($c in @('C:\Program Files\Git\bin\bash.exe', 'C:\Program Files (x86)\Git\bin\bash.exe')) { if (-not $gitBash -and (Test-Path $c)) { $gitBash = $c } }
if ($gitBash) { Ok "Git Bash: $gitBash" }
else { Falha 'Git Bash não encontrado' 'Instale o Git for Windows (https://git-scm.com). Se instalou em outro lugar, defina CLAUDE_CODE_GIT_BASH_PATH com o caminho do bash.exe (em ~\.claude\settings.json, chave "env").' }
$bashPath = Get-Command bash -ErrorAction SilentlyContinue
if ($bashPath -and $bashPath.Source -like '*\Windows\System32\*') {
  if ($gitBash) { Aviso "O 'bash' do PATH é o do WSL (System32). Funciona porque o Git Bash foi achado, mas se der 'No suitable shell found', defina CLAUDE_CODE_GIT_BASH_PATH=$gitBash." }
}

# 4. Claude Code CLI (+ login opcional)
$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) { Falha 'Claude Code (comando claude) não encontrado' 'Instale o Claude Code e faça login uma vez rodando "claude" num terminal.' }
else {
  Ok ("Claude Code " + ((& claude --version 2>&1 | Select-Object -First 1)))
  if ($TestarLogin) {
    $env:ANTHROPIC_API_KEY = ''; $env:ANTHROPIC_AUTH_TOKEN = ''
    $r = ('diga ok' | & claude -p --model haiku --output-format text 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $r) { Ok 'Login do Claude funcionando (assinatura)' }
    else { Falha 'Claude não respondeu' "Rode 'claude' num terminal e faça login. Saída: $($r.Substring(0, [Math]::Min(200, $r.Length)))" }
  } else { Write-Host "  [info]  Login do Claude não testado (use -TestarLogin para testar)." -ForegroundColor DarkGray }
}
if ($env:ANTHROPIC_API_KEY) { Aviso 'ANTHROPIC_API_KEY está definida neste terminal. O Tilo a zera nos processos que cria (só usa a assinatura), mas confira se não é usada por outra coisa sua.' }

# 5. Porta
$porta = if ($env:TILO_PORT) { [int]$env:TILO_PORT } else { 4777 }
$ocupada = $false; try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', $porta); $ocupada = $true } catch {}
if (-not $ocupada) { Ok "Porta $porta livre" }
else {
  $tokenFile = Join-Path $raiz '.token'
  $tk = if (Test-Path $tokenFile) { (Get-Content $tokenFile -Raw).Trim() } else { '' }
  try { $r = Invoke-WebRequest "http://localhost:$porta/api/projetos" -Headers @{ 'X-Tilo-Token' = $tk } -UseBasicParsing -TimeoutSec 3; Ok "Tilo já está rodando na porta $porta" }
  catch { Falha "Porta $porta ocupada por outro programa" 'Feche o programa que a usa ou defina outra porta com a variável TILO_PORT.' }
}

# 6. Arquivos locais
if (Test-Path (Join-Path $raiz 'projetos.json')) { Ok 'projetos.json encontrado' } else { Write-Host "  [info]  projetos.json ainda não existe: o Tilo abre só com o tile '+'. Cadastre o primeiro projeto por lá." -ForegroundColor DarkGray }

Write-Host ''
if ($falhas) { Write-Host "$falhas item(ns) a resolver antes de usar." -ForegroundColor Red; exit 1 }
if ($avisos) { Write-Host "Pronto, com $avisos aviso(s)." -ForegroundColor Yellow } else { Write-Host 'Tudo certo.' -ForegroundColor Green }
Write-Host "Próximo passo: scripts\instalar-atalho.ps1 (cria o ícone na área de trabalho) ou iniciar.cmd.`n"
exit 0
