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
 ok(out.bassyLow > out.flatLow, 'the Bass control moves the bottom end');
 ok(out.brightHigh > out.flatHigh * 1.3, 'the Highs control moves the top end');
 ok(out.wetQuiet < out.flatQuiet, 'reverb fills the space between the hits');
 await b.close(); srv.close();
 console.log(fails?'\n'+fails+' FAILED':'\nthe EQ and reverb controls reach the audio');
 process.exit(fails?1:0);
})().catch(e=>{console.error('FAILED:',e);process.exit(2);});
