/* The per-fill tone controls. Each one is checked by measuring the audio it
   produces, not by checking the setting arrived: a control that is read and
   then never reaches a filter is exactly the failure this is for. */
const http=require('http'),fs=require('fs'),path=require('path'),pup=require('puppeteer-core');
const ROOT=require('path').join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript'};
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
 if(u==='/favicon.ico'){r.writeHead(204);r.end();return;}
 fs.readFile(path.join(ROOT,u),(e,b)=>{if(e){r.writeHead(404);r.end('');return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(u)]||'application/octet-stream'});r.end(b);});});
let fails=0; const ok=(c,m,x)=>{console.log((c?'  ok   ':'  FAIL ')+m+(x?'   '+x:''));if(!c)fails++;};
(async()=>{
 await new Promise(r=>srv.listen(8778,r));
 const b=await pup.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
   headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const p=await b.newPage(); p.on('pageerror',e=>console.log('PAGEERR',e.message));
 await p.goto('http://localhost:8778/mix-builder.html',{waitUntil:'networkidle0'});
 const out=await p.evaluate(async()=>{
  const DSP=window.MixDSP; const ctx=new AudioContext(), sr=ctx.sampleRate;
  function loop(bpm,secs){const n=Math.floor(sr*secs),buf=ctx.createBuffer(2,n,sr),spb=60/bpm;
   for(let c=0;c<2;c++){const d=buf.getChannelData(c);
    for(let i=0;i<n;i++) d[i]=0.10*Math.sin(2*Math.PI*110*i/sr);
    for(let k=0;k*spb<secs;k++){const at=Math.floor(k*spb*sr);
     for(let j=0;j<sr*0.09&&at+j<n;j++) d[at+j]+=0.85*Math.exp(-j/(sr*0.02))*Math.sin(2*Math.PI*55*j/sr);}}
   return buf;}
  const src=loop(100,60);
  const base={source:src,atSec:58,downbeatSec:0,beats:32,fromBpm:100,toBpm:110,
              patternId:'four',sampleRate:sr};
  const mk=async o=>DSP.toMono(await DSP.buildBeatFill(Object.assign({},base,o)));
  const flat=await mk({});
  const bassy=await mk({lowDb:10});
  const bright=await mk({highDb:12});
  const wet=await mk({reverbPct:60,reverbBeats:2});
  const share=(m,lo,hi)=>{let t=0;for(let i=0;i<m.length;i++)t+=m[i]*m[i];
   const a=DSP.hpFiltfilt(m,lo,sr);let ea=0;for(let i=0;i<a.length;i++)ea+=a[i]*a[i];
   if(hi==null) return t>0?ea/t:0;
   const c=DSP.hpFiltfilt(m,hi,sr);let ec=0;for(let i=0;i<c.length;i++)ec+=c[i]*c[i];
   return t>0?Math.max(0,ea-ec)/t:0;};
  // reverb fills the gaps between hits: measure how much of the time is quiet
  const quietFrac=m=>{const W=Math.floor(sr*0.02);let q=0,n=0;
   for(let w=0;w*W+W<m.length;w++){let s=0;for(let k=0;k<W;k++)s+=m[w*W+k]*m[w*W+k];
    if(10*Math.log10(s/W+1e-20)< -45)q++; n++;}
   return n?q/n:0;};
  return {
   flatLow:+(1-share(flat,200)).toFixed(3), bassyLow:+(1-share(bassy,200)).toFixed(3),
   flatHigh:+share(flat,5000).toFixed(4), brightHigh:+share(bright,5000).toFixed(4),
   flatQuiet:+quietFrac(flat).toFixed(3), wetQuiet:+quietFrac(wet).toFixed(3)
  };
 });
 console.log('  bass +10 dB   energy below 200 Hz: '+out.flatLow+' -> '+out.bassyLow);
 console.log('  highs +12 dB  energy above 5 kHz : '+out.flatHigh+' -> '+out.brightHigh);
 console.log('  reverb 60%    fraction of time quiet: '+out.flatQuiet+' -> '+out.wetQuiet);

  /* Fades, in beats, per junction. Measured at the audio: how long it takes
     to reach full level, and how long it takes to go. */
  const fades = await p.evaluate(async () => {
    const DSP = window.MixDSP; const ctx = new AudioContext(), sr = ctx.sampleRate;
    const n = Math.floor(sr*40), src = ctx.createBuffer(2,n,sr);
    for (let c=0;c<2;c++){ const d=src.getChannelData(c);
      for (let i=0;i<n;i++) d[i]=0.2*Math.sin(2*Math.PI*80*i/sr); }
    const mk = async o => DSP.toMono(await DSP.buildBeatFill(Object.assign(
      {source:src, atSec:38, downbeatSec:0, beats:32, fromBpm:120, toBpm:120,
       patternId:"four", sampleRate:sr}, o)));
    const riseSec = m => { let pk=0; for (let i=0;i<m.length;i++) pk=Math.max(pk,Math.abs(m[i]));
      for (let i=0;i<m.length;i++) if (Math.abs(m[i]) > pk*0.7) return i/sr; return -1; };
    const tailSec = m => { let pk=0; for (let i=0;i<m.length;i++) pk=Math.max(pk,Math.abs(m[i]));
      for (let i=m.length-1;i>=0;i--) if (Math.abs(m[i]) > pk*0.7) return (m.length-i)/sr; return -1; };
    const quick = await mk({fadeInBeats:1, fadeOutBeats:1});
    const slow  = await mk({fadeInBeats:16, fadeOutBeats:16});
    return { quickIn:+riseSec(quick).toFixed(2), slowIn:+riseSec(slow).toFixed(2),
             quickOut:+tailSec(quick).toFixed(2), slowOut:+tailSec(slow).toFixed(2) };
  });
  console.log("  fade in 1 beat: full by " + fades.quickIn + "s;  16 beats: " + fades.slowIn + "s");
  console.log("  fade out 1 beat: last " + fades.quickOut + "s;  16 beats: " + fades.slowOut + "s");
  ok(fades.slowIn > fades.quickIn * 2, "a longer fade in takes longer to arrive",
     fades.quickIn + "s vs " + fades.slowIn + "s");
  ok(fades.slowOut > fades.quickOut * 2, "and a longer fade out takes longer to go",
     fades.quickOut + "s vs " + fades.slowOut + "s");
 ok(out.bassyLow > out.flatLow, 'the Bass control moves the bottom end');
 ok(out.brightHigh > out.flatHigh * 1.3, 'the Highs control moves the top end');
 ok(out.wetQuiet < out.flatQuiet, 'reverb fills the space between the hits');
 /* ---- shaping must not just be levelling ----------------------------
    The tone stage ran BEFORE the fill was levelled against the record, so
    turning the bass up raised the average and the level stage pulled the kit
    back down to hit its target — the control moved the measured low end by a
    fifth of a decibel against a loud record. It runs after now, and holds the
    loudness it had, so shaping costs the other bands rather than the ceiling. */
 const hold = await p.evaluate(async () => {
   const DSP = window.MixDSP, sr = 48000;
   const loud = new OfflineAudioContext(1, sr * 20, sr).createBuffer(1, sr * 20, sr);
   const ld = loud.getChannelData(0);
   for (let i = 0; i < ld.length; i++) ld[i] = (Math.random() * 2 - 1) * 0.9;
   const base = { source: loud, atSec: 20, downbeatSec: 0, beats: 32, preBeats: 8,
                  overBeats: 0, patternId: 'four', fromBpm: 100, toBpm: 100, sampleRate: sr };
   const look = (buf) => {
     const d = buf.getChannelData(0), s = buf.sampleRate;
     let lp = 0, lo = 0, hi = 0, sum = 0;
     const a = Math.exp(-2 * Math.PI * 150 / s);
     for (let i = 0; i < d.length; i++) {
       lp = a * lp + (1 - a) * d[i];
       lo += lp * lp; hi += (d[i] - lp) * (d[i] - lp); sum += d[i] * d[i];
     }
     return { pctLow: 100 * lo / (lo + hi + 1e-20),
              rmsDb: 10 * Math.log10(sum / d.length + 1e-20) };
   };
   const flat = look(await DSP.buildBeatFill(Object.assign({}, base)));
   const cut = look(await DSP.buildBeatFill(Object.assign({}, base, { lowDb: -18 })));
   const verb = look(await DSP.buildBeatFill(Object.assign({}, base, { reverbPct: 70, reverbBeats: 2 })));
   return { flat, cut, verb };
 });
 console.log('   against a loud record: flat ' + hold.flat.pctLow.toFixed(1) + '% low, ' +
             'bass -18 ' + hold.cut.pctLow.toFixed(1) + '% low, reverb ' +
             (hold.verb.rmsDb - hold.flat.rmsDb).toFixed(1) + ' dB against flat');
 ok(hold.flat.pctLow - hold.cut.pctLow > 10,
    'the tone control still bites when the fill is already at the ceiling',
    hold.flat.pctLow.toFixed(1) + '% -> ' + hold.cut.pctLow.toFixed(1) + '%');
 ok(Math.abs(hold.verb.rmsDb - hold.flat.rmsDb) < 2,
    'and reverb does not simply make the drums quieter',
    (hold.verb.rmsDb - hold.flat.rmsDb).toFixed(1) + ' dB');

 await b.close(); srv.close();
 console.log(fails?'\n'+fails+' FAILED':'\nthe EQ and reverb controls reach the audio');
 process.exit(fails?1:0);
})().catch(e=>{console.error('FAILED:',e);process.exit(2);});
