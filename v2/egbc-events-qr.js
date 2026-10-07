/* ===================================================================
   EGBC — QR codes for event check-in (events window)
   ===================================================================

   Makes the QR code a person shows at the door. Written here rather than
   loaded from a CDN because the confirmation email is composed the moment
   a sign-up succeeds: the code has to be ready then, every time, without
   waiting on a script from somewhere else.

     EGBCEventsQR.matrix(text)   -> array of rows of true (dark) / false
     EGBCEventsQR.svg(text, px)  -> an <svg> string, for a page
     EGBCEventsQR.pngBase64(text, scale) -> base64 PNG, for an email attachment

   Byte mode, error correction level M, versions 1-10 (up to 213 bytes,
   far more than a check-in code needs). The layout follows the QR
   standard's own construction; the tests read every code back with an
   independent decoder (jsQR) rather than trusting this file to check
   itself.

   Works in a browser and in Node (the tests), so nothing here touches the
   page except pngBase64, which needs a canvas.
   =================================================================== */

(function (global) {
  'use strict';

  /* Level M only. [total codewords, ec codewords per block, blocks] */
  var VERSIONS = [null,
    [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2],
    [172, 16, 4], [196, 18, 4], [242, 22, 4], [292, 22, 5], [346, 26, 5]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  var EC_FORMAT_M = 0;

  /* ---- Reed-Solomon over GF(256), polynomial 0x11d ---- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function generator(degree) {
    var g = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function remainder(data, degree) {
    var g = generator(degree);
    var r = new Array(degree).fill(0);
    data.forEach(function (b) {
      var f = b ^ r[0];
      r.shift(); r.push(0);
      for (var i = 0; i < degree; i++) r[i] ^= mul(g[i + 1], f);
    });
    return r;
  }

  /* ---- the data ---- */
  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(String(text)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function capacityBytes(v) {
    var t = VERSIONS[v];
    var dataCw = t[0] - t[1] * t[2];
    var countBits = v < 10 ? 8 : 16;
    return Math.floor((dataCw * 8 - 4 - countBits) / 8);
  }

  function chooseVersion(n) {
    for (var v = 1; v <= 10; v++) if (n <= capacityBytes(v)) return v;
    throw new Error('Too long for a check-in code');
  }

  function dataCodewords(bytes, v) {
    var t = VERSIONS[v], dataCw = t[0] - t[1] * t[2];
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, dataCw * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var out = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      out.push(b);
    }
    for (var pad = 0xec; out.length < dataCw; pad ^= 0xec ^ 0x11) out.push(pad);
    return out;
  }

  /* Split into blocks (the short ones first), add each block's error
     correction, then interleave: byte 0 of every block, byte 1 of every
     block, and so on, then the same for the error correction. */
  function interleave(data, v) {
    var t = VERSIONS[v], total = t[0], ecLen = t[1], nBlocks = t[2];
    var nShort = nBlocks - (total % nBlocks);
    var shortLen = Math.floor(total / nBlocks) - ecLen;
    var blocks = [], ecs = [], k = 0;
    for (var i = 0; i < nBlocks; i++) {
      var len = shortLen + (i < nShort ? 0 : 1);
      var blk = data.slice(k, k + len); k += len;
      blocks.push(blk); ecs.push(remainder(blk, ecLen));
    }
    var out = [];
    for (var c = 0; c <= shortLen; c++) {
      for (var b = 0; b < nBlocks; b++) if (c < blocks[b].length) out.push(blocks[b][c]);
    }
    for (var e = 0; e < ecLen; e++) {
      for (var b2 = 0; b2 < nBlocks; b2++) out.push(ecs[b2][e]);
    }
    return out;
  }

  /* ---- the grid ---- */
  function Grid(v) {
    this.size = v * 4 + 17;
    this.m = []; this.fn = [];
    for (var y = 0; y < this.size; y++) {
      this.m.push(new Array(this.size).fill(false));
      this.fn.push(new Array(this.size).fill(false));
    }
  }
  Grid.prototype.set = function (x, y, dark) { this.m[y][x] = dark; this.fn[y][x] = true; };

  function finder(g, cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        g.set(x, y, d !== 2 && d !== 4);
      }
    }
  }

  function alignment(g, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        g.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function formatBits(g, mask) {
    var data = (EC_FORMAT_M << 3) | mask, rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    var s = g.size;
    for (var a = 0; a <= 5; a++) g.set(8, a, bit(bits, a));
    g.set(8, 7, bit(bits, 6));
    g.set(8, 8, bit(bits, 7));
    g.set(7, 8, bit(bits, 8));
    for (var b = 9; b < 15; b++) g.set(14 - b, 8, bit(bits, b));
    for (var c = 0; c < 8; c++) g.set(s - 1 - c, 8, bit(bits, c));
    for (var d = 8; d < 15; d++) g.set(8, s - 15 + d, bit(bits, d));
    g.set(8, s - 8, true);
  }

  function versionBits(g, v) {
    if (v < 7) return;
    var rem = v;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (v << 12) | rem;
    for (var j = 0; j < 18; j++) {
      var a = g.size - 11 + (j % 3), b = Math.floor(j / 3);
      g.set(a, b, bit(bits, j));
      g.set(b, a, bit(bits, j));
    }
  }

  function functionPatterns(g, v) {
    var s = g.size;
    for (var i = 0; i < s; i++) { g.set(6, i, i % 2 === 0); g.set(i, 6, i % 2 === 0); }
    finder(g, 3, 3); finder(g, s - 4, 3); finder(g, 3, s - 4);
    var pos = ALIGN[v], n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0)) continue;
        alignment(g, pos[a], pos[b]);
      }
    }
    formatBits(g, 0);   /* reserves the cells; redrawn with the real mask */
    versionBits(g, v);
  }

  function place(g, cw) {
    var i = 0, s = g.size, total = cw.length * 8;
    for (var right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < s; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var up = ((right + 1) & 2) === 0;
          var y = up ? s - 1 - vert : vert;
          if (!g.fn[y][x] && i < total) {
            g.m[y][x] = bit(cw[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
    function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; }
  ];

  function applyMask(g, k) {
    for (var y = 0; y < g.size; y++) {
      for (var x = 0; x < g.size; x++) {
        if (!g.fn[y][x] && MASKS[k](x, y)) g.m[y][x] = !g.m[y][x];
      }
    }
  }

  /* Any of the eight masks gives a readable code. Scoring picks the one
     that avoids long runs, solid blocks and a lopsided dark/light balance,
     which is what makes a code easy for a phone camera. */
  function penalty(g) {
    var s = g.size, p = 0, dark = 0, x, y, run;
    for (y = 0; y < s; y++) {
      run = 1;
      for (x = 1; x < s; x++) {
        if (g.m[y][x] === g.m[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    for (x = 0; x < s; x++) {
      run = 1;
      for (y = 1; y < s; y++) {
        if (g.m[y][x] === g.m[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    for (y = 0; y < s - 1; y++) {
      for (x = 0; x < s - 1; x++) {
        var c = g.m[y][x];
        if (c === g.m[y][x + 1] && c === g.m[y + 1][x] && c === g.m[y + 1][x + 1]) p += 3;
      }
    }
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) if (g.m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }

  function matrix(text) {
    var bytes = utf8(text);
    var v = chooseVersion(bytes.length);
    var cw = interleave(dataCodewords(bytes, v), v);
    var best = null, bestScore = Infinity;
    for (var k = 0; k < 8; k++) {
      var g = new Grid(v);
      functionPatterns(g, v);
      place(g, cw);
      applyMask(g, k);
      formatBits(g, k);
      var score = penalty(g);
      if (score < bestScore) { best = g; bestScore = score; }
    }
    return best.m;
  }

  /* ---- drawing ---- */
  var QUIET = 4;

  function svg(text, px) {
    var m = matrix(text), n = m.length, full = n + QUIET * 2, d = '';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + QUIET) + ' ' + (y + QUIET) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + full + ' ' + full + '"' +
      (px ? ' width="' + px + '" height="' + px + '"' : '') +
      ' shape-rendering="crispEdges" role="img" aria-label="Check-in code">' +
      '<rect width="' + full + '" height="' + full + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#111827"/></svg>';
  }

  /* Black on white, not the brand colour: a camera in a dim church hall
     reads the highest contrast best. */
  function pngBase64(text, scale) {
    var m = matrix(text), n = m.length, sc = scale || 8, full = (n + QUIET * 2) * sc;
    var c = document.createElement('canvas');
    c.width = full; c.height = full;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, full, full);
    ctx.fillStyle = '#000';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) if (m[y][x]) ctx.fillRect((x + QUIET) * sc, (y + QUIET) * sc, sc, sc);
    }
    return c.toDataURL('image/png').split(',')[1];
  }

  var api = { matrix: matrix, svg: svg, pngBase64: pngBase64, QUIET: QUIET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCEventsQR = api;

})(typeof window !== 'undefined' ? window : this);
