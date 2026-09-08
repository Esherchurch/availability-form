/* Serve the PACKAGED app-page, not the source folder, and press play.

   The source folder always has every file in it; the installer copies a subset.
   That difference is what let a missing script reach the built app while every
   test passed, so this one tests what was actually built. */
const http=require('http'),fs=require('fs'),path=require('path'),pup=require('puppeteer-core');
const ROOT=require('path').join(__dirname,'..','..','mix-app','dist','win-unpacked','resources','app-page');
const MUSIC='C:/Users/marti/Music/Amazon Music';
const A='13 - Despacito (Remix) [feat. Justin Bieber].mp3';
const B='03 - Here Comes the Hotstepper (Heartical Mix).mp3';
const MIME={'.html':'text/html','.js':'text/javascript','.mp3':'audio/mpeg'};
let missed=[];
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
 if(u==='/favicon.ico'){r.writeHead(204);r.end();return;}
 const p=path.join(ROOT,u);
 fs.readFile(p,(e,b)=>{if(e){missed.push(u);r.writeHead(404);r.end('');return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
let fails=0; const ok=(c,m,x)=>{console.log((c?'  ok   ':'  FAIL ')+m+(x?'   '+x:''));if(!c)fails++;};
(async()=>{
 if (!fs.existsSync(path.join(ROOT,"mix-builder.html"))) {
   console.log("  nothing built yet — run electron-builder first"); process.exit(0); }
 await new Promise(r=>srv.listen(8798,r));
 const b=await pup.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
   headless:'new',args:['--no-sandbox','--window-size=1600,1100','--js-flags=--max-old-space-size=4096']});
 const p=await b.newPage(); await p.setViewport({width:1600,height:1100});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await p.goto('http://localhost:8798/mix-builder.html',{waitUntil:'networkidle0'});

 ok(missed.length===0,'every file the packaged page asks for is there',
    missed.length?missed.join(', '):'none missing');
 const mods=await p.evaluate(()=>({
   dsp:typeof window.MixDSP, proj:typeof window.MixProject,
   render:typeof window.MixRender, preview:typeof window.MixPreview }));
 console.log('    modules: '+JSON.stringify(mods));
 ok(mods.preview==='object','the transport module loaded in the packaged app',mods.preview);

 const inp=await p.$('#file');
 await inp.uploadFile(path.join(MUSIC,A),path.join(MUSIC,B));
 await p.waitForFunction(()=>document.querySelectorAll('#timeline .clip.song').length>=2,{timeout:240000});
 await p.waitForFunction(()=>{
   const all=document.querySelectorAll('#timeline .clip.song');
   const miss=document.querySelectorAll('#timeline .clip.song.unlinked');
   return all.length>=2 && miss.length===0;},{timeout:240000});
 await new Promise(r=>setTimeout(r,600));

 await p.evaluate(()=>{window.__live=0;
   const pr=(window.AudioContext||window.webkitAudioContext).prototype;
   const o=pr.createBufferSource;
   pr.createBufferSource=function(){const n=o.call(this);const s=n.start.bind(n),st=n.stop.bind(n);
     let c=false; n.start=function(...a){window.__live++;c=true;return s(...a);};
     n.stop=function(...a){if(c){window.__live--;c=false;}return st(...a);};
     n.addEventListener('ended',()=>{if(c){window.__live--;c=false;}}); return n;};});

 const phBefore=await p.evaluate(()=>(document.getElementById('tlPlayhead')||{}).style.left);
 await p.click('#previewBtn');
 await p.waitForFunction(()=>window.__live>0,{timeout:60000}).catch(()=>{});
 await new Promise(r=>setTimeout(r,2200));
 const st=await p.evaluate(()=>({
   live:window.__live,
   ph:(document.getElementById('tlPlayhead')||{}).style.left,
   pos:(document.getElementById('mixPos')||{}).textContent,
   status:(document.getElementById('status')||{}).textContent||''}));
 console.log('    '+st.status);
 ok(st.live>0,'pressing play in the packaged app makes sound',st.live+' sources');
 ok(st.ph!==phBefore,'and the timeline moves',phBefore+' → '+st.ph);
 await p.click('#previewStopBtn');
 ok(errs.length===0,'no console errors',errs.slice(0,3).join(' | '));
 await b.close(); srv.close();
 console.log(fails?'\n'+fails+' FAILED':'\nthe packaged app plays');
 process.exit(fails?1:0);
})().catch(e=>{console.error('HARNESS FAILED:',e);process.exit(2);});
