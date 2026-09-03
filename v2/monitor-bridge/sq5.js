'use strict';
/*
 * NRPN encoding for the Allen & Heath SQ series.
 * Derived from "SQ MIDI Protocol Issue 5" and verified against every worked
 * example in that document (see test-sq5.js).
 *
 * ── How SQ addresses a parameter ─────────────────────────────────────────────
 * An NRPN write is four CC messages on the same MIDI channel:
 *
 *   BN 63 MSB    CC99  - parameter number, high 7 bits
 *   BN 62 LSB    CC98  - parameter number, low 7 bits
 *   BN 06 VC     CC6   - value, high 7 bits ("coarse")
 *   BN 26 VF     CC38  - value, low 7 bits ("fine")
 *
 * where N is the SQ's MIDI channel, 0-based. MSB/LSB together form a 14-bit
 * parameter number; VC/VF together form a 14-bit value.
 *
 * ── The send-level address map ───────────────────────────────────────────────
 * Level parameters begin at 0x40 0x00 (= 8192). The layout is:
 *
 *   8192 + s                      source s's own fader (its send to LR)
 *                                 s = 0..47  Ip1..Ip48
 *                                     48..59 Grp1..Grp12
 *                                     60..67 FX1Rtn..FX8Rtn
 *   8192 + 68 + s*12 + (aux-1)    source s's send to Aux 1..12
 *
 * i.e. the LR block is 68 entries wide (48 inputs + 12 groups + 8 FX returns),
 * and aux sends are stored as a block of 12 per source.
 *
 * Cross-checks against the document's examples (all exact):
 *   Ip1  -> LR    40 00      Ip40 -> LR    40 27
 *   Ip48 -> Aux1  44 78      Ip48 -> Aux12 45 03
 *   Ip40 -> Aux5  44 1C      Grp4 -> Aux8  45 2F
 *   FX1Rtn -> Aux7  46 1A  (as an assign, 66 1A - assign is level + 0x2000)
 *
 * ── Values ───────────────────────────────────────────────────────────────────
 * In the SQ's standard "Linear Taper" mode the 14-bit value is linear in dB:
 *
 *   0 dB   = 15196      +10 dB = 16383 (maximum)
 *   -10 dB = 14009      0      = -inf  (off)
 *
 * which works out to 118.72 steps per dB. The published dB table matches that
 * straight line to within 2 steps from +9 dB all the way down to -89 dB.
 */

const LEVEL_BASE = 0x40 * 128;   // 8192 - first level parameter (Ip1 fader / to LR)
const LR_BLOCK   = 68;           // 48 inputs + 12 groups + 8 FX returns
const AUX_COUNT  = 12;

const MAX_INPUT  = 48;

// Value points from the protocol document's Linear Taper table.
const UNITY      = 15196;        // 0 dB
const MAX_VALUE  = 16383;        // +10 dB
const STEPS_PER_DB = 118.72;

const CC_NRPN_MSB  = 0x63;
const CC_NRPN_LSB  = 0x62;
const CC_DATA_MSB  = 0x06;
const CC_DATA_LSB  = 0x26;

/** Parameter number for an input channel's send to an aux bus. Both 1-based. */
function auxSendParam(inputChannel, auxBus) {
  if (!Number.isInteger(inputChannel) || inputChannel < 1 || inputChannel > MAX_INPUT) {
    throw new RangeError('inputChannel must be an integer 1..' + MAX_INPUT + ', got ' + inputChannel);
  }
  if (!Number.isInteger(auxBus) || auxBus < 1 || auxBus > AUX_COUNT) {
    throw new RangeError('auxBus must be an integer 1..' + AUX_COUNT + ', got ' + auxBus);
  }
  return LEVEL_BASE + LR_BLOCK + (inputChannel - 1) * AUX_COUNT + (auxBus - 1);
}

/** dB -> 14-bit level value. Pass -Infinity (or null) for off. */
function dbToValue(db) {
  if (db === null || db === undefined || db === -Infinity) return 0;
  return clamp14(Math.round(UNITY + db * STEPS_PER_DB));
}

/** 14-bit level value -> dB, for display. Returns -Infinity for 0. */
function valueToDb(value) {
  if (value <= 0) return -Infinity;
  return (value - UNITY) / STEPS_PER_DB;
}

function clamp14(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_VALUE, Math.round(v)));
}

/**
 * Fader position (0.0 .. 1.0) -> dB.
 *
 * The SQ's 14-bit value is linear in dB, so mapping fader travel straight onto
 * it would put half-way up at about -64 dB - inaudible, with everything useful
 * crammed into the top quarter of the strip. Real faders don't behave like
 * that, so this applies an audio taper instead: a square law over a 60 dB
 * range, which puts the middle of the travel at -15 dB and keeps fine control
 * where a performer actually works.
 *
 *   1.00 -> topDb      0.50 -> topDb - 15 dB
 *   0.75 -> topDb -  4 dB   0.25 -> topDb - 34 dB
 *   0.00 -> off (-inf)
 *
 * topDb is the level a fader at the very top reaches. It defaults to 0 dB
 * (unity) rather than the mixer's +10 dB ceiling, so a fader pinned to the top
 * cannot push a wedge 10 dB hot.
 */
