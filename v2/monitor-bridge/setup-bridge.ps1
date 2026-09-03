# EGBC Monitor Bridge - one-time setup for the bridge PC.
#
# Run it by double-clicking setup-bridge.bat next to this file. It will:
#   1. check Node is installed
#   2. install the one dependency
#   3. ask for the mixer's IP and write config.json
#   4. offer to open the firewall for the tablets
#   5. offer to make and trust a certificate, which the tablets need
#   6. print the settings to type into Monitor Setup
#
# Nothing happens without you saying yes to it first.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say([string]$t) { Write-Host $t }
function Head([string]$t) {
  Write-Host ''
  Write-Host ('  ' + $t) -ForegroundColor Cyan
  Write-Host ('  ' + ('-' * $t.Length)) -ForegroundColor Cyan
}
function Ask([string]$q, [string]$default) {
  if ($default) { $a = Read-Host ($q + ' [' + $default + ']') } else { $a = Read-Host $q }
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim()
}
function YesNo([string]$q) {
  while ($true) {
    $a = (Read-Host ($q + ' (y/n)')).Trim().ToLower()
    if ($a -eq 'y') { return $true }
    if ($a -eq 'n') { return $false }
  }
}

Write-Host ''
Write-Host '  EGBC Monitor Bridge - setup' -ForegroundColor White
Write-Host '  ===========================' -ForegroundColor White

# ── 1. Node ─────────────────────────────────────────────────────────────────
Head 'Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Say 'Node.js is not installed on this PC.'
  Say 'Get the LTS installer from https://nodejs.org, run it, then run this script again.'
  Read-Host 'Press Enter to close'
  exit 1
}
$nodeVersion = (& node --version)
Say ('Found Node ' + $nodeVersion)
$major = [int](($nodeVersion -replace '^v','') -split '\.')[0]
if ($major -lt 18) {
  Say 'That is older than Node 18. Please update from https://nodejs.org and run this again.'
  Read-Host 'Press Enter to close'
  exit 1
}

# ── 2. Dependency ───────────────────────────────────────────────────────────
Head 'Dependency'
if (Test-Path 'node_modules\ws') {
  Say 'Already installed.'
} else {
  Say 'Installing (needs internet, takes a few seconds)...'
  & npm install --no-audit --no-fund
  if (-not (Test-Path 'node_modules\ws')) {
    Say 'That did not work. Check this PC can reach the internet, then run the script again.'
    Read-Host 'Press Enter to close'
    exit 1
  }
  Say 'Done.'
}

# ── 3. This PC's address ────────────────────────────────────────────────────
Head 'This PC'
$candidates = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object IPAddress, InterfaceAlias
if (-not $candidates) {
  Say 'Could not work out this PC address. Is it on the network?'
  $bridgeIp = Ask 'This PC IPv4 address' ''
} elseif (@($candidates).Count -eq 1) {
  $bridgeIp = @($candidates)[0].IPAddress
  Say ('This PC is ' + $bridgeIp + '  (' + @($candidates)[0].InterfaceAlias + ')')
} else {
  Say 'This PC has more than one address. Pick the one on the church network:'
  $i = 1
  foreach ($c in $candidates) { Say ('  ' + $i + ') ' + $c.IPAddress + '   ' + $c.InterfaceAlias); $i++ }
  $pick = [int](Ask 'Number' '1')
  $bridgeIp = @($candidates)[$pick - 1].IPAddress
}
Say ''
Say 'NOTE: this address must not change, or the tablets will lose the bridge.'
Say 'Give this PC a fixed IP, or a DHCP reservation on the router.'

# ── 4. The mixer ────────────────────────────────────────────────────────────
Head 'The mixer'
$existing = @{}
if (Test-Path 'config.json') {
  try { $existing = Get-Content 'config.json' -Raw | ConvertFrom-Json } catch { $existing = @{} }
}

# Rather than making someone read an IP off the mixer, look for it. Anything on
# this network answering on 51325 is almost certainly the desk.
function Find-Mixer([string]$fromIp) {
  $prefix = $fromIp -replace '\.\d+$', ''
  Say ('Looking for the mixer on ' + $prefix + '.1 - ' + $prefix + '.254 ...')
  $pending = @()
  foreach ($i in 1..254) {
    $ip = ($prefix + '.' + $i)
    if ($ip -eq $fromIp) { continue }
    $c = New-Object System.Net.Sockets.TcpClient
    try { $null = $c.BeginConnect($ip, 51325, $null, $null) } catch { continue }
    $pending += [pscustomobject]@{ Ip = $ip; Client = $c }
  }
  Start-Sleep -Milliseconds 1200
  $hits = @()
  foreach ($p in $pending) {
    if ($p.Client.Connected) { $hits += $p.Ip }
    try { $p.Client.Close() } catch { }
  }
  return $hits
}

$sqIp = ''
if ($existing.sqIp) {
  Say ('config.json already has ' + $existing.sqIp)
  if (YesNo 'Keep that address?') { $sqIp = $existing.sqIp }
}

if (-not $sqIp) {
  if (YesNo 'Search the network for the mixer? (easier than reading it off the desk)') {
    $hits = @(Find-Mixer $bridgeIp)
    if ($hits.Count -eq 1) {
      $sqIp = $hits[0]
      Say ('Found something answering on ' + $sqIp + ' - that will be the mixer.')
    } elseif ($hits.Count -gt 1) {
      Say 'More than one device answered. Pick the mixer:'
      $i = 1
      foreach ($h in $hits) { Say ('  ' + $i + ') ' + $h); $i++ }
      $pick = [int](Ask 'Number' '1')
      $sqIp = $hits[$pick - 1]
    } else {
      Say ''
      Say 'Nothing answered. Usually that means the mixer is switched off, is on a'
      Say 'different network from this PC, or its network port is not plugged in.'
    }
  }
}

