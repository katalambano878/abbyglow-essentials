# Generate placeholder AbbyGlow Essentials marks.
Add-Type -AssemblyName System.Drawing

$public = Join-Path $PSScriptRoot '..\public'
$navy = [System.Drawing.Color]::FromArgb(255, 18, 61, 44)
$white = [System.Drawing.Color]::White
$accent = [System.Drawing.Color]::FromArgb(255, 241, 90, 36)
$bold = [System.Drawing.FontStyle]::Bold
$regular = [System.Drawing.FontStyle]::Regular
$pixel = [System.Drawing.GraphicsUnit]::Pixel

function New-Graphics([System.Drawing.Bitmap]$bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  return $g
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$name) {
  $path = Join-Path $public $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $name
}

function New-Monogram([int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = New-Graphics $bmp
  $g.Clear($navy)
  $fontSize = [math]::Floor($size * 0.36)
  $font = New-Object System.Drawing.Font('Georgia', $fontSize, $bold, $pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $brush = New-Object System.Drawing.SolidBrush $white
  $g.DrawString('AG', $font, $brush, $rect, $sf)
  Save-Png $bmp $name
  $brush.Dispose(); $g.Dispose(); $font.Dispose(); $bmp.Dispose()
}

function New-Wordmark([int]$w, [int]$h, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = New-Graphics $bmp
  $g.Clear($navy)
  $titleSize = [math]::Floor($h * 0.28)
  $subSize = [math]::Floor($h * 0.10)
  $titleFont = New-Object System.Drawing.Font('Georgia', $titleSize, $bold, $pixel)
  $subFont = New-Object System.Drawing.Font('Segoe UI', $subSize, $regular, $pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $titleRect = New-Object System.Drawing.RectangleF 0, ($h * 0.22), $w, ($h * 0.40)
  $subRect = New-Object System.Drawing.RectangleF 0, ($h * 0.58), $w, ($h * 0.20)
  $whiteBrush = New-Object System.Drawing.SolidBrush $white
  $accentBrush = New-Object System.Drawing.SolidBrush $accent
  $g.DrawString('AbbyGlow', $titleFont, $whiteBrush, $titleRect, $sf)
  $g.DrawString('ESSENTIALS', $subFont, $accentBrush, $subRect, $sf)
  Save-Png $bmp $name
  $whiteBrush.Dispose(); $accentBrush.Dispose()
  $g.Dispose(); $titleFont.Dispose(); $subFont.Dispose(); $bmp.Dispose()
}

New-Wordmark 1200 400 'logo.png'
New-Wordmark 1200 400 'logo-wide.png'
New-Wordmark 1200 400 'logo.svg.png'
New-Wordmark 1200 400 'abbyglow-logo-source.png'
New-Wordmark 1200 630 'og-image.png'
New-Monogram 512 'brand-mark.png'
New-Monogram 512 'icon-512.png'
New-Monogram 192 'icon-192.png'
New-Monogram 180 'apple-touch-icon.png'
New-Monogram 48 'favicon.png'
New-Monogram 32 'favicon-32.png'

$icoBmp = New-Object System.Drawing.Bitmap 48, 48
$g = New-Graphics $icoBmp
$g.Clear($navy)
$font = New-Object System.Drawing.Font('Georgia', 18, $bold, $pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$brush = New-Object System.Drawing.SolidBrush $white
$g.DrawString('AG', $font, $brush, (New-Object System.Drawing.RectangleF 0, 0, 48, 48), $sf)
$icoPath = Join-Path $public 'favicon.ico'
$icoBmp.Save($icoPath, [System.Drawing.Imaging.ImageFormat]::Icon)
Write-Output 'favicon.ico'
$brush.Dispose(); $g.Dispose(); $font.Dispose(); $icoBmp.Dispose()
