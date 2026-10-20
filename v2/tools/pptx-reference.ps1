# PowerPoint's own pictures of a deck's slides (F-250): the reference that
# Present's converter (LibreOffice) is compared with.
#   powershell -File tools\pptx-reference.ps1 -Deck "C:\path\deck.pptx" -Out "C:\path\ref"
# Writes <Out>\s1.png, s2.png ... (1920 x 1080), one per shown slide, hidden
# slides left out as Present does. Opens a COPY of the deck read-only with no
# window; a PowerPoint already open is left as it was (it only closes the
# copy), and a PowerPoint it started itself is quit at the end.
# Keep real decks and their pictures out of the repo: church content.
param([Parameter(Mandatory = $true)][string]$Deck, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$copy = Join-Path ([IO.Path]::GetTempPath()) ('pptx-ref-' + [guid]::NewGuid().ToString('N') + '.pptx')
Copy-Item -LiteralPath $Deck -Destination $copy
$started = $false
try { $pp = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $pp = New-Object -ComObject PowerPoint.Application; $started = $true }
$p = $pp.Presentations.Open($copy, -1, 0, 0)
try {
  $n = 0
  foreach ($s in $p.Slides) { if ($s.SlideShowTransition.Hidden -eq 0) { $n++; $s.Export((Join-Path $Out ('s' + $n + '.png')), 'PNG', 1920, 1080) } }
  "PowerPoint drew $n slides into $Out"
} finally {
  $p.Close()
  if ($started -and $pp.Presentations.Count -eq 0) { $pp.Quit() }
  Remove-Item -LiteralPath $copy -ErrorAction SilentlyContinue
}