if (-not $sqIp) {
  Say ''
  Say 'To read it off the desk: press the Utility screen key, then the General'
  Say 'tab, then the Network tab. That page shows the IP address.'
  $sqIp = Ask 'Mixer IP address' '192.168.1.60'
  Say ('Checking ' + $sqIp + ':51325 ...')
  $reach = Test-NetConnection -ComputerName $sqIp -Port 51325 -WarningAction SilentlyContinue
  if ($reach.TcpTestSucceeded) {
    Say 'Mixer answered. Good.'
  } else {
    Say 'No answer on port 51325. Carrying on - you can fix this in config.json later.'
  }
}

Say ''
Say 'MIDI channel: on the SQ press Utility, then the General tab, then the MIDI'
Say 'tab. It shows MIDI Channel (almost always 1), and NRPN Fader Law, which'
Say 'must be left on Linear Taper. If you have never changed either, press'
Say 'Enter to accept 1.'
$defCh = '1'
if ($existing.midiChannel) { $defCh = [string]$existing.midiChannel }
$midiChannel = [int](Ask 'MIDI channel' $defCh)

# ── 5. Certificate ──────────────────────────────────────────────────────────
Head 'Certificate'
Say 'The Performance App is served over HTTPS, and browsers refuse a plain'
Say 'connection from an HTTPS page. Without a certificate here, the faders will'
Say 'never connect no matter how healthy this bridge looks.'
Say ''

$tlsCert = ''
$tlsKey = ''
if ($existing.tlsCert -and (Test-Path $existing.tlsCert)) {
  Say ('Already have a certificate: ' + $existing.tlsCert)
  $tlsCert = $existing.tlsCert
  $tlsKey = $existing.tlsKey
} elseif (YesNo 'Make a certificate now?') {
  $mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
  if (-not $mkcert) {
    Say 'mkcert is not installed. Trying winget...'
    try {
      & winget install --id FiloSottile.mkcert --accept-source-agreements --accept-package-agreements
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
      $mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
    } catch {
      Say 'winget could not install it.'
    }
  }
  if ($mkcert) {
    Say 'Installing the local root certificate (Windows may ask you to confirm)...'
    & mkcert -install
    Say ('Making a certificate for ' + $bridgeIp + ' ...')
    & mkcert $bridgeIp
    $c = Join-Path $PSScriptRoot ($bridgeIp + '.pem')
    $k = Join-Path $PSScriptRoot ($bridgeIp + '-key.pem')
    if ((Test-Path $c) -and (Test-Path $k)) {
      $tlsCert = ($bridgeIp + '.pem')
      $tlsKey = ($bridgeIp + '-key.pem')
      Say 'Certificate made.'
    } else {
      Say 'mkcert ran but the files are not here. You can do this by hand later - see README.md.'
    }
  } else {
    Say 'Install mkcert from https://github.com/FiloSottile/mkcert/releases, put'
    Say 'mkcert.exe in this folder, and run this script again.'
  }
} else {
  Say 'Skipped. The bridge will run, but the app will not be able to connect to it.'
}

# ── 6. Write config.json ────────────────────────────────────────────────────
Head 'Saving config.json'
$cfg = [ordered]@{
  sqIp        = $sqIp
  sqPort      = 51325
  midiChannel = $midiChannel
  wsPort      = 3000
  maxDb       = 0
}
if ($tlsCert) { $cfg.tlsCert = $tlsCert; $cfg.tlsKey = $tlsKey }
($cfg | ConvertTo-Json) | Out-File -FilePath 'config.json' -Encoding utf8
Say 'Written.'

# ── 7. Firewall ─────────────────────────────────────────────────────────────
Head 'Firewall'
$ruleName = 'EGBC Monitor Bridge'
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) {
  Say 'Rule already there.'
} else {
  Say 'The tablets need to reach port 3000 on this PC.'
  if (YesNo 'Add a firewall rule for port 3000 on private networks?') {
    try {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
        -LocalPort 3000 -Action Allow -Profile Private | Out-Null
      Say 'Added.'
    } catch {
      Say 'Could not add it - run this script as Administrator, or add it by hand.'
    }
  } else {
    Say 'Skipped. Windows will most likely prompt the first time the bridge runs.'
  }
}

# ── 8. What to type into Monitor Setup ──────────────────────────────────────
Head 'Now put these into Monitor Setup'
Say ''
Say ('  Bridge IP           ' + $bridgeIp)
Say  '  Port                3000'
if ($tlsCert) {
  Say '  Bridge uses HTTPS   TICKED'
} else {
  Say '  Bridge uses HTTPS   (leave unticked - but the faders will not connect)'
}
Say ''
Say '  esherchurch.github.io/availability-form/MonitorStageMap.html'
Say ''

if ($tlsCert) {
  Head 'One thing left, on each tablet'
  Say ('Browse to  https://' + $bridgeIp + ':3000/  once and accept the certificate.')
  Say 'On iPads you also need the mkcert root profile installed and trusted;'
  Say 'on Android, add it under Security > Credentials. See README.md.'
  Say ''
}

Head 'Starting it'
Say 'Double-click start-bridge.bat, in this same folder. Leave the window open'
Say 'during the service - closing it stops the faders working.'
Say ''
if (YesNo 'Start the bridge now?') {
  Say ''
  & node bridge.js
} else {
  Read-Host 'Press Enter to close'
}
