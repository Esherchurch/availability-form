/* ===================================================================
   Mix Builder — DSP
   ===================================================================

   Everything that touches samples. No DOM, no project model, no
   IndexedDB — pass buffers in, get buffers back, so every function
   here can be tested on its own.

   Lifted from v2/mix-analyser.html (the prototype), with the DOM
   reads replaced by explicit arguments and the four transition types
   split into named renderers.

   The four lessons from the prototype are baked in and must stay:
     1. contentEndSec — never anchor a transition to the end of a file.
     2. finalise      — summed clips exceed full scale; pull them back.
     3. EQ, not HPSS, for "keep the beat going" (renderBridge).
     4. Overlap-add normalisation divisors are clamped, or the edges
        of every stretched buffer amplify into distortion.
   =================================================================== */

(function (global) {
  'use strict';

  /* ----------------------------------------------------------- FFT --- */
  /* Injected into both workers as source so neither needs an import. */

  var FFT_SRC = `
function fft(re, im){
  const n = re.length;
  for (let i=1, j=0; i<n; i++){
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; }
  }
  for (let len=2; len<=n; len<<=1){
    const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i=0; i<n; i+=len){
      let cr = 1, ci = 0;
      for (let k=0; k<len/2; k++){
        const ur=re[i+k], ui=im[i+k];
        const vr=re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi=re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi;
        re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const ncr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = ncr;
      }
    }
  }
}
function ifft(re, im){
  const n = re.length;
  for (let i=0;i<n;i++) im[i] = -im[i];
  fft(re, im);
  for (let i=0;i<n;i++){ re[i] /= n; im[i] = -im[i]/n; }
}
function hann(N){
  const w = new Float32Array(N);
  for (let i=0;i<N;i++) w[i] = 0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1));
  return w;
}
`;

  /* ----------------------------------------------- analysis worker --- */

  var ANALYSIS_SRC = FFT_SRC + `
function onsetEnvelope(x, sr){
  const N = 1024, hop = 512, half = N/2;
  const win = hann(N);
  const frames = Math.max(0, Math.floor((x.length - N)/hop));
  const env = new Float32Array(frames);
  let prev = new Float32Array(half);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f=0; f<frames; f++){
    const off = f*hop;
    for (let i=0;i<N;i++){ re[i] = x[off+i]*win[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    const cur = new Float32Array(half);
    for (let k=0;k<half;k++){
      const m = Math.sqrt(re[k]*re[k] + im[k]*im[k]);
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = flux; prev = cur;
    if ((f & 255) === 0) postMessage({type:'progress', v: f/frames});
  }
  const W = 20, out = new Float32Array(frames);
  for (let f=0; f<frames; f++){
    let a=0, n=0;
    for (let k=Math.max(0,f-W); k<Math.min(frames,f+W); k++){ a+=env[k]; n++; }
    const d = env[f] - a/n;
    out[f] = d > 0 ? d : 0;
  }
  return { env: out, fps: sr/hop };
}
function estimateTempo(env, fps){
  const minLag = Math.floor(fps*60/200), maxLag = Math.ceil(fps*60/70);
  const scores = [];
  for (let lag=minLag; lag<=maxLag; lag++){
    let s = 0, n = 0;
    for (let i=0; i+lag<env.length; i++){ s += env[i]*env[i+lag]; n++; }
    s /= (n || 1);
    const bpm = 60*fps/lag;
    const w = Math.exp(-0.5*Math.pow(Math.log(bpm/120)/0.30, 2));
    scores.push({ lag, bpm, raw: s, score: s*w });
  }
  scores.sort((a,b)=>b.score-a.score);
  const best = scores[0];
  const mean = scores.reduce((a,b)=>a+b.raw,0)/scores.length;
  return { bpm: best.bpm, lag: best.lag,
           confidence: Math.max(0, Math.min(1, (best.raw/(mean||1) - 1)/3)) };
}
function findPhase(env, lag){
  let bestOff = 0, best = -1;
  for (let off=0; off<lag; off++){
    let s = 0;
    for (let i=off; i<env.length; i+=lag) s += env[i];
    if (s > best){ best = s; bestOff = off; }
  }
  return bestOff;
}
function findDownbeat(env, lag, phase){
  let bestP = 0, best = -1;
  for (let p=0; p<4; p++){
    let s = 0;
    for (let i=phase + p*lag; i<env.length; i += lag*4) s += env[i];
    if (s > best){ best = s; bestP = p; }
  }
  return phase + bestP*lag;
}

onmessage = e => {
  const { mono, sr } = e.data;
  const x = new Float32Array(mono);
  const { env, fps } = onsetEnvelope(x, sr);
  const t = estimateTempo(env, fps);
  const phase = findPhase(env, t.lag);
  const db = findDownbeat(env, t.lag, phase);
  postMessage({ type:'done', bpm: t.bpm, confidence: t.confidence,
                firstBeatSec: phase/fps, downbeatSec: db/fps });
};`;

  /* --------------------------------------------------- HPSS worker --- */
  /* Harmonic/percussive separation by median filtering the spectrogram.
     The mask is computed once from the mono sum and applied to every
     channel, so the stereo image cannot drift apart. Masks sum to 1, so
     harmonic + percussive reconstructs the original exactly.

     Used for samples (strip drums out of a hook) and as the non-default
     aggressive bridge. Far too slow for whole tracks — regions only. */

  var HPSS_SRC = FFT_SRC + `
const N = 2048, HOP = 512, HALF = N/2 + 1;

function analyse(x, win){
  const frames = Math.max(1, Math.floor((x.length - N)/HOP) + 1);
  const RE = [], IM = [];
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f=0; f<frames; f++){
    const off = f*HOP;
    for (let i=0;i<N;i++){ const v = x[off+i]; re[i] = (v===undefined?0:v)*win[i]; im[i] = 0; }
    fft(re, im);
    RE.push(re.slice(0, HALF));
    IM.push(im.slice(0, HALF));
  }
  return { RE, IM, frames };
}

function synth(RE, IM, win, len){
  const frames = RE.length;
  const out = new Float32Array(len);
  const norm = new Float32Array(len);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f=0; f<frames; f++){
    for (let k=0;k<HALF;k++){ re[k] = RE[f][k]; im[k] = IM[f][k]; }
    for (let k=HALF;k<N;k++){ re[k] = RE[f][N-k]; im[k] = -IM[f][N-k]; }
    ifft(re, im);
    const off = f*HOP;
    for (let i=0;i<N;i++){
      if (off+i >= len) break;
      out[off+i] += re[i]*win[i];
      norm[off+i] += win[i]*win[i];
    }
  }
  // Hann-squared at 4x overlap sums to ~1.5 in steady state. Clamping the
  // divisor means the first and last frames taper away instead of being
  // amplified into distortion.
  for (let i=0;i<len;i++) out[i] /= Math.max(norm[i], 0.4);
  return out;
}

function median(arr, n){
  const a = arr.slice(0, n).sort((x,y)=>x-y);
  return a[n >> 1];
}

onmessage = e => {
  const { chans, sr, p } = e.data;
  const win = hann(N);
  const L = chans.map(c => new Float32Array(c));
  const len = L[0].length;

  const mono = new Float32Array(len);
  for (const c of L) for (let i=0;i<len;i++) mono[i] += c[i]/L.length;

  postMessage({ type:'progress', v:0.05, msg:'analysing' });
  const M = analyse(mono, win);
  const frames = M.frames;
  const S = [];
  for (let f=0; f<frames; f++){
    const row = new Float32Array(HALF);
    for (let k=0;k<HALF;k++) row[k] = Math.hypot(M.RE[f][k], M.IM[f][k]);
    S.push(row);
  }

  const KT = 17, KF = 17, ht = KT >> 1, hf = KF >> 1;
  const H = [], P = [];
  const scratch = new Float32Array(Math.max(KT, KF));

  postMessage({ type:'progress', v:0.3, msg:'separating' });
  for (let f=0; f<frames; f++){
    const hr = new Float32Array(HALF), pr = new Float32Array(HALF);
    for (let k=0;k<HALF;k++){
      let n = 0;
      for (let d=-ht; d<=ht; d++){
        const ff = f+d;
        if (ff >= 0 && ff < frames) scratch[n++] = S[ff][k];
      }
      hr[k] = median(scratch, n);
      n = 0;
      for (let d=-hf; d<=hf; d++){
        const kk = k+d;
        if (kk >= 0 && kk < HALF) scratch[n++] = S[f][kk];
      }
      pr[k] = median(scratch, n);
    }
    H.push(hr); P.push(pr);
    if ((f & 63) === 0) postMessage({ type:'progress', v: 0.3 + 0.5*f/frames, msg:'separating' });
  }

  postMessage({ type:'progress', v:0.82, msg:'rebuilding' });
  const harmCh = [], percCh = [];
  for (let c=0; c<L.length; c++){
    const A = analyse(L[c], win);
    const HR = [], HI = [], PR = [], PI = [];
    for (let f=0; f<A.frames; f++){
      const hr = new Float32Array(HALF), hi = new Float32Array(HALF);
      const pr = new Float32Array(HALF), pi = new Float32Array(HALF);
      const g = Math.min(f, frames-1);
      for (let k=0;k<HALF;k++){
        const hp = Math.pow(H[g][k], p), pp = Math.pow(P[g][k], p);
        const mh = (hp + pp) > 1e-20 ? hp/(hp+pp) : 0.5;
        hr[k] = A.RE[f][k]*mh;      hi[k] = A.IM[f][k]*mh;
        pr[k] = A.RE[f][k]*(1-mh);  pi[k] = A.IM[f][k]*(1-mh);
      }
      HR.push(hr); HI.push(hi); PR.push(pr); PI.push(pi);
    }
    harmCh.push(synth(HR, HI, win, len));
    percCh.push(synth(PR, PI, win, len));
  }

  const transfer = [];
  for (const c of harmCh) transfer.push(c.buffer);
  for (const c of percCh) transfer.push(c.buffer);
  postMessage({ type:'done',
                harmonic: harmCh.map(c=>c.buffer),
                percussive: percCh.map(c=>c.buffer),
                len }, transfer);
};
`;

  /* ------------------------------------------------ worker plumbing --- */

  function runWorker(src, payload, transfer, onProgress) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var w = new Worker(url);
      var done = function () { w.terminate(); URL.revokeObjectURL(url); };
      w.onmessage = function (ev) {
        if (ev.data.type === 'progress') { if (onProgress) onProgress(ev.data); return; }
        done(); resolve(ev.data);
      };
      w.onerror = function (err) { done(); reject(err); };
      w.postMessage(payload, transfer);
    });
  }

  /** Tempo, beat phase and downbeat for one mono signal. Runs in a Worker. */
  function analyseBeat(mono, sr, onProgress) {
    var copy = mono.slice();
    return runWorker(ANALYSIS_SRC, { mono: copy.buffer, sr }, [copy.buffer],
      function (d) { if (onProgress) onProgress(d.v); });
  }

  /** Harmonic/percussive split of one AudioBuffer. Regions only — slow. */
  function hpss(ctx, buf, p, onProgress) {
    var chans = [], transfer = [];
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var copy = buf.getChannelData(c).slice();
      chans.push(copy.buffer); transfer.push(copy.buffer);
    }
    return runWorker(HPSS_SRC, { chans: chans, sr: buf.sampleRate, p: p }, transfer, onProgress)
      .then(function (res) {
        var mk = function (arrs) {
          var out = ctx.createBuffer(arrs.length, res.len, buf.sampleRate);
          arrs.forEach(function (ab, i) { out.copyToChannel(new Float32Array(ab), i); });
          return out;
        };
        return { harmonic: mk(res.harmonic), percussive: mk(res.percussive) };
      });
  }

  /* ----------------------------------------------------- utilities --- */

  function toMono(buf) {
    var n = buf.length, out = new Float32Array(n), chans = buf.numberOfChannels;
    for (var c = 0; c < chans; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < n; i++) out[i] += d[i] / chans;
    }
    return out;
  }

  /* Last moment the track is actually audible. Releases fade out and encoders
     leave trailing silence; anchoring a transition to buffer.duration means
     mixing out of nothing — the first prototype bridge sounded like a straight
     cut for exactly this reason. */
  function contentEndSec(mono, sr) {
    var W = 2048, thresh = 0.02;      // about -34 dBFS RMS
    for (var i = mono.length - W; i > 0; i -= W) {
      var s = 0;
      for (var k = 0; k < W; k++) { var v = mono[i + k]; s += v * v; }
      if (Math.sqrt(s / W) > thresh) return (i + W) / sr;
    }
    return mono.length / sr;
  }

  /* The last moment the track is still at FULL STRENGTH — not merely audible.
     ------------------------------------------------------------------
     contentEndSec returns the last window above about -34 dBFS, which is the
     right answer for "where does the file stop making noise". It is the wrong
     answer for "where can I still take a beat from", because on a record with a
     twenty-second fade-out it lands deep inside the fade.

     Anchoring a beat bridge there was measured producing a full second of
     digital silence at -93 dBFS between two records, with the beat-alone
     section sitting at -31 dBFS against a -17 dBFS mix. The bridge was working
     exactly as built, in a part of the record that had already gone.

     So: take the track's own strong level (the median of its louder half) and
     scan back for the last point still within `dropDb` of it. That is where the
     record is still playing rather than ending. */
  function lastStrongSec(mono, sr, opts) {
    opts = opts || {};
    var dropDb = opts.dropDb == null ? 5 : opts.dropDb;
    var W = Math.max(1, Math.floor(sr * 0.25));
    var n = Math.floor(mono.length / W);
    if (n < 4) return mono.length / sr;

    var levels = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var k = 0; k < W; k++) { var v = mono[i * W + k]; s += v * v; }
      levels[i] = Math.sqrt(s / W);
    }
    // Reference = median of the top half, so quiet intros and outros do not
    // drag it down and a single loud transient does not pull it up.
    var sorted = Array.prototype.slice.call(levels).sort(function (a, b) { return a - b; });
    var strong = sorted[Math.floor(n * 0.75)] || 0;
    if (strong <= 0) return mono.length / sr;
    var floorLevel = strong * Math.pow(10, -dropDb / 20);

    for (var j = n - 1; j >= 0; j--) {
      if (levels[j] >= floorLevel) return Math.min(mono.length / sr, (j + 1) * W / sr);
    }
    return mono.length / sr;
  }

  function peaks(mono, buckets) {
    var out = new Float32Array(buckets);
    var size = Math.floor(mono.length / buckets) || 1;
    for (var b = 0; b < buckets; b++) {
      var m = 0, start = b * size, end = Math.min(mono.length, start + size);
      for (var i = start; i < end; i++) { var a = Math.abs(mono[i]); if (a > m) m = a; }
      out[b] = m;
    }
    return out;
  }

  function slice(ctx, buf, startSec, durSec) {
    var sr = buf.sampleRate;
    var s = Math.max(0, Math.floor(startSec * sr));
    var n = Math.min(buf.length - s, Math.floor(durSec * sr));
    var out = ctx.createBuffer(buf.numberOfChannels, Math.max(1, n), sr);
    for (var c = 0; c < buf.numberOfChannels; c++) {
      out.copyToChannel(buf.getChannelData(c).subarray(s, s + n), c);
    }
    return out;
  }

  /** RMS of a window of a buffer, for sanity-checking a rendered region. */
  function rmsOf(buf, startSec, durSec) {
    var sr = buf.sampleRate;
    var s = Math.max(0, Math.floor(startSec * sr));
    var n = Math.min(buf.length - s, Math.floor(durSec * sr));
    if (n <= 0) return 0;
    var acc = 0, d = buf.getChannelData(0);
    for (var i = s; i < s + n; i++) acc += d[i] * d[i];
    return Math.sqrt(acc / n);
  }

  /* WSOLA time-stretch. ratio > 1 makes the output shorter (faster).
     Pitch preserved. Alignment offsets are computed once from the mono sum and
     applied to every channel, so the stereo image cannot drift. */
  function stretch(ctx, buf, ratio) {
    if (Math.abs(ratio - 1) < 0.0005) return buf;
    var N = 2048, Hs = N / 4, Ha = Math.round(Hs * ratio), search = 256;
    var chans = buf.numberOfChannels;
    var outLen = Math.ceil(buf.length / ratio) + N;
    var out = ctx.createBuffer(chans, outLen, buf.sampleRate);

    var win = new Float32Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

    var ref = toMono(buf);
    // The read head must advance by exactly Ha per frame ON AVERAGE, or the
    // stretch ratio is not what was asked for. So the search is anchored to an
    // ideal grid position that always advances by Ha, and the alignment offset
    // is applied relative to that grid and thrown away each frame.
    //
    // Anchoring the next search to the PREVIOUS CHOSEN position instead lets
    // the offset accumulate without bound, and on sustained material it does:
    // a periodic waveform's best continuation is always one pitch period back,
    // the search obliges every frame, and the drift cancels the hop exactly.
    // Measured on a loop with a sustained bass note, a ratio of 1.05 produced a
    // correctly shortened buffer whose content was still at the original tempo
    // — the one failure mode that would make every beat-match silently wrong.
    var offsets = [], ideal = 0, prevTail = null;
    for (var sp = 0; sp + N < outLen; sp += Hs) {
      var base = Math.round(ideal);
      var delta = 0;
      if (prevTail) {
        // Normalised cross-correlation, and ties break towards d = 0.
        //
        // Both matter. Raw correlation is biased towards whichever candidate
        // window happens to be loudest rather than the one that actually lines
        // up, and dividing by the window's own energy removes that. The
        // tie-break matters more: over a silent or near-silent passage every
        // candidate scores the same, and picking the first one tried parks the
        // frame at d = -search. That slips the read head back a quarter of a
        // hop every frame, and the output drifts badly off the tempo the ratio
        // asked for — measured at 67 BPM instead of 126 on a sparse signal.
        // Preferring the smallest |d| leaves an ambiguous frame exactly where
        // the ratio put it, which is the whole point of the hop.
        var best = -Infinity;
        for (var d = -search; d <= search; d++) {
          var a0 = base + d;
          if (a0 < 0 || a0 + Hs >= ref.length) continue;
          var acc = 0, en = 0;
          for (var j = 0; j < Hs; j += 4) {
            var r = ref[a0 + j];
            acc += prevTail[j] * r;
            en += r * r;
          }
          var score = en > 1e-12 ? acc / Math.sqrt(en) : 0;
          if (score > best || (score === best && Math.abs(d) < Math.abs(delta))) {
            best = score; delta = d;
          }
        }
      }
      var a = Math.max(0, Math.min(ref.length - N - 1, base + delta));
      offsets.push(a);
      prevTail = ref.subarray(a + Hs, a + Hs + Hs);
      ideal += Ha;
      if (ideal + N + search >= ref.length) break;
    }

    for (var c = 0; c < chans; c++) {
      var src = buf.getChannelData(c), dst = out.getChannelData(c);
      var norm = new Float32Array(outLen);
      for (var f = 0; f < offsets.length; f++) {
        var off = offsets[f], sp2 = f * Hs;
        for (var k = 0; k < N; k++) {
          var v = src[off + k];
          if (v === undefined) break;
          dst[sp2 + k] += v * win[k];
          norm[sp2 + k] += win[k];
        }
      }
      // Hann at 4x overlap sums to ~2.0 in steady state; clamp so the tail of
      // the stretched buffer fades out rather than being multiplied up.
      for (var m = 0; m < outLen; m++) dst[m] /= Math.max(norm[m], 0.5);
    }
    return out;
  }

  /* Time-stretch with a ratio that RAMPS from r0 to r1 across the output.
     This is the pitch fader: a record is brought in matched to the one before
     it and eased towards the tempo the next one needs, over minutes, so the
     change is a fraction of a percent per minute and nobody hears it.

     It exists because of a measurement. WSOLA's alignment search moves every
     frame by up to ±256 samples, so the mapping from output position back to
     source position is linear only on average — locally it jitters. Two pieces
     of independently stretched audio therefore cannot be spliced: butting a
     stretched transition against an unstretched track middle was measured
     landing more than a full signal amplitude out (+9.4 dB of error against the
     signal's own RMS), which is a click every time.

     Ramping removes the problem rather than masking it. Each track becomes ONE
     continuous stretch pass from its entry to its mix-out, so there is no splice
     inside it at all, and neighbouring tracks agree on tempo where they overlap
     because the ramp delivers them to the right tempo at the right moment. The
     finished mix is a sum of overlapping streams, not a concatenation, and has
     no seams to click.

     Output length is buf.length / mean(r0, r1), because the source consumed is
     the integral of the ratio over the output. */
  function stretchRamp(ctx, buf, r0, r1) {
    if (Math.abs(r0 - 1) < 0.0005 && Math.abs(r1 - 1) < 0.0005) return buf;
    var N = 2048, Hs = N / 4, search = 256;
    var chans = buf.numberOfChannels;
    var meanRatio = (r0 + r1) / 2;
    var outLen = Math.ceil(buf.length / meanRatio) + N;
    var out = ctx.createBuffer(chans, outLen, buf.sampleRate);

    var win = new Float32Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

    var ref = toMono(buf);
    var offsets = [], ideal = 0, prevTail = null;
    var frames = Math.max(1, Math.floor((outLen - N) / Hs));
    for (var f = 0; f < frames; f++) {
      var sp = f * Hs;
      if (sp + N >= outLen) break;
      var base = Math.round(ideal);
      var delta = 0;
      if (prevTail) {
        var best = -Infinity;
        for (var d = -search; d <= search; d++) {
          var a0 = base + d;
          if (a0 < 0 || a0 + Hs >= ref.length) continue;
          var acc = 0, en = 0;
          for (var j = 0; j < Hs; j += 4) {
            var r = ref[a0 + j];
            acc += prevTail[j] * r;
            en += r * r;
          }
          var score = en > 1e-12 ? acc / Math.sqrt(en) : 0;
          if (score > best || (score === best && Math.abs(d) < Math.abs(delta))) {
            best = score; delta = d;
          }
        }
      }
      var a = Math.max(0, Math.min(ref.length - N - 1, base + delta));
      offsets.push(a);
      prevTail = ref.subarray(a + Hs, a + Hs + Hs);
      // The ratio at this point in the OUTPUT, interpolated across the ramp.
      var frac = frames > 1 ? f / (frames - 1) : 0;
      ideal += Hs * (r0 + (r1 - r0) * frac);
      if (ideal + N + search >= ref.length) break;
    }

    for (var c = 0; c < chans; c++) {
      var src = buf.getChannelData(c), dst = out.getChannelData(c);
      var norm = new Float32Array(outLen);
      for (var fi = 0; fi < offsets.length; fi++) {
        var off = offsets[fi], sp2 = fi * Hs;
        for (var k = 0; k < N; k++) {
          var v = src[off + k];
          if (v === undefined) break;
          dst[sp2 + k] += v * win[k];
          norm[sp2 + k] += win[k];
        }
      }
      for (var m = 0; m < outLen; m++) dst[m] /= Math.max(norm[m], 0.5);
    }

    /* Trim to the length the ratio actually implies. The working buffer carries
       one extra frame of padding so the last overlap-add has somewhere to land,
       but that frame is tapering to silence and is not music. Left in, it adds
       43 ms per track — across 47 tracks that is two seconds of accumulated
       drift between what the plan says the set runs to and what comes out. */
    var exact = Math.max(1, Math.min(outLen, Math.round(buf.length / meanRatio)));
    if (exact === outLen) return out;
    var trimmed = ctx.createBuffer(chans, exact, buf.sampleRate);
    for (var tc = 0; tc < chans; tc++) {
      trimmed.copyToChannel(out.getChannelData(tc).subarray(0, exact), tc);
    }
    return trimmed;
  }

  /* Two clips summed can exceed full scale — modern masters sit near 0 dBFS, so
     a crossfade or an overlap clips on export. Float render headroom is
     unlimited; this pulls the finished buffer back under 0 dBFS. A prototype
     render measured 2,880 samples pinned at full scale before this existed. */
  function finalise(buf) {
    var peak = 0, c, d, i;
    for (c = 0; c < buf.numberOfChannels; c++) {
      d = buf.getChannelData(c);
      for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    if (peak > 0.99) {
      var g = 0.98 / peak;
      for (c = 0; c < buf.numberOfChannels; c++) {
        d = buf.getChannelData(c);
        for (i = 0; i < d.length; i++) d[i] *= g;
      }
      return { peak: peak, reducedDb: 20 * Math.log10(g) };
    }
    return { peak: peak, reducedDb: 0 };
  }

  /* Zero-phase high-pass (RBJ biquad forwards then backwards). Phase matters
     because the result gets subtracted from the original — a phase-shifted
     subtraction would comb-filter instead of cancelling. */
  function hpFiltfilt(data, fc, sr) {
    var w0 = 2 * Math.PI * fc / sr, cw = Math.cos(w0), sw = Math.sin(w0);
    var alpha = sw / (2 * Math.SQRT1_2);
    var a0 = 1 + alpha;
    var b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = (1 + cw) / 2 / a0;
    var a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
    var run = function (src) {
      var out = new Float32Array(src.length);
      var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (var i = 0; i < src.length; i++) {
        var x0 = src[i];
        var y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x0; y2 = y1; y1 = y0; out[i] = y0;
      }
      return out;
    };
    var f = run(data), r = new Float32Array(f.length), i;
    for (i = 0; i < f.length; i++) r[i] = f[f.length - 1 - i];
    var g = run(r), out = new Float32Array(f.length);
    for (i = 0; i < g.length; i++) out[i] = g[g.length - 1 - i];
    return out;
  }

  /* Synthetic reverb impulse: exponentially decaying noise, decorrelated per
     channel, with a short pre-delay so the throw blooms rather than smears.
     Plate-ish and needs no sample files. */
  function makeIR(actx, seconds, decay) {
    var sr = actx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
    var pre = Math.floor(sr * 0.02);
    var ir = actx.createBuffer(2, len, sr);
    var seed = 22222;
    var rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = pre; i < len; i++) {
        var t = (i - pre) / (len - pre);
        d[i] = rnd() * Math.pow(1 - t, decay);
      }
    }
    return ir;
  }

  function equalPower(n, rising) {
    var a = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      a[i] = rising ? Math.sin(t * Math.PI / 2) : Math.cos(t * Math.PI / 2);
    }
    return a;
  }
  function rampCurve(n, from, to) {
    var a = new Float32Array(n);
    for (var i = 0; i < n; i++) a[i] = from + (to - from) * (i / (n - 1));
    return a;
  }

  /* The 44-byte RIFF header, on its own. Two things build WAVs — encodeWav for a
     whole buffer, and the streaming writer in mix-render.js, which cannot hold
     80 minutes as Float32 to hand to encodeWav. They shared a copy of this
     header until the duplication was spotted; one place to get it wrong is
     enough. */
  function wavHeader(frames, channels, sampleRate) {
    var dataBytes = frames * channels * 2;
    var head = new ArrayBuffer(44), v = new DataView(head);
    var str = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * channels * 2, true);
    v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, dataBytes, true);
    return head;
  }

  function encodeWav(buf) {
    var chans = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    var bytes = 44 + len * chans * 2;
    var ab = new ArrayBuffer(bytes), v = new DataView(ab);
    new Uint8Array(ab).set(new Uint8Array(wavHeader(len, chans, sr)), 0);
    var data = [];
    for (var c = 0; c < chans; c++) data.push(buf.getChannelData(c));
    var o = 44;
    for (var i = 0; i < len; i++)
      for (var c2 = 0; c2 < chans; c2++) {
        var s = Math.max(-1, Math.min(1, data[c2][i]));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    return new Blob([ab], { type: 'audio/wav' });
  }

  /* §6.6. Everything baked into a sample at SAVE time, because it does not vary
     per use: trim (already done by slicing), optional drum removal, a high-pass,
     and normalisation to -1 dBFS so that placement gain means the same thing for
     every sample in the library.

     Deliberately NOT baked in: stretch, gain and fades. Those vary per
     placement — the same hook at a 108 BPM junction and a 124 BPM junction needs
     two different stretches, so the sample is stored unstretched at its source
     tempo and stretched per use. */
  function prepareSample(ctx, buf, opts) {
    opts = opts || {};
    var sr = buf.sampleRate, chans = buf.numberOfChannels;
    var out = ctx.createBuffer(chans, buf.length, sr);
    for (var c = 0; c < chans; c++) out.copyToChannel(buf.getChannelData(c).slice(), c);

    var done = Promise.resolve(out);

    if (opts.removeDrums) {
      // The harmonic half is the hook without the kit. This is the one job HPSS
      // is genuinely right for — it is wrong for "keep the beat going", which is
      // the opposite operation and belongs to EQ.
      done = hpss(ctx, out, opts.removalAmount == null ? 2 : opts.removalAmount)
        .then(function (r) { return r.harmonic; });
    }

    return done.then(function (b) {
      var hp = opts.highPassHz || 0;
      if (hp > 0) {
        for (var c2 = 0; c2 < b.numberOfChannels; c2++) {
          b.copyToChannel(hpFiltfilt(b.getChannelData(c2), hp, sr), c2);
        }
      }
      // Normalise to -1 dBFS.
      var peak = 0;
      for (var c3 = 0; c3 < b.numberOfChannels; c3++) {
        var d = b.getChannelData(c3);
        for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
      }
      if (peak > 1e-6) {
        var g = 0.891 / peak;                       // -1 dBFS
        for (var c4 = 0; c4 < b.numberOfChannels; c4++) {
          var dd = b.getChannelData(c4);
          for (var j = 0; j < dd.length; j++) dd[j] *= g;
        }
      }
      return b;
    });
  }

  /* A sample as it is actually placed: stretched to the tempo playing where it
     lands, then gained and faded. Constant ratio, not a ramp — see §6.6: a
     four-to-eight bar sample across a realistic tempo ramp drifts well under a
     millisecond, and a ramping stretch of something that short would be all
     edge artefact. */
  function renderPlacement(ctx, sampleBuf, opts) {
    var ratio = opts.ratio || 1;
    var b = Math.abs(ratio - 1) < 0.0005 ? sampleBuf : stretch(ctx, sampleBuf, ratio);
    var sr = b.sampleRate, n = b.length;
    var out = ctx.createBuffer(2, n, sr);
    var gain = Math.pow(10, (opts.gainDb || 0) / 20);
    var fi = Math.min(n, Math.round((opts.fadeInMs || 0) / 1000 * sr));
    var fo = Math.min(n, Math.round((opts.fadeOutMs || 0) / 1000 * sr));
    for (var c = 0; c < 2; c++) {
      var src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      var dst = out.getChannelData(c);
      for (var i = 0; i < n; i++) {
        var g = gain;
        if (fi && i < fi) g *= Math.sin(i / fi * Math.PI / 2);
        if (fo && i >= n - fo) g *= Math.cos((i - (n - fo)) / fo * Math.PI / 2);
        dst[i] = src[i] * g;
      }
    }
    return out;
  }

  /* Assemble a track's edit list into one continuous buffer.
     "Come in on the hook, then drop back to the verse" — region 1 is bars
     33-40, region 2 is bar 9 onwards.

     This happens at SOURCE tempo, before any stretching, and the order matters.
     Stretching each region and then joining would reintroduce exactly the splice
     problem that killed the concatenating render: every stretched piece begins
     windowed to zero, and no two of them can be aligned to each other. Cut
     first, in untouched material, where a 10 ms equal-power crossfade on a bar
     line is genuinely clean — which is what a DJ's hot cue does and it sounds
     right. Then stretch the assembled result once.

     JOIN is deliberately short. Long enough to kill the click, short enough not
     to smear the downbeat it lands on. */
  var REGION_JOIN_SEC = 0.010;

  function assembleRegions(ctx, buffer, regions, barSec) {
    if (!regions || !regions.length) return null;
    var sr = buffer.sampleRate;
    var chans = buffer.numberOfChannels;
    var XF = Math.max(1, Math.round(REGION_JOIN_SEC * sr));

    var pieces = [];
    for (var p = 0; p < regions.length; p++) {
      var r = regions[p];
      var len = Math.max(0, (r.bars || 0) * barSec);
      if (len <= 0) continue;
      pieces.push(slice(ctx, buffer, r.startSec || 0, len));
    }
    if (!pieces.length) return null;
    if (pieces.length === 1) return pieces[0];

    var total = 0;
    for (var i = 0; i < pieces.length; i++) total += pieces[i].length;
    total -= XF * (pieces.length - 1);
    var out = ctx.createBuffer(chans, Math.max(1, total), sr);

    var pos = 0;
    for (i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      var start = i === 0 ? 0 : pos - XF;
      var isFirst = i === 0, isLast = i === pieces.length - 1;
      for (var c = 0; c < chans; c++) {
        var src = piece.getChannelData(Math.min(c, piece.numberOfChannels - 1));
        var dst = out.getChannelData(c);
        for (var k = 0; k < piece.length; k++) {
          var at = start + k;
          if (at < 0 || at >= out.length) continue;
          var g = 1;
          if (!isFirst && k < XF) g = Math.sin(k / XF * Math.PI / 2);
          else if (!isLast && k >= piece.length - XF) {
            g = Math.cos((k - (piece.length - XF)) / XF * Math.PI / 2);
          }
          dst[at] += src[k] * g;
        }
      }
      pos = start + piece.length;
    }
    return out;
  }

  /** How long an edit list runs, in source seconds. The layout needs this
      without decoding anything, so it is computed the same way here. */
  function assembledSourceSec(regions, barSec) {
    if (!regions || !regions.length) return 0;
    var total = 0, n = 0;
    for (var i = 0; i < regions.length; i++) {
      var len = (regions[i].bars || 0) * barSec;
      if (len > 0) { total += len; n++; }
    }
    return Math.max(0, total - REGION_JOIN_SEC * Math.max(0, n - 1));
  }

  /* Butt-join a list of buffers into one. Used by the full render to
     concatenate cached junction segments and untouched track middles. */
  function concat(ctx, buffers, sr) {
    var total = 0, i;
    for (i = 0; i < buffers.length; i++) total += buffers[i].length;
    var chans = 2;
    var out = ctx.createBuffer(chans, Math.max(1, total), sr);
    var pos = 0;
    for (i = 0; i < buffers.length; i++) {
      var b = buffers[i];
      for (var c = 0; c < chans; c++) {
        var src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
        out.getChannelData(c).set(src, pos);
      }
      pos += b.length;
    }
    return out;
  }

  /* --------------------------------------------------- transitions --- */
  /* Every junction is one of four types. Each renderer takes a plain options
     object and returns { buffer, info } — no DOM, no globals, so the timeline
     can render any junction in isolation and cache the result.

     Common options:
       ctx        AudioContext (for createBuffer only; render is offline)
       a, b       { buffer, bpm, downbeatSec, entrySec, exitSec }
       targetBpm  the tempo both tracks are stretched to
       preRollBars / postRollBars  context either side, for auditioning
       onStatus   optional progress callback
  */

  var PRE_ROLL_BARS = 8, POST_ROLL_BARS = 8;

  function stretchPair(ctx, a, b, targetBpm, onStatus) {
    if (onStatus) onStatus('Stretching A…');
    var bufA = stretch(ctx, a.buffer, targetBpm / a.bpm);
    if (onStatus) onStatus('Stretching B…');
    var bufB = stretch(ctx, b.buffer, targetBpm / b.bpm);
    return { bufA: bufA, bufB: bufB, ratioA: targetBpm / a.bpm, ratioB: targetBpm / b.bpm };
  }

  /* Equal-power crossfade with a bass swap: outgoing lowshelf ramps 0 -> -cut
     over the first half, incoming -cut -> 0 over the second. Two kicks on top
     of each other is the one thing that always sounds wrong. */
  function renderBlend(opts) {
    var ctx = opts.ctx, a = opts.a, b = opts.b;
    var bars = opts.bars || 16, bassCut = opts.bassCutDb == null ? 20 : opts.bassCutDb;
    var target = opts.targetBpm;
    var sp = stretchPair(ctx, a, b, target, opts.onStatus);
    var bufA = sp.bufA, bufB = sp.bufB;

    var spb = 60 / target, barSec = spb * 4;
    var blendSec = bars * barSec;
    var preRoll = (opts.preRollBars == null ? PRE_ROLL_BARS : opts.preRollBars) * barSec;
    var postRoll = (opts.postRollBars == null ? POST_ROLL_BARS : opts.postRollBars) * barSec;
    var dbA = a.downbeatSec / sp.ratioA, entryB = b.entrySec / sp.ratioB;
    var exitA = a.exitSec / sp.ratioA;

    // Work backwards from A's mix-out point, snapped to its bar grid.
    var barsInA = Math.round((exitA - blendSec - dbA) / barSec);
    if (barsInA < 4) {
      throw new Error('Not enough of track A before its mix-out point for a ' + bars +
        '-bar blend. Move the mix-out marker later or shorten the blend.');
    }
    var blendStartA = dbA + barsInA * barSec;
    var aStart = Math.max(0, blendStartA - preRoll);

    var sr = bufA.sampleRate;
    var total = (blendStartA - aStart) + blendSec + postRoll;
    var off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    var blendAt = blendStartA - aStart, CURVE = 256;

    var sA = off.createBufferSource(); sA.buffer = bufA;
    var gA = off.createGain(), eqA = off.createBiquadFilter();
    eqA.type = 'lowshelf'; eqA.frequency.value = 220; eqA.gain.value = 0;
    sA.connect(eqA).connect(gA).connect(off.destination);
    gA.gain.setValueAtTime(1, 0);
    gA.gain.setValueCurveAtTime(equalPower(CURVE, false), blendAt, blendSec);
    eqA.gain.setValueAtTime(0, 0);
    eqA.gain.setValueCurveAtTime(rampCurve(CURVE, 0, -bassCut), blendAt, blendSec * 0.5);
    sA.start(0, aStart, Math.min(bufA.duration - aStart, blendAt + blendSec));

    var sB = off.createBufferSource(); sB.buffer = bufB;
    var gB = off.createGain(), eqB = off.createBiquadFilter();
    eqB.type = 'lowshelf'; eqB.frequency.value = 220; eqB.gain.value = -bassCut;
    sB.connect(eqB).connect(gB).connect(off.destination);
    gB.gain.setValueAtTime(0, 0);
    gB.gain.setValueCurveAtTime(equalPower(CURVE, true), blendAt, blendSec);
    gB.gain.setValueAtTime(1, blendAt + blendSec + 0.001);
    eqB.gain.setValueAtTime(-bassCut, 0);
    eqB.gain.setValueCurveAtTime(rampCurve(CURVE, -bassCut, 0), blendAt + blendSec * 0.5, blendSec * 0.5);
    sB.start(blendAt, entryB, Math.min(bufB.duration - entryB, blendSec + postRoll));

    if (opts.onStatus) opts.onStatus('Rendering…');
    return off.startRendering().then(function (out) {
      var fin = finalise(out);
      return {
        buffer: out,
        info: {
          type: 'blend', targetBpm: target, bars: bars,
          transitionAtSec: blendAt, transitionSec: blendSec,
          bIntroAtSec: blendAt,
          ratioA: sp.ratioA, ratioB: sp.ratioB, peak: fin.peak, reducedDb: fin.reducedDb
        }
      };
    });
  }

  /* Cut + reverb throw, then the outgoing beat carries on alone, then B enters.
     Isolation is EQ, not separation: three peaking bells at 700/1800/3500 Hz
     take the vocals and chords out. NOTHING below 300 Hz or above 6 kHz is
     touched, so kick, bass, hats and the crack of the snare all survive — the
     top-end transients are what make it read as rhythm rather than rumble.

     The prototype proved HPSS is wrong for this: the isolated beat measured 1%
     of its energy below 200 Hz against 52% in the source, because at 2048-point
     resolution a kick's fundamental looks sustained and the separator deletes
     it. Separation stays available as an aggressive alternative, with its low
     end preserved, but it is not the default and should not be. */
  /* The bridge's outgoing treatment, in ONE place.
     ------------------------------------------------------------------
     Lifted out of renderBridge() below without changing a number, because two
     paths need it and keeping two copies is exactly how the full render ended
     up with a version that cut the mids for a whole track:

       - renderBridge()                  — audition, both tracks in one buffer
       - mix-render.js renderTrackStream — full render, one track per stream

     Same automation either way. Anything changed here changes both.

     Three peaking bells cover roughly 400 Hz – 5 kHz, where voices and chords
     sit. NOTHING below 300 Hz or above 6 kHz is touched, so the kick, the bass,
     the hats and the crack of the snare all survive — those top-end transients
     are what make it read as a beat rather than a muffled rumble. A peaking
     filter at 0 dB is exactly unity, so everything before brAt is untouched.

       off      the OfflineAudioContext the graph is being built in
       source   the outgoing track's source node. The throw is tapped from it
                BEFORE the filters, so it carries the full-range last note
                rather than a filtered version of it.
       chain    the node the filters hang off (usually source itself)
       o        { barSec, beatSec, brAt, fadeSec, midCutDb, highCutDb,
                  throwing, reverbBars }
     Returns the last node of the filtered chain, to connect onward. */
  function applyBridgeOut(off, source, chain, o) {
    var brAt = o.brAt, fadeSec = o.fadeSec;
    var midCut = o.midCutDb == null ? 24 : o.midCutDb;
    var highCut = o.highCutDb == null ? 0 : o.highCutDb;

    var m1 = off.createBiquadFilter(); m1.type = 'peaking'; m1.frequency.value = 700; m1.Q.value = 1.0;
    var m2 = off.createBiquadFilter(); m2.type = 'peaking'; m2.frequency.value = 1800; m2.Q.value = 1.0;
    var m3 = off.createBiquadFilter(); m3.type = 'peaking'; m3.frequency.value = 3500; m3.Q.value = 1.0;
    var hs = off.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 7000;

    if (o.throwing) {
      var send = off.createGain();
      var conv = off.createConvolver();
      conv.buffer = makeIR(off, (o.reverbBars == null ? 2 : o.reverbBars) * o.barSec, 2.5);
      var wet = off.createGain(); wet.gain.value = 0.85;
      source.connect(send).connect(conv).connect(wet).connect(off.destination);
      // Opens for the final beat, shuts at the cut; the tail rings on over the
      // beat carrying underneath.
      send.gain.setValueAtTime(0, 0);
      send.gain.setValueAtTime(0, Math.max(0, brAt - o.beatSec - 0.001));
      send.gain.linearRampToValueAtTime(1, Math.max(0.001, brAt - o.beatSec));
      send.gain.setValueAtTime(1, Math.max(0.002, brAt));
      send.gain.linearRampToValueAtTime(0, brAt + 0.02);
    }

    var bands = [[m1, midCut], [m2, midCut], [m3, midCut * 0.7], [hs, highCut]];
    for (var i = 0; i < bands.length; i++) {
      var f = bands[i][0], depth = bands[i][1];
      f.gain.setValueAtTime(0, 0);
      if (depth <= 0) continue;
      f.gain.setValueCurveAtTime(rampCurve(256, 0, -depth), brAt, fadeSec);
      f.gain.setValueAtTime(-depth, brAt + fadeSec + 0.001);
    }

    chain.connect(m1).connect(m2).connect(m3).connect(hs);
    return hs;
  }

  /* ---------------------------------------------------- drum patterns ---
     A kit, synthesised, and a handful of patterns to play on it.

     The fill used to be the outgoing record with 24 dB cut out of its mids.
     That can only ever sound like the record with a hole in it — thin and
     boxy, a radio in another room — because it IS the record, still carrying
     the vocal, the guitars and the room, just quieter in the middle. No amount
     of filtering turns a mixed record into a drum kit.

     So the drums are made rather than extracted. Three consequences, all of
     them the point:

       - It is clean. There is nothing in it but drums, because there was never
         anything else in it.
       - Tempo is free. Every hit is synthesised at the moment it should land,
         so a fill that travels from 89 to 100 BPM involves no time-stretching
         at all and none of the artefacts that come with it.
       - It fits the record, because the pattern is chosen by measuring where
         that record actually puts its kick and its snare.

     Sixteen steps to the bar, so a step is a sixteenth note. Step 0 is beat
     one, 4 is beat two, 8 is beat three, 12 is beat four. */

  var DRUM_PATTERNS = [
    { id: 'four', name: 'Four on the floor',
      hint: 'disco, house, most things with a straight pulse',
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      snareAmp: 0.16, hatAmp: 0.11 },

    { id: 'backbeat', name: 'Straight backbeat',
      hint: 'rock and pop: kick on one and three, snare on two and four',
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },

    { id: 'funk', name: 'Funk / breakbeat',
      hint: 'syncopated kick, busier hats',
      kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      hat:   [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,0] },

    { id: 'dembow', name: 'Dembow / reggaeton',
      hint: 'the Despacito feel',
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,1, 0,0,1,0, 0,0,0,1, 0,0,1,0],
      hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },

    { id: 'onedrop', name: 'One drop',
      hint: 'reggae: nothing on one, the weight on three',
      kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },

    { id: 'halftime', name: 'Half time',
      hint: 'one snare a bar — for slow, heavy records',
      kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hat:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] }
  ];

  function drumPatterns() {
    return DRUM_PATTERNS.map(function (p) {
      return { id: p.id, name: p.name, hint: p.hint };
    });
  }

  /* ---- the kit. Written straight into a buffer rather than through the audio
     graph: every hit is a few hundred samples of arithmetic, and doing it by
     hand means a hit can start at any sample rather than being quantised to
     whatever the graph's scheduling allows. */

  /* A dance kick, not a drummer's. The first version swept 115 to 45 Hz and
     was gone in 85 ms with a click on the front — an acoustic bass drum, which
     is exactly what it sounded like against a dance record. This one drops
     faster and further, holds a sub underneath it, and has almost no click:
     what carries a floor is weight, not attack. */
  function addKick(out, at, sr, amp) {
    var n = Math.min(out.length - at, Math.floor(sr * 0.55));
    var phase = 0, subPhase = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      // 95 Hz down to 38 in about 25 ms, then it sits there and rings
      var f = 38 + 57 * Math.exp(-t / 0.022);
      phase += 2 * Math.PI * f / sr;
      subPhase += 2 * Math.PI * 41 / sr;
      var body = Math.sin(phase) * Math.exp(-t / 0.20);
      var sub  = Math.sin(subPhase) * Math.exp(-t / 0.13) * 0.55;
      var click = Math.exp(-t / 0.0009) * 0.10;
      out[at + i] += amp * (body + sub + click);
    }
  }

  /* Closer to a clap than a snare drum: darker, shorter, and well down in the
     balance. A bright cracking snare on every other beat is the sound of a live
     kit, and a live kit under a dance record is the thing that sounded wrong.
     Patterns that want none at all set their snare level to zero. */
  function addSnare(out, at, sr, amp, rnd) {
    if (amp <= 0) return;
    var n = Math.min(out.length - at, Math.floor(sr * 0.16));
    var hp = 0, prev = 0, lp = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var env = Math.exp(-t / 0.038);
      var noise = rnd() * 2 - 1;
      hp = 0.55 * (hp + noise - prev); prev = noise;   // darker than before
      lp += (hp - lp) * 0.45;                          // and rolled off on top
      var body = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.030) * 0.35;
      out[at + i] += amp * (lp * env * 0.8 + body);
    }
  }

  function addHat(out, at, sr, amp, open, rnd) {
    var n = Math.min(out.length - at, Math.floor(sr * (open ? 0.18 : 0.045)));
    var hp = 0, prev = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var env = Math.exp(-t / (open ? 0.06 : 0.011));
      var noise = rnd() * 2 - 1;
      hp = 0.92 * (hp + noise - prev); prev = noise;
      out[at + i] += amp * hp * env;
    }
  }

  /* Deterministic noise, so the same fill renders the same way twice. */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---- what the record itself is playing.

     Sixteen buckets to the bar, filled with onset strength in the band each
     drum lives in — under 120 Hz for the kick, 1.5 to 4 kHz for the snare.
     What comes out is where that record puts its weight, which is what a
     pattern has to agree with to sound like it belongs. */

  function drumProfile(mono, sr, downbeatSec, bpm, fromSec, toSec) {
    var beatSec = 60 / bpm, stepSec = beatSec / 4;
    var kick = new Float64Array(16), snare = new Float64Array(16), hits = new Float64Array(16);

    // crude band energies, one pole each way
    var lp = 0, hp = 0, prevIn = 0;
    var n = mono.length;
    var a = Math.max(0, Math.floor((fromSec || 0) * sr));
    var b = Math.min(n, Math.floor((toSec || mono.length / sr) * sr));
    var win = Math.max(1, Math.floor(sr * 0.02));

    var lowEnv = [], midEnv = [];
    var acc1 = 0, acc2 = 0, cnt = 0;
    for (var i = a; i < b; i++) {
      var x = mono[i];
      lp += (x - lp) * 0.02;                       // ~120 Hz
      hp = 0.85 * (hp + x - prevIn); prevIn = x;    // above ~1.5 kHz
      acc1 += lp * lp; acc2 += hp * hp; cnt++;
      if (cnt === win) { lowEnv.push(Math.sqrt(acc1 / win)); midEnv.push(Math.sqrt(acc2 / win));
                         acc1 = 0; acc2 = 0; cnt = 0; }
    }
    var envFps = sr / win;

    // rising edges only: an onset is where energy jumps, not where it is high
    function flux(env) {
      var f = new Float64Array(env.length);
      for (var i = 1; i < env.length; i++) f[i] = Math.max(0, env[i] - env[i - 1]);
      return f;
    }
    var kf = flux(lowEnv), sf = flux(midEnv);

    var startSec = (fromSec || 0);
    for (var j = 0; j < kf.length; j++) {
      var t = startSec + j / envFps;
      var pos = (t - (downbeatSec || 0)) / stepSec;
      var step = ((Math.round(pos) % 16) + 16) % 16;
      // only count it if it is near a step rather than between two
      if (Math.abs(pos - Math.round(pos)) > 0.35) continue;
      kick[step] += kf[j]; snare[step] += sf[j]; hits[step]++;
    }

    function norm(v) {
      var mx = 0;
      for (var i = 0; i < 16; i++) if (v[i] > mx) mx = v[i];
      if (!mx) return v;
      for (var k = 0; k < 16; k++) v[k] /= mx;
      return v;
    }
    return { kick: norm(kick), snare: norm(snare) };
  }

  /* Which pattern the record is closest to. Correlation against each, kick and
     snare weighted equally — the kick says where the weight is and the snare
     says where the backbeat is, and between them they separate a disco record
     from a reggae one. */
  function matchDrumPattern(profile) {
    if (!profile) return { pattern: DRUM_PATTERNS[0], score: 0, scores: [] };
    function corr(a, b) {
      var ma = 0, mb = 0, i;
      for (i = 0; i < 16; i++) { ma += a[i]; mb += b[i]; }
      ma /= 16; mb /= 16;
      var num = 0, da = 0, db = 0;
      for (i = 0; i < 16; i++) {
        var x = a[i] - ma, y = b[i] - mb;
        num += x * y; da += x * x; db += y * y;
      }
      return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
    }
    /* Scored against every rotation of the measured bar, best one taken.

       The bar grid is extrapolated from a downbeat detected at the start of
       the record, and three minutes later a tenth of a percent of tempo error
       has moved it by more than a sixteenth note. Measured on Hotstepper the
       kick sits on steps 2,4,6,10 near the beginning and 3,5,7,11 near the end
       — the same pattern, rotated, because the grid has drifted, not because
       the drummer moved. Comparing at a fixed rotation scored that as no match
       at all. Nothing here needs the absolute phase: the fill plays on its own
       after the record has stopped, so only the shape of the bar matters. */
    function best(a, b) {
      var top = -2, rot = new Float64Array(16);
      for (var r = 0; r < 16; r++) {
        for (var i = 0; i < 16; i++) rot[i] = a[(i + r) % 16];
        var s = corr(rot, b);
        if (s > top) top = s;
      }
      return top;
    }
    var scores = DRUM_PATTERNS.map(function (p) {
      return { id: p.id, name: p.name,
               score: 0.5 * best(profile.kick, p.kick) + 0.5 * best(profile.snare, p.snare) };
    });
    var best = scores.reduce(function (a, b) { return b.score > a.score ? b : a; }, scores[0]);
    var pat = DRUM_PATTERNS.filter(function (p) { return p.id === best.id; })[0];
    return { pattern: pat, score: best.score,
             scores: scores.sort(function (a, b) { return b.score - a.score; }) };
  }

  function patternById(id) {
    for (var i = 0; i < DRUM_PATTERNS.length; i++) if (DRUM_PATTERNS[i].id === id) return DRUM_PATTERNS[i];
    return null;
  }

  /* How long after its entry a record's own drums take to arrive.

     Plenty of records open on a pad, a voice, a guitar figure — Hotstepper's
     first four seconds fade DOWN from its intro before the groove starts. A
     fill that stops the moment the next record begins leaves exactly the hole
     it was there to prevent, so it has to keep going until that record's drums
     are carrying on their own.

     Measured in the kick band, against the record's own body rather than an
     absolute threshold: quiet records and loud ones both count as "drumming"
     when they reach their own normal. Returns seconds after fromSec, 0 if the
     drums are already there. */
  function drumsInSec(mono, sr, fromSec, maxSec) {
    var cap = maxSec == null ? 32 : maxSec;
    var win = Math.max(1, Math.floor(sr * 0.02));
    var from = Math.max(0, Math.floor((fromSec || 0) * sr));
    var lp = 0, acc = 0, cnt = 0, env = [], i;
    for (i = from; i < mono.length; i++) {
      lp += (mono[i] - lp) * 0.02;              // roughly under 120 Hz
      acc += lp * lp; cnt++;
      if (cnt === win) { env.push(Math.sqrt(acc / win)); acc = 0; cnt = 0; }
    }
    if (env.length < 100) return 0;
    var fps = sr / win;

    var flux = new Float64Array(env.length);
    for (i = 1; i < env.length; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);

    /* Judged over two seconds at a time, not frame by frame. A single hit in
       an intro clears any per-frame threshold — Hotstepper's opening four
       seconds are a sound DECAYING from -29 to -49 dBFS, and the old test
       called that "drums already playing" and carried the fill nowhere. Two
       seconds of drumming is drums; one hit is a hit. */
    var W = Math.max(4, Math.round(fps * 2));
    var score = new Float64Array(Math.max(0, flux.length - W));
    var run = 0;
    for (i = 0; i < flux.length; i++) {
      run += flux[i];
      if (i >= W) run -= flux[i - W];
      if (i >= W) score[i - W] = run;
    }
    if (!score.length) return 0;

    // what this record's own drumming looks like, from its whole body
    var sorted = Array.prototype.slice.call(score).sort(function (a, b) { return a - b; });
    var typical = sorted[Math.floor(sorted.length * 0.55)];
    if (!(typical > 0)) return 0;

    var need = typical * 0.55;
    var limit = Math.min(score.length, Math.round(cap * fps));
    for (i = 0; i < limit; i++) {
      if (score[i] >= need) return +(i / fps).toFixed(3);
    }
    return 0;
  }

  /* ---- play it.

     Beat by beat at that beat's own tempo, so the pulse walks from the record
     it is leaving to the record it is arriving at. Nothing is stretched: each
     hit is generated where it belongs. */
  function synthDrumFill(opts) {
    var sr = opts.sampleRate || 48000;
    var beats = Math.max(1, Math.round(opts.beats || 64));
    /* Beats played UNDER the next record, after the ramp has arrived at its
       tempo — held there, because by then the tempo has nowhere left to go. */
    var over = Math.max(0, Math.round(opts.overBeats || 0));
    /* Beats played UNDER the outgoing record, before its mix-out, so the drums
       are already going when it hands over. Without these the record simply
       stops and the drums simply start — two hard edges where there should be
       one handover. They run at the outgoing record's tempo, because that is
       what is still playing over them. */
    var pre = Math.max(0, Math.round(opts.preBeats || 0));
    var pat = opts.pattern || DRUM_PATTERNS[0];
    var tempos = [];
    for (var pb = 0; pb < pre; pb++) tempos.push(opts.fromBpm);
    var ramp = fillTempos(beats, opts.fromBpm, opts.toBpm);
    for (var ri = 0; ri < ramp.length; ri++) tempos.push(ramp[ri]);
    for (var ob = 0; ob < over; ob++) tempos.push(opts.toBpm);
    beats = pre + beats + over;
    var totalSec = tempos.reduce(function (s, bpm) { return s + 60 / bpm; }, 0);
    var n = Math.round(totalSec * sr) + Math.floor(sr * 0.3);   // room for the last tail
    var out = new Float32Array(n);
    var rnd = rng(opts.seed || 12345);

    var at = 0;
    for (var i = 0; i < beats; i++) {
      var beatSec = 60 / tempos[i];
      var stepSec = beatSec / 4;
      var barBeat = i % 4;
      for (var s = 0; s < 4; s++) {
        var step = barBeat * 4 + s;
        var pos = Math.round((at + s * stepSec * sr));
        if (pos >= n) break;
        // a touch of swing-free human weight: downbeats louder
        var accent = (step === 0) ? 1 : (step % 4 === 0 ? 0.92 : 0.8);
        /* How loud each voice is, per pattern. A four-on-the-floor wants
           almost no snare — the kick is the whole point of it — where a
           backbeat is defined by the thing on two and four. */
        var kAmp = pat.kickAmp == null ? 1 : pat.kickAmp;
        var sAmp = pat.snareAmp == null ? 0.34 : pat.snareAmp;
        var hAmp = pat.hatAmp == null ? 0.14 : pat.hatAmp;
        if (pat.kick[step])  addKick(out, pos, sr, 0.95 * kAmp * accent);
        if (pat.snare[step]) addSnare(out, pos, sr, sAmp * accent, rnd);
        if (pat.hat[step])   addHat(out, pos, sr, hAmp * accent, false, rnd);
      }
      at += beatSec * sr;
    }

    /* Trim to length, then in and out. The record has already stopped when this
       starts, so it comes in at once; it eases off over the last two beats as
       the next record arrives on the downbeat. */
    var want = Math.round(totalSec * sr);
    var buf = new Float32Array(want);
    buf.set(out.subarray(0, want));
    /* In across the pre-beats rather than in 30 ms. The record is still
       playing over them, so the drums arrive underneath it and are already
       established by the time it goes. */
    var preSec = 0;
    for (var pi2 = 0; pi2 < pre; pi2++) preSec += 60 / tempos[pi2];
    var inN = pre > 0 ? Math.round(preSec * sr) : Math.round(sr * 0.03);
    for (var k = 0; k < inN && k < want; k++) {
      var g0v = k / inN;
      buf[k] *= g0v * g0v;                      // slow at first, then up
    }

    /* Under the record it steps back — it is accompaniment from that point,
       not the main event — and then goes out over the last four beats, by
       which time the record's own drums are carrying. */
    var overSec = 0;
    for (var oi = tempos.length - over; oi < tempos.length; oi++) overSec += 60 / tempos[oi];
    var overN = Math.round(overSec * sr);
    if (overN > 0) {
      var duckN = Math.round(60 / opts.toBpm * 2 * sr);      // two beats to duck
      var start = Math.max(0, want - overN);
      for (var q = 0; q < overN && start + q < want; q++) {
        var g = q < duckN ? 1 - 0.45 * (q / duckN) : 0.55;
        buf[start + q] *= g;
      }
    }
    var outN = Math.round(60 / opts.toBpm * 4 * sr);
    for (var m = 0; m < outN && m < want; m++) {
      buf[want - 1 - m] *= (m / outN);
    }
    return buf;
  }

  /* ------------------------------------------------------- beat fill ---
     A bridge that actually bridges: N bars of drums INSERTED between two
     records, with the tempo sliding from the outgoing record's to the incoming
     one's across them.

     This is what makes an unmatchable junction work. Despacito at 89 and
     Hotstepper at 100 are 12% apart, which is far beyond what either record
     can be stretched by without sounding processed. Neither has to be: the
     fill travels the distance instead. Sixty-four bars is a long, gradual
     climb — about 0.2 BPM per bar — which is inaudible as a change and lands
     exactly on the next record's tempo.

     The drums come from the outgoing record's own last bars, so the beat that
     carries on is the beat that was already playing, and the mids are cut out
     of it the same way the old in-track bridge did — the difference is that
     this occupies its own time rather than eating the end of the record.

     Tempo is held constant WITHIN each bar and stepped between bars. Over 64
     bars from 89 to 100 that is a fifth of a BPM per step, well under anything
     audible, and it makes the fill's length exactly computable in advance:
     the sum of each bar's own length. The plan needs that number before any
     audio exists, and a ramp integrated continuously would only be an
     approximation of it. */

  /* Beat-by-beat tempo of a fill. One definition, used by the planner to work
     out how long the fill is and by the renderer to build it, so the two can
     never disagree about where the next record starts.

     Beats rather than bars because that is the unit the length is thought
     about in — "sixteen beats of drums", not "four bars" — and because it lets
     a fill be any length rather than only multiples of four. */
  function fillTempos(beats, fromBpm, toBpm) {
    var out = [];
    var n = Math.max(1, Math.round(beats));
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 1 : i / (n - 1);
      out.push(fromBpm + (toBpm - fromBpm) * f);
    }
    return out;
  }

  function beatFillSec(beats, fromBpm, toBpm) {
    if (!beats || !fromBpm || !toBpm) return 0;
    return fillTempos(beats, fromBpm, toBpm)
      .reduce(function (s, bpm) { return s + 60 / bpm; }, 0);
  }

  function sliceBuffer(ctx, buf, fromSec, toSec) {
    var sr = buf.sampleRate;
    var a = Math.max(0, Math.floor(fromSec * sr));
    var b = Math.min(buf.length, Math.floor(toSec * sr));
    var n = Math.max(1, b - a);
    var out = ctx.createBuffer(buf.numberOfChannels, n, sr);
    for (var c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c).subarray(a, a + n));
    }
    return out;
  }

  /* Builds the fill: a drum kit playing the pattern this record plays, for the
     given number of beats, with the tempo walking to the next record's.

     opts: source (AudioBuffer, only to work out which pattern fits), atSec (the
     outgoing mix-out), downbeatSec, beats, fromBpm, toBpm, patternId ('auto' or
     a specific one), gainDb, sampleRate. */
  function buildBeatFill(opts) {
    var sr = opts.sampleRate || (opts.source ? opts.source.sampleRate : 48000);
    var beats = Math.max(1, Math.round(opts.beats || 64));
    var fromBpm = opts.fromBpm, toBpm = opts.toBpm;
    if (!fromBpm || !toBpm) return null;

    /* Which pattern. Measured off the last stretch of the record before the
       mix-out — where its kicks and snares actually fall — unless one has been
       chosen by hand. */
    var chosen = null, match = null;
    if (opts.patternId && opts.patternId !== 'auto') chosen = patternById(opts.patternId);
    if (!chosen && opts.source) {
      var mono = toMono(opts.source);
      var look = Math.min(30, (opts.atSec || opts.source.duration));
      var prof = drumProfile(mono, sr, opts.downbeatSec || 0, fromBpm,
                             Math.max(0, (opts.atSec || opts.source.duration) - look),
                             (opts.atSec || opts.source.duration));
      match = matchDrumPattern(prof);
      chosen = match.pattern;
    }
    if (!chosen) chosen = DRUM_PATTERNS[0];

    var overBeats = Math.max(0, Math.round(opts.overBeats || 0));
    var preBeats = Math.max(0, Math.round(opts.preBeats || 0));
    var pcm = synthDrumFill({
      beats: beats, overBeats: overBeats, preBeats: preBeats,
      fromBpm: fromBpm, toBpm: toBpm,
      pattern: chosen, sampleRate: sr, seed: opts.seed || 20260919
    });

    /* Level it against the record it follows, rather than against nothing.
       A synthesised kit is nearly all transient, so its RMS lands about 10 dB
       under a mastered record even when its peaks are the same height —
       measured, the fill came out at -22 dBFS against Despacito's -11.8, which
       on a dancefloor is the energy falling through the floor at exactly the
       moment it has to hold. Matched to the outgoing record's own level and
       then set by ear with gainDb, which defaults to a shade under it. */
    var ref = null;
    if (opts.source) {
      var rm = toMono(opts.source);
      var end = Math.min(rm.length, Math.floor((opts.atSec || opts.source.duration) * sr));
      var beg = Math.max(0, end - Math.floor(20 * sr));
      var acc = 0, cnt = 0;
      for (var q = beg; q < end; q++) { acc += rm[q] * rm[q]; cnt++; }
      if (cnt) ref = Math.sqrt(acc / cnt);
    }
    var mine = 0, mc = 0;
    for (var q2 = 0; q2 < pcm.length; q2++) { mine += pcm[q2] * pcm[q2]; mc++; }
    mine = mc ? Math.sqrt(mine / mc) : 0;

    /* Getting there needs saturation, not just gain. A raw kit is pure
       transient: scaling its RMS up to a mastered record's puts the kick peaks
       far through the ceiling, and pulling the peaks back down undoes exactly
       as much as the gain put in — measured, level matching alone moved the
       fill from -22.6 to -24.1 dBFS, which is backwards. Soft clipping is what
       a drum bus compressor is for and what every drum loop on a record has
       already had: it takes the tops off the kicks so the body can come up. */
    var target = ref ? ref * Math.pow(10, (opts.gainDb == null ? -1.5 : opts.gainDb) / 20) : 0;

    function peakOf(v) {
      var p = 0;
      for (var i = 0; i < v.length; i++) { var a = Math.abs(v[i]); if (a > p) p = a; }
      return p;
    }
    function rmsOf(v) {
      var s = 0;
      for (var i = 0; i < v.length; i += 7) s += v[i] * v[i];
      return Math.sqrt(s / Math.ceil(v.length / 7));
    }

    var p0 = peakOf(pcm) || 1;
    for (var i0 = 0; i0 < pcm.length; i0++) pcm[i0] *= 0.98 / p0;

    if (target > 0) {
      /* Pick the least saturation that reaches the level. Tried in order, so a
         fill that needs none gets none. */
      var drives = [1, 1.6, 2.4, 3.5, 5, 7, 10, 14];
      var sat = null;
      for (var di = 0; di < drives.length; di++) {
        var dr = drives[di], norm = Math.tanh(dr);
        var test = new Float32Array(Math.min(pcm.length, Math.floor(sr * 8)));
        for (var ti = 0; ti < test.length; ti++) test[ti] = Math.tanh(pcm[ti] * dr) / norm * 0.95;
        sat = { drive: dr, rms: rmsOf(test) };
        if (sat.rms >= target) break;
      }
      var dnorm = Math.tanh(sat.drive);
      for (var si = 0; si < pcm.length; si++) {
        pcm[si] = Math.tanh(pcm[si] * sat.drive) / dnorm * 0.95;
      }
      // and trim if that overshot
      var got = rmsOf(pcm);
      if (got > target * 1.02) {
        var trim = target / got, pk2 = peakOf(pcm) * trim;
        if (pk2 < 0.98) for (var wi = 0; wi < pcm.length; wi++) pcm[wi] *= trim;
      }
    }
    var gain = 1;
    var ctxOut = new OfflineAudioContext(2, pcm.length, sr);
    var buf = ctxOut.createBuffer(2, pcm.length, sr);
    var l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (var i = 0; i < pcm.length; i++) { l[i] = pcm[i] * gain; r[i] = pcm[i] * gain; }
    buf.matchedPattern = chosen.id;
    buf.matchedName = chosen.name;
    /* Where the next record starts: everything before this goes in the gap
       between the records, everything after plays underneath the next one. */
    buf.preSec = preBeats * (60 / fromBpm);
    buf.gapSec = beatFillSec(beats, fromBpm, toBpm);
    buf.overBeats = overBeats;
    buf.preBeats = preBeats;
    buf.matchScore = match ? +match.score.toFixed(2) : null;
    return Promise.resolve(buf);
  }

  /** How a bridge describes itself in a report. Shared for the same reason. */
  function bridgeNote(o) {
    return (o.throwing ? (o.reverbBars == null ? 2 : o.reverbBars) + '-bar reverb throw, '
                       : (o.fadeBars == null ? 4 : o.fadeBars) + '-bar fade, ') +
           'mids cut ' + (o.midCutDb == null ? 24 : o.midCutDb) + ' dB, highs ' +
           (o.highCutDb ? 'cut ' + o.highCutDb + ' dB' : 'kept');
  }

  /* How many beat-alone bars actually fit in a track of `durSec`, given the
     fade and the overlap that sit either side of them.

     This exists because the full render used to clamp a bridge that did not fit
     with Math.max(0, ...), which starts the mid-cut ramp at sample zero and
     holds it for the entire track — a four-minute record with its mids gone and
     no error anywhere. Shortening the beat-alone section is the honest answer:
     the bridge still happens, it is just as long as there is room for. */
  function fitBeatBars(durSec, barSec, wantBeatBars, fadeSec, overlapBars, maxFraction) {
    var frac = maxFraction == null ? 0.5 : maxFraction;
    var room = Math.max(0, durSec * frac - fadeSec - (overlapBars || 0) * barSec);
    var fits = Math.floor(room / barSec);
    return {
      beatBars: Math.max(0, Math.min(wantBeatBars, fits)),
      shortened: fits < wantBeatBars
    };
  }

  function renderBridge(opts) {
    var ctx = opts.ctx, a = opts.a, b = opts.b, target = opts.targetBpm;
    var bridgeBars = opts.beatBars == null ? 8 : opts.beatBars;
    var overlapBars = opts.overlapBars == null ? 1 : opts.overlapBars;
    var method = opts.isolation || 'eq';               // 'eq' | 'sep'
    var throwing = (opts.cutStyle || 'throw') === 'throw';
    var fadeBars = throwing ? 0 : (opts.fadeBars == null ? 4 : opts.fadeBars);
    var reverbBars = opts.reverbBars == null ? 2 : opts.reverbBars;
    var midCut = opts.midCutDb == null ? 24 : opts.midCutDb;
    var highCut = opts.highCutDb == null ? 0 : opts.highCutDb;

    var sp = stretchPair(ctx, a, b, target, opts.onStatus);
    var bufA = sp.bufA, bufB = sp.bufB;

    var spb = 60 / target, barSec = spb * 4;
    // The two bar counts are additive: music closes out over fadeBars, then the
    // beat runs alone for bridgeBars. A throw is an instant cut (30 ms so it
    // does not click); a fade ramps over bars.
    var fadeSec = throwing ? 0.03 : fadeBars * barSec;
    var bridgeSec = fadeSec + bridgeBars * barSec;
    var dbA = a.downbeatSec / sp.ratioA, entryB = b.entrySec / sp.ratioB;
    var exitA = a.exitSec / sp.ratioA;
    var preRoll = (opts.preRollBars == null ? PRE_ROLL_BARS : opts.preRollBars) * barSec;
    var postRoll = (opts.postRollBars == null ? POST_ROLL_BARS : opts.postRollBars) * barSec;

    // Anchored to A's mix-out marker, never to the end of the file.
    var barsInA = Math.round((exitA - bridgeSec - dbA) / barSec);
    if (barsInA < 4) {
      throw new Error('Not enough of track A before its mix-out point for ' + fadeBars +
        ' + ' + bridgeBars + ' bars. Move the mix-out marker later or shorten the bridge.');
    }
    var bridgeStart = dbA + barsInA * barSec;
    var aStart = Math.max(0, bridgeStart - preRoll);

    var sr = bufA.sampleRate;
    var brAt = bridgeStart - aStart;
    var bEnterAt = brAt + bridgeSec - overlapBars * barSec;
    var total = bEnterAt + postRoll + 2;
    var off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    var note = '';

    var addThrow = function (sourceBuf, startOffset, stopAfter) {
      // Tapped BEFORE the filters, so the throw carries the full-range last
      // note, not the filtered version of it. The send opens for the final beat
      // and shuts at the cut; the tail rings on over the beat underneath.
      var s = off.createBufferSource(); s.buffer = sourceBuf;
      var send = off.createGain();
      var conv = off.createConvolver();
      conv.buffer = makeIR(off, reverbBars * barSec, 2.5);
      var wet = off.createGain(); wet.gain.value = 0.85;
      s.connect(send).connect(conv).connect(wet).connect(off.destination);
      send.gain.setValueAtTime(0, 0);
      send.gain.setValueAtTime(0, brAt - spb - 0.001);
      send.gain.linearRampToValueAtTime(1, brAt - spb);
      send.gain.setValueAtTime(1, brAt);
      send.gain.linearRampToValueAtTime(0, brAt + 0.02);
      if (stopAfter != null) s.start(0, startOffset, stopAfter);
      return s;
    };

    var pending = Promise.resolve();

    if (method === 'eq') {
      var sA = off.createBufferSource(); sA.buffer = bufA;
      var gA = off.createGain();

      // The filters and the throw come from applyBridgeOut, which the full
      // render calls too. One implementation, two callers.
      var tail = applyBridgeOut(off, sA, sA, {
        barSec: barSec, beatSec: spb, brAt: brAt, fadeSec: fadeSec,
        midCutDb: midCut, highCutDb: highCut,
        throwing: throwing, reverbBars: reverbBars
      });
      tail.connect(gA).connect(off.destination);

      gA.gain.setValueAtTime(1, 0);
      if (overlapBars > 0) gA.gain.setValueCurveAtTime(equalPower(128, false), bEnterAt, overlapBars * barSec);
      else {
        gA.gain.setValueAtTime(1, brAt + bridgeSec - 0.05);
        gA.gain.linearRampToValueAtTime(0, brAt + bridgeSec);
      }
      sA.start(0, aStart, bridgeSec + preRoll);
      note = bridgeNote({ throwing: throwing, reverbBars: reverbBars, fadeBars: fadeBars,
                          midCutDb: midCut, highCutDb: highCut });

    } else {
      // Separation, but the low end is never touched. Straight HPSS deletes the
      // kick. So: subtract only the HIGH-PASSED harmonic part, leaving the
      // original bass and kick intact. At env = 1 nothing is subtracted, so the
      // bridge still starts bit-identical to the track.
      if (opts.onStatus) opts.onStatus('Separating…');
      var p = opts.removalAmount == null ? 2 : opts.removalAmount;
      var region = slice(ctx, bufA, bridgeStart, bridgeSec);
      pending = hpss(ctx, region, p, function (d) {
        if (opts.onStatus) opts.onStatus('Separating… ' + Math.round(d.v * 100) + '% (' + d.msg + ')');
      }).then(function (res) {
        var bridge = ctx.createBuffer(region.numberOfChannels, region.length, sr);
        var fadeN = Math.min(region.length, Math.floor(fadeSec * sr));
        for (var c = 0; c < region.numberOfChannels; c++) {
          var orig = region.getChannelData(c);
          var hHi = hpFiltfilt(res.harmonic.getChannelData(c), 220, sr);
          var d = bridge.getChannelData(c);
          for (var i = 0; i < region.length; i++) {
            var t = i < fadeN ? i / fadeN : 1;
            var env = 0.5 + 0.5 * Math.cos(Math.PI * t);   // 1 -> 0
            d[i] = orig[i] - hHi[i] * (1 - env);
          }
        }
        if (throwing) addThrow(bufA, aStart, brAt + 0.05);

        var sA2 = off.createBufferSource(); sA2.buffer = bufA;
        sA2.connect(off.destination);
        sA2.start(0, aStart, brAt);

        var sBr = off.createBufferSource(); sBr.buffer = bridge;
        var gBr = off.createGain();
        sBr.connect(gBr).connect(off.destination);
        gBr.gain.setValueAtTime(1, brAt);
        if (overlapBars > 0) gBr.gain.setValueCurveAtTime(equalPower(128, false), bEnterAt, overlapBars * barSec);
        else {
          gBr.gain.setValueAtTime(1, brAt + bridgeSec - 0.05);
          gBr.gain.linearRampToValueAtTime(0, brAt + bridgeSec);
        }
        sBr.start(brAt);
        note = 'separation strength ' + p + ', bass left untouched';
      });
    }

    return pending.then(function () {
      // B enters on a bar line.
      var sB = off.createBufferSource(); sB.buffer = bufB;
      var gB = off.createGain();
      sB.connect(gB).connect(off.destination);
      if (overlapBars > 0) {
        gB.gain.setValueAtTime(0, bEnterAt);
        gB.gain.setValueCurveAtTime(equalPower(128, true), bEnterAt, overlapBars * barSec);
        gB.gain.setValueAtTime(1, bEnterAt + overlapBars * barSec + 0.001);
      } else {
        gB.gain.setValueAtTime(1, bEnterAt);
      }
      sB.start(bEnterAt, entryB, Math.min(bufB.duration - entryB, postRoll + overlapBars * barSec));

      if (opts.onStatus) opts.onStatus('Rendering…');
      return off.startRendering();
    }).then(function (out) {
      var fin = finalise(out);
      // Is there actually anything audible during the beat-only stretch?
      var beatRms = rmsOf(out, brAt + fadeSec, Math.min(bridgeBars * barSec, 6));
      var beatDb = 20 * Math.log10(beatRms + 1e-9);
      return {
        buffer: out,
        info: {
          type: 'throw-bridge', targetBpm: target, note: note,
          transitionAtSec: brAt, transitionSec: bridgeSec,
          bIntroAtSec: bEnterAt, beatDb: beatDb, quiet: beatDb < -34,
          ratioA: sp.ratioA, ratioB: sp.ratioB, peak: fin.peak, reducedDb: fin.reducedDb
        }
      };
    });
  }

  /* A ends on a bar line, B starts on the next. Proposed automatically when two
     tracks are more than the stretch budget apart after clamping. gapMs > 0 is
     the STOP / START case — the cake, where nothing is matched across it. */
  function renderHardCut(opts) {
    var ctx = opts.ctx, a = opts.a, b = opts.b;
    var gapMs = opts.gapMs || 0;
    // No common tempo: each track plays at its own. Nothing is stretched.
    var barSecA = 60 / a.bpm * 4, barSecB = 60 / b.bpm * 4;
    var preRoll = (opts.preRollBars == null ? PRE_ROLL_BARS : opts.preRollBars) * barSecA;
    var postRoll = (opts.postRollBars == null ? POST_ROLL_BARS : opts.postRollBars) * barSecB;

    // Snap A's out point to its own bar grid, working back from mix-out.
    var barsInA = Math.max(1, Math.round((a.exitSec - a.downbeatSec) / barSecA));
    var cutAt = a.downbeatSec + barsInA * barSecA;
    var aStart = Math.max(0, cutAt - preRoll);
    var aDur = cutAt - aStart;

    var sr = a.buffer.sampleRate;
    var gapSec = gapMs / 1000;
    var total = aDur + gapSec + postRoll;
    var off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);

    var sA = off.createBufferSource(); sA.buffer = a.buffer;
    var gA = off.createGain();
    sA.connect(gA).connect(off.destination);
    // 20 ms taper so the cut does not click.
    gA.gain.setValueAtTime(1, 0);
    gA.gain.setValueAtTime(1, Math.max(0, aDur - 0.02));
    gA.gain.linearRampToValueAtTime(0, aDur);
    sA.start(0, aStart, aDur);

    var sB = off.createBufferSource(); sB.buffer = b.buffer;
    var gB = off.createGain();
    sB.connect(gB).connect(off.destination);
    var bAt = aDur + gapSec;
    gB.gain.setValueAtTime(0, bAt);
    gB.gain.linearRampToValueAtTime(1, bAt + 0.02);
    sB.start(bAt, b.entrySec, Math.min(b.buffer.duration - b.entrySec, postRoll));

    if (opts.onStatus) opts.onStatus('Rendering…');
    return off.startRendering().then(function (out) {
      var fin = finalise(out);
      return {
        buffer: out,
        info: {
          type: 'hard-cut', gapMs: gapMs,
          transitionAtSec: aDur, transitionSec: gapSec,
          bIntroAtSec: bAt, bpmA: a.bpm, bpmB: b.bpm,
          ratioA: 1, ratioB: 1, peak: fin.peak, reducedDb: fin.reducedDb
        }
      };
    });
  }

  var RENDERERS = {
    'blend': renderBlend,
    'throw-bridge': renderBridge,
    'beat-bridge': renderBridge,
    'hard-cut': renderHardCut
  };

  /** Render one junction by type. Returns { buffer, info }. */
  function renderJunction(type, opts) {
    var fn = RENDERERS[type];
    if (!fn) throw new Error('Unknown junction type: ' + type);
    return Promise.resolve().then(function () { return fn(opts); });
  }

  global.MixDSP = {
    analyseBeat: analyseBeat,
    hpss: hpss,
    toMono: toMono,
    contentEndSec: contentEndSec,
    lastStrongSec: lastStrongSec,
    peaks: peaks,
    slice: slice,
    rmsOf: rmsOf,
    stretch: stretch,
    stretchRamp: stretchRamp,
    finalise: finalise,
    hpFiltfilt: hpFiltfilt,
    makeIR: makeIR,
    equalPower: equalPower,
    rampCurve: rampCurve,
    encodeWav: encodeWav,
    wavHeader: wavHeader,
    concat: concat,
    prepareSample: prepareSample,
    renderPlacement: renderPlacement,
    assembleRegions: assembleRegions,
    assembledSourceSec: assembledSourceSec,
    REGION_JOIN_SEC: REGION_JOIN_SEC,
    renderBlend: renderBlend,
    renderBridge: renderBridge,
    applyBridgeOut: applyBridgeOut,
    bridgeNote: bridgeNote,
    drumsInSec: drumsInSec,
    drumPatterns: drumPatterns,
    drumProfile: drumProfile,
    matchDrumPattern: matchDrumPattern,
    patternById: patternById,
    synthDrumFill: synthDrumFill,
    buildBeatFill: buildBeatFill,
    beatFillSec: beatFillSec,
    fillTempos: fillTempos,
    fitBeatBars: fitBeatBars,
    renderHardCut: renderHardCut,
    renderJunction: renderJunction,
    TYPES: Object.keys(RENDERERS)
  };

})(typeof window !== 'undefined' ? window : globalThis);
