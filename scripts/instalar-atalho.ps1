# Cria o atalho "Central de Projetos" na área de trabalho (ícone próprio da Central).
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
Add-Type -AssemblyName System.Drawing

# Ícone .ico (256x256, PNG embutido) desenhado aqui: 4 blocos, o primeiro em destaque.
$ico = Join-Path $raiz 'assets\central.ico'
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
function Retangulo($g, $x, $y, $w, $h, $r, $brush) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r, $r, 180, 90); $p.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
  $p.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90); $p.AddArc($x, $y + $h - $r, $r, $r, 90, 90); $p.CloseFigure()
  $g.FillPath($brush, $p)
}
Retangulo $g 0 0 256 256 64 (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#12142a')))
$p1 = New-Object System.Drawing.Point 44, 44
$p2 = New-Object System.Drawing.Point 116, 116
$c1 = [System.Drawing.ColorTranslator]::FromHtml('#7c6cff')
$c2 = [System.Drawing.ColorTranslator]::FromHtml('#2dd4bf')
$destaque = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $c1, $c2
$suave = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
Retangulo $g 44 44 72 72 20 $destaque; Retangulo $g 140 44 72 72 20 $suave
Retangulo $g 44 140 72 72 20 $suave; Retangulo $g 140 140 72 72 20 $suave
$g.Dispose()
$ms = New-Object IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
$dados = $ms.ToArray()
$fs = [IO.File]::Create($ico); $bw = New-Object IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)
$bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$dados.Length); $bw.Write([uint32]22)
$bw.Write($dados); $bw.Close(); $fs.Close()

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Central de Projetos.lnk'
$sh = New-Object -ComObject WScript.Shell
$a = $sh.CreateShortcut($lnk)
$a.TargetPath = (Get-Command powershell.exe).Source
$a.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $raiz 'scripts\iniciar-central.ps1')`""
$a.WorkingDirectory = $raiz
$a.IconLocation = $ico
$a.Description = 'Central de Projetos: escolha o projeto e trabalhe nas pendências, sessões e conversas com o Claude'
$a.Save()
Write-Output "Atalho criado: $lnk"
