# EGBC Monitor Bridge

Lets a musician set their own wedge level from the Performance App on a tablet.

Tablets can't open raw TCP sockets, so they can't talk to the SQ5 directly. This
bridge runs on a PC on the church network, accepts WebSocket connections from
the app, and forwards each fader move to the mixer as MIDI NRPN over TCP.

```
  tablet  --WebSocket :3000-->  bridge PC  --MIDI over TCP :51325-->  SQ5
```

---

## What goes on the bridge PC

Any Windows PC that stays on the church network during the service. It does not
need to be fast, and it does not need to be the AV machine — but it must stay
switched on, and its IP address must not change.

Three things go on it:

1. **Node.js** — the LTS installer from [nodejs.org](https://nodejs.org)
2. **This `monitor-bridge` folder**, plus `start-monitor-bridge.bat` from the
   repo root. Nothing else from the site is needed. Easiest way: green **Code**
   button on the repo → **Download ZIP** → unzip → keep those two.
3. **A `config.json`** with the mixer's address — the setup script writes it.

### The easy way

Double-click **`setup-bridge.bat`**. It checks Node, installs the one
dependency, finds this PC's address, asks for the mixer's IP and tests it,
offers to make and trust the certificate, opens the firewall, writes
`config.json`, and prints the exact settings to type into Monitor Setup.

It asks before doing anything that changes the machine.

### Afterwards

Double-click **`start-monitor-bridge.bat`** before the service and leave the
window open — closing it stops the faders working. Each fader move prints a
line, so that window is also how you check it's doing anything.

---

## Setting it up by hand

**On the mixer** — the SQ needs MIDI over TCP/IP reachable on the network:

1. `Setup` → `Network` — give the SQ a **fixed IP** (or a DHCP reservation on
   the router). If its address moves, the bridge can't find it.
2. `Setup` → `General` → `MIDI` — note the **MIDI Channel** (default 1) and
   leave **NRPN Fader Law** on **Linear Taper**, which is what this assumes.

**On the bridge PC:**

1. Install [Node.js](https://nodejs.org) (18 or newer) if it isn't there.
2. Copy `config.example.json` to `config.json` and set `sqIp` to the mixer's
   address, plus `midiChannel` if it isn't 1.
3. Double-click `start-monitor-bridge.bat` in the repo root. First run installs
   the one dependency, then it stays open showing a log.

The PC needs to allow inbound connections on port 3000 — Windows will prompt the
first time; choose **Private networks**.

**In Firebase** — put the bridge PC's address into `egbc-config/monitor-mix`:

```
bridgeIp:   "192.168.1.50"     the PC running this, not the mixer
bridgePort: 3000
```

The AV setup page (`MonitorStageMap.html`) writes that for you.

### Certificates — read this one, it's the thing that will bite

The Performance App is served from GitHub Pages, so it runs over **HTTPS**. A
page loaded over HTTPS is not allowed to open a plain `ws://` socket; the
browser blocks it before the bridge ever sees a connection. So a bridge running
plain `ws://` will *never* connect from the live app, no matter how healthy the
log looks.

The bridge therefore needs a certificate:

1. Install [mkcert](https://github.com/FiloSottile/mkcert) on the bridge PC.
2. `mkcert -install`, then `mkcert 192.168.1.50` (the bridge PC's own address).
3. Put the two files it writes next to `bridge.js` and add to `config.json`:

   ```json
   "tlsCert": "192.168.1.50.pem",
   "tlsKey":  "192.168.1.50-key.pem"
   ```

4. Tick **Bridge uses HTTPS** in `MonitorStageMap.html`.
5. On each tablet, browse once to `https://192.168.1.50:3000/` and accept the
   certificate. mkcert's root has to be trusted on the tablet, or the tablet
   will refuse the socket the same way. On iPads that means installing the
   mkcert root profile; on Android, adding it under Security → Credentials.

The startup log tells you which mode you're in, and the app says **"Not set
up"** with an explanation rather than sitting on a grey dot forever.

If that's more faff than it's worth, the alternative is to serve the app itself
over plain HTTP from the bridge PC on service days, in which case `ws://` works
untouched.

### Running it as a service

If you'd rather it started with the PC, [NSSM](https://nssm.cc) is the simplest
route:

```
nssm install EGBCMonitorBridge "C:\Program Files\nodejs\node.exe" "<path>\monitor-bridge\bridge.js"
nssm set EGBCMonitorBridge AppDirectory "<path>\monitor-bridge"
nssm start EGBCMonitorBridge
```

---

## Reading the mix off the desk

The mixer knows which channels are routed into each aux and where their sends
are sitting, so the app asks it rather than making anyone keep a typed list in
step with the desk. When a performer opens their monitor mix the tablet sends:

```json
{ "action": "scanMix", "auxBus": 3 }
```

and the bridge issues a `get` for the assignment and the level of all 48 inputs
on that bus, collects the replies for about a second, and answers with what came
back:

```json
{ "scan": { "auxBus": 3, "answered": 48, "scanned": 48, "channels": [
  { "inputChannel": 1, "assigned": true, "value": 14840, "db": -3, "level": 0.776 },
  { "inputChannel": 2, "assigned": false, "value": 0, "db": null, "level": 0 }
] } }
```

The app shows the channels with `assigned: true`, starting each fader where the
desk has it. `assigned: null` means that channel didn't answer.

**Names are the one thing this can't give you.** The SQ MIDI protocol carries
levels, mutes, pans and assignments — no strings anywhere. So channel names come
from the one-off table in `MonitorStageMap.html`, and anything unnamed shows as
"Ch 12". That table only needs revisiting when the input list changes.

Scans are serialised — two tablets opening at once share one scan rather than
having their replies land in each other's collection window.

## Checking it works

```
npm test              runs all four suites below
```

| suite | what it covers |
|-------|----------------|
| `test-sq5.js` | addressing and level maths, against every worked example in the protocol document |
| `test-midi.js` | the inbound MIDI parser — split reads, running status, realtime bytes, SysEx |
| `test-bridge.js` | full round trip against a fake mixer, including a mid-service disconnect and recovery |
| `test-scan.js` | a mix scan against a fake desk that holds a routing table and answers `get` |

All four run offline with no hardware. `test-sq5.js` and `test-midi.js` are the
ones that matter if Allen & Heath ever change the protocol.

To prove the real mixer end before touching the app, start the bridge and watch
the log while you move a fader in the app. Each move prints the channel, the
bus and the resulting dB.

---

## The wire protocol

Tablet to bridge:

```json
{ "action": "setLevel", "inputChannel": 3, "auxBus": 2, "level": 0.75 }
```

- `inputChannel` — 1-based SQ input, 1..48
- `auxBus` — 1-based aux bus, 1..12
- `level` — fader position, 0.0 (silence) to 1.0 (top of travel)

The bridge replies `{"ok":true,...}`, or `{"error":"..."}` if the message was
malformed or the mixer is offline. `{"action":"ping"}` returns the current
status.

Bridge to every connected tablet, whenever the mixer link changes:

```json
{ "status": "connected" }
{ "status": "disconnected" }
```

A tablet is also sent the current status the moment it connects, so its
indicator is right on open rather than after the first change.

---

## How the SQ is addressed

From *SQ MIDI Protocol Issue 5*. An NRPN write is four CC messages:

```
BN 63 MSB     CC99   parameter number, high 7 bits
BN 62 LSB     CC98   parameter number, low 7 bits
BN 06 VC      CC6    value, high 7 bits
BN 26 VF      CC38   value, low 7 bits
```

Level parameters start at `40 00` (8192). The map is:

```
8192 + s                     source s's own fader (its send to LR)
                               s = 0..47   Ip1..Ip48
                                   48..59  Grp1..Grp12
                                   60..67  FX1Rtn..FX8Rtn
8192 + 68 + s*12 + (aux-1)   source s's send to Aux 1..12
```

So the LR block is 68 wide, and each source then owns a run of 12 consecutive
addresses, one per aux. Every worked example in the document lands exactly on
this — `Ip48 → Aux1` = `44 78` through `Ip48 → Aux12` = `45 03`, `Ip40 → Aux5` =
`44 1C`, `Grp4 → Aux8` = `45 2F`, `Ip1 → Aux1` = `40 44`. `test-sq5.js` asserts
all of them.

### Levels

In Linear Taper mode the 14-bit value is linear in dB at **118.72 steps per
dB**, with `0 dB = 15196` and `+10 dB = 16383`. Value `0` is `-inf`. That
straight line reproduces the document's published dB table exactly at every
point from +9 dB down to -89 dB.

Because the value is linear in dB, mapping fader travel straight onto it would
put half-way up at about **-64 dB** — inaudible, with everything useful jammed
into the top quarter. So the bridge applies an audio taper instead: a square law
over 60 dB, giving

| fader | level |
|-------|-------|
| 1.00  | 0 dB  |
| 0.75  | -3.8 dB |
| 0.50  | -15 dB |
| 0.25  | -33.8 dB |
| 0.00  | off |

### The one safety decision

`maxDb` sets what the top of the fader reaches, and **defaults to 0 dB, not the
mixer's +10 dB ceiling**. The spec called 1.0 "unity/max"; those are different
levels on an SQ, and letting a performer push their own wedge 10 dB past unity
mid-service is a good way to get feedback. Raise it in `config.json` if you
genuinely want the extra range.

---

## Scope

The bridge only ever **writes** input-to-aux send levels, and only on the one
aux bus feeding that performer's own wedge. It **reads** assignments and send
levels for that same bus. It cannot touch EQ, effects, master outputs, mutes, or
anyone else's mix.

### EGBC's foldback map

| Aux | Wedge |
|-----|-------|
| 1 | Acoustic guitar |
| 2 | Bass — in-ear |
| 3 | Worship leader |
| 4 | Keyboard |
| 5 | Drums |
| 6 | Backing singers |
| 7 | Bass — floor monitor |
| 8 | Spare 1 |

These are the defaults `MonitorStageMap.html` starts from; the stage positions
are a guess and want dragging to where the wedges actually stand.
