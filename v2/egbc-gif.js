/* ===================================================================
   EGBC — making an animated GIF in the browser (comms window, 19 Oct 2026)
   ===================================================================

   THE EMAIL COMPILER'S GIF MAKER, MOVED HERE TO BE SHARED (FINDINGS-comms
   decision 1 and C-17: reuse, don't duplicate). The palette, the colour
   matching and the dithering are EmailBuilder2.html's own (median cut
   across every frame, so colours don't flicker between frames; Floyd-
   Steinberg dithering, so skies and faces don't band). The card maker
   uses this file; the Compiler is switched to it in its own commit
   (until then the same code is in both - see FINDINGS-comms C-17).

   Needs omggif's GifWriter (the same one the Compiler loads):
     <script src="https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.js"></script>

     EGBCGif.encode(frames, w, h, { delays, dither, loop }) -> Blob (image/gif)
        frames: ImageData.data arrays, all w x h
        delays: hundredths of a second, one per frame (or one number)
     EGBCGif.drawCover(ctx, img, w, h)   fill without stretching
   =================================================================== */
(function (global) {
  'use strict';

  /* Median-cut colour quantisation across all frames -> one representative palette. */
  function medianCutPalette(framesData, maxColors) {
    var hist = new Map();
    framesData.forEach(function (data) {
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var e = hist.get(key);
        if (e) e.c++; else hist.set(key, { r: r, g: g, b: b, c: 1 });
      }
    });
    var boxes = [Array.from(hist.values())];
    if (boxes[0].length === 0) return [{ r: 0, g: 0, b: 0 }];
    while (boxes.length < maxColors) {
      var bi = -1, widest = -1, axis = 0;
      for (var k = 0; k < boxes.length; k++) {
        var box = boxes[k];
        if (box.length < 2) continue;
        var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
        for (var q = 0; q < box.length; q++) {
          var p = box[q];
          if (p.r < rmin) rmin = p.r; if (p.r > rmax) rmax = p.r;
          if (p.g < gmin) gmin = p.g; if (p.g > gmax) gmax = p.g;
          if (p.b < bmin) bmin = p.b; if (p.b > bmax) bmax = p.b;
        }
        var rr = rmax - rmin, gr = gmax - gmin, br = bmax - bmin, mx = Math.max(rr, gr, br);
        if (mx > widest) { widest = mx; bi = k; axis = (rr >= gr && rr >= br) ? 0 : (gr >= br ? 1 : 2); }
      }
      if (bi < 0) break;
      var bx = boxes[bi];
      bx.sort(function (a, b) { return axis === 0 ? a.r - b.r : axis === 1 ? a.g - b.g : a.b - b.b; });
      var mid = bx.length >> 1;
      boxes.splice(bi, 1, bx.slice(0, mid), bx.slice(mid));
    }
    return boxes.map(function (box) {
      var r = 0, g = 0, b = 0, c = 0;
      box.forEach(function (p) { r += p.r * p.c; g += p.g * p.c; b += p.b * p.c; c += p.c; });
      c = c || 1;
      return { r: Math.round(r / c), g: Math.round(g / c), b: Math.round(b / c) };
    });
  }

  function nearestIndex(r, g, b, palette, cache) {
    var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    var hit = cache.get(key);
    if (hit !== undefined) return hit;
    var best = 0, bd = Infinity;
    for (var j = 0; j < palette.length; j++) {
      var p = palette[j], d = (r - p.r) * (r - p.r) + (g - p.g) * (g - p.g) + (b - p.b) * (b - p.b);
      if (d < bd) { bd = d; best = j; }
    }
    cache.set(key, best);
    return best;
  }

  function mapFrame(data, w, h, palette, cache) {
    var indexed = new Uint8Array(w * h);
    for (var p = 0; p < indexed.length; p++) indexed[p] = nearestIndex(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], palette, cache);
    return indexed;
  }

  /* Floyd-Steinberg dithering. */
  function ditherFrame(data, w, h, palette, cache) {
    var buf = new Float32Array(w * h * 3);
    for (var i = 0, j = 0; i < w * h; i++, j += 3) { buf[j] = data[i * 4]; buf[j + 1] = data[i * 4 + 1]; buf[j + 2] = data[i * 4 + 2]; }
    var clamp = function (v) { return v < 0 ? 0 : v > 255 ? 255 : v; };
    var indexed = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ii = y * w + x, jj = ii * 3;
        var r = clamp(buf[jj]), g = clamp(buf[jj + 1]), b = clamp(buf[jj + 2]);
        var idx = nearestIndex(r | 0, g | 0, b | 0, palette, cache);
        indexed[ii] = idx;
        var p = palette[idx], er = r - p.r, eg = g - p.g, eb = b - p.b, k;
        if (x + 1 < w) { k = (ii + 1) * 3; buf[k] += er * 7 / 16; buf[k + 1] += eg * 7 / 16; buf[k + 2] += eb * 7 / 16; }
        if (y + 1 < h) {
          if (x > 0) { k = (ii + w - 1) * 3; buf[k] += er * 3 / 16; buf[k + 1] += eg * 3 / 16; buf[k + 2] += eb * 3 / 16; }
          k = (ii + w) * 3; buf[k] += er * 5 / 16; buf[k + 1] += eg * 5 / 16; buf[k + 2] += eb * 5 / 16;
          if (x + 1 < w) { k = (ii + w + 1) * 3; buf[k] += er / 16; buf[k + 1] += eg / 16; buf[k + 2] += eb / 16; }
        }
      }
    }
    return indexed;
  }

  function drawCover(ctx, img, cw, ch, scale, dx) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var cr = cw / ch, ir = iw / ih, sw, sh, sx, sy;
    if (ir > cr) { sh = ih; sw = ih * cr; sx = (iw - sw) / 2; sy = 0; } else { sw = iw; sh = iw / cr; sx = 0; sy = (ih - sh) / 2; }
    /* Gentle zoom and pan (the card maker's movements): crop a little
       tighter, and slide the crop sideways. */
    var s = scale || 1;
    if (s !== 1 || dx) { var nw = sw / s, nh = sh / s; sx += (sw - nw) / 2 + (dx || 0) * (sw - nw) / 2; sy += (sh - nh) / 2; sw = nw; sh = nh; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  function encode(frames, w, h, o) {
    o = o || {};
    if (!global.GifWriter) throw new Error('omggif (GifWriter) is not loaded');
    var palette = medianCutPalette(frames, 256);
    var ints = palette.map(function (p) { return (p.r << 16) | (p.g << 8) | p.b; });
    while (ints.length < 2 || (ints.length & (ints.length - 1)) !== 0) ints.push(0);
    var buf = new Uint8Array(w * h * frames.length * 5 + 4096);
    var writer = new global.GifWriter(buf, w, h, { loop: o.loop == null ? 0 : o.loop });
    var cache = new Map(), dither = o.dither !== false;
    frames.forEach(function (data, i) {
      var indexed = dither ? ditherFrame(data, w, h, palette, cache) : mapFrame(data, w, h, palette, cache);
      var delay = Array.isArray(o.delays) ? (o.delays[i] || 8) : (o.delays || 8);
      writer.addFrame(0, 0, w, h, indexed, { palette: ints, delay: delay });
    });
    return new Blob([buf.slice(0, writer.end())], { type: 'image/gif' });
  }

  global.EGBCGif = { encode: encode, drawCover: drawCover, medianCutPalette: medianCutPalette, mapFrame: mapFrame, ditherFrame: ditherFrame };
})(window);
