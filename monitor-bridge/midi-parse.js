'use strict';
/*
 * Turns the byte stream coming back from the SQ into NRPN parameter/value pairs.
 *
 * The mixer answers a 'get' with the same four CC messages used to set a value:
 *
 *   BN 63 MSB   BN 62 LSB   BN 06 VC   BN 26 VF
 *
 * but they arrive mixed in with everything else the desk emits, split across
 * arbitrary TCP reads, and possibly using running status (where a status byte
 * is sent once and the following data bytes reuse it). So this is a proper
 * little MIDI stream parser rather than a regex over a buffer:
 *
 *  - it tracks running status
 *  - it skips SysEx and anything else it doesn't care about
 *  - it lets realtime bytes (F8-FF) interrupt a message without corrupting it
 *  - it survives being handed one byte at a time
 *
 * Feed it with push(buffer); it calls onParam(param, value, channel) each time
 * a complete NRPN write lands.
 */

const CC_NRPN_MSB = 0x63;
const CC_NRPN_LSB = 0x62;
const CC_DATA_MSB = 0x06;
const CC_DATA_LSB = 0x26;

// Data bytes expected after each status nibble.
function dataLength(status) {
  switch (status & 0xF0) {
    case 0x80: case 0x90: case 0xA0: case 0xB0: case 0xE0: return 2;
    case 0xC0: case 0xD0: return 1;
    default: return 0;
  }
}

class NrpnParser {
  constructor(onParam) {
    this.onParam = onParam;
    this.running = 0;        // current running status byte
    this.data = [];          // data bytes collected for the current message
    this.inSysex = false;
    // Per MIDI channel: the address most recently selected, and the coarse
    // value seen, so CC38 can complete the pair.
    this.state = Array.from({ length: 16 }, () => ({ msb: null, lsb: null, vc: null }));
  }

  push(buf) {
    for (let i = 0; i < buf.length; i++) this.byte(buf[i]);
  }

  byte(b) {
    // Realtime messages may appear anywhere, even between data bytes.
    if (b >= 0xF8) return;

    if (b & 0x80) {
      if (b === 0xF0) { this.inSysex = true; this.running = 0; this.data = []; return; }
      if (b === 0xF7) { this.inSysex = false; return; }
      // Any other status byte ends a SysEx that was never terminated.
      this.inSysex = false;
      if (b >= 0xF1 && b <= 0xF7) { this.running = 0; this.data = []; return; }
      this.running = b;
      this.data = [];
      return;
    }

    if (this.inSysex) return;
    if (!this.running) return;          // data with no status yet - ignore

    this.data.push(b);
    if (this.data.length < dataLength(this.running)) return;

    const status = this.running;
    const bytes = this.data;
    this.data = [];                     // running status: keep this.running

    if ((status & 0xF0) === 0xB0) this.control(status & 0x0F, bytes[0], bytes[1]);
  }

  control(channel, cc, value) {
    const s = this.state[channel];
    switch (cc) {
      case CC_NRPN_MSB: s.msb = value; s.vc = null; break;
      case CC_NRPN_LSB: s.lsb = value; s.vc = null; break;
      case CC_DATA_MSB: s.vc = value; break;
      case CC_DATA_LSB:
        if (s.msb !== null && s.lsb !== null && s.vc !== null) {
          const param = (s.msb << 7) | s.lsb;
          this.onParam(param, (s.vc << 7) | value, channel);
        }
        break;
      default: break;                   // not part of an NRPN write
    }
  }
}

module.exports = { NrpnParser };
