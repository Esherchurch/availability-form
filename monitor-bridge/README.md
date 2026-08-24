# EGBC Monitor Bridge

Lets a musician set their own wedge level from the Performance App on a tablet.

Tablets can't open raw TCP sockets, so they can't talk to the SQ5 directly. This
bridge runs on a PC on the church network, accepts WebSocket connections from
the app, and forwards each fader move to the mixer as MIDI NRPN over TCP.

```
  tablet  --WebSocket :3000-->  bridge PC  --MIDI over TCP :51325-->  SQ5
```

---

## Setting it up

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

## Checking it works

```
npm test              addressing and level maths, against the protocol document
node test-bridge.js   full round trip against a fake mixer, no hardware needed
```

Both run offline. `test-sq5.js` is the one that matters if Allen & Heath ever
change the protocol — it checks every worked example printed in the SQ MIDI
Protocol document.

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

This version only ever writes **input-to-aux send levels**, and only for the
channels the AV team has listed for that performer's role. It does not read
anything back from the mixer, and cannot touch EQ, effects, master outputs, or
anyone else's mix.