const TAPER_RANGE_DB = 60;

function positionToDb(level, topDb) {
  const top = (topDb === undefined || topDb === null) ? 0 : Number(topDb);
  const p = Math.max(0, Math.min(1, Number(level)));
  if (p <= 0) return -Infinity;
  const below = 1 - p;
  return top - TAPER_RANGE_DB * below * below;
}

/** Fader position (0.0 .. 1.0) -> 14-bit level value, via the audio taper. */
function levelToValue(level, topDb) {
  return dbToValue(positionToDb(level, topDb));
}

/**
 * The 12 raw MIDI bytes that set one aux send level.
 * midiChannel is 1-based (SQ default 1); value is 14-bit.
 */
function encodeNrpn(midiChannel, param, value) {
  const n = 0xB0 | ((Math.max(1, Math.min(16, midiChannel)) - 1) & 0x0F);
  const p = param & 0x3FFF;
  const v = clamp14(value);
  return Buffer.from([
    n, CC_NRPN_MSB, (p >> 7) & 0x7F,
    n, CC_NRPN_LSB, p & 0x7F,
    n, CC_DATA_MSB, (v >> 7) & 0x7F,
    n, CC_DATA_LSB, v & 0x7F,
  ]);
}

/** Convenience: bytes to set input -> aux send level. */
function encodeAuxSend(midiChannel, inputChannel, auxBus, value) {
  return encodeNrpn(midiChannel, auxSendParam(inputChannel, auxBus), value);
}

/*
 * Assignment (is this channel routed into that mix at all?) lives in a parallel
 * block above the level block: level MSB 0x40 becomes assign MSB 0x60. That is
 * +0x20 in the MSB, and an MSB step is worth 128, so the parameter numbers are
 * 0x20 * 128 = 4096 apart - NOT 0x2000. Getting that wrong overflows the 14-bit
 * address space and the assignment silently never matches.
 *
 * Checked against the document's assign examples: FX1Rtn->Aux7 assign is 66 1A
 * (13082) and the matching level address is 8986, exactly 4096 lower.
 */
const ASSIGN_OFFSET = 0x20 * 128;   // 4096

function auxAssignParam(inputChannel, auxBus) {
  return auxSendParam(inputChannel, auxBus) + ASSIGN_OFFSET;
}

/*
 * The 'get' command: the same address bytes, then a Data Increment (CC96) of
 * 0x7F rather than a value. The mixer replies with a normal 4-message NRPN
 * write carrying the current value.
 */
const CC_DATA_INC = 0x60;

function encodeGet(midiChannel, param) {
  const n = 0xB0 | ((Math.max(1, Math.min(16, midiChannel)) - 1) & 0x0F);
  const p = param & 0x3FFF;
  return Buffer.from([
    n, CC_NRPN_MSB, (p >> 7) & 0x7F,
    n, CC_NRPN_LSB, p & 0x7F,
    n, CC_DATA_INC, 0x7F,
  ]);
}

/** Given a level parameter number, which input/aux is it? null if out of range. */
function decodeAuxSendParam(param) {
  const off = param - (LEVEL_BASE + LR_BLOCK);
  if (off < 0) return null;
  const src = Math.floor(off / AUX_COUNT);
  if (src >= MAX_INPUT) return null;            // groups and FX returns, not ours
  return { inputChannel: src + 1, auxBus: (off % AUX_COUNT) + 1 };
}

/** dB -> fader position, the inverse of positionToDb. For showing desk levels. */
function dbToPosition(db, topDb) {
  const top = (topDb === undefined || topDb === null) ? 0 : Number(topDb);
  if (!Number.isFinite(db)) return 0;
  const drop = top - db;
  if (drop <= 0) return 1;
  if (drop >= TAPER_RANGE_DB) return 0;
  return 1 - Math.sqrt(drop / TAPER_RANGE_DB);
}

/** 14-bit level value -> fader position. */
function valueToPosition(value, topDb) {
  if (value <= 0) return 0;
  return dbToPosition(valueToDb(value), topDb);
}

module.exports = {
  auxSendParam, auxAssignParam, decodeAuxSendParam,
  encodeNrpn, encodeAuxSend, encodeGet,
  dbToValue, valueToDb, positionToDb, dbToPosition, levelToValue, valueToPosition, clamp14,
  LEVEL_BASE, LR_BLOCK, AUX_COUNT, MAX_INPUT, UNITY, MAX_VALUE, STEPS_PER_DB,
  TAPER_RANGE_DB, ASSIGN_OFFSET,
};
