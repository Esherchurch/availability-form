/* Reading a host's requirements from their web pages (S6, F-280 10.6):
   every protection in functions/sg-links-core.cjs, with a stand-in for the
   name lookup and the web - no network at all.

     node screenshots/events/sg-links-unit.test.mjs */
import path from 'node:path';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const require = createRequire(path.join(V2, 'functions', 'index.js'));
const L = require('./sg-links-core.cjs');

const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);

/* the stand-in web: names -> addresses, addresses+paths -> answers; every request kept */
function web(names, pages) {
  const asked = [], looked = [];
  return {
    asked, looked,
    lookup: async (h) => { looked.push(h); if (!names[h]) throw new Error('ENOTFOUND'); return names[h].map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 })); },
    request: async ({ url, address, maxBytes }) => {
      asked.push({ url, address });
      const p = pages[url];
      if (!p) return { status: 404, type: 'text/html', body: Buffer.from('') };
      if (p.redirect) return { status: 302, location: p.redirect, type: '' };
      const body = Buffer.from(p.body || '');
      if (body.length > maxBytes) throw new Error('too big');
      return { status: 200, type: p.type || 'text/html; charset=utf-8', body };
    }
  };
}
const PUB = '93.184.216.34';
const page = (title, body, links) => '<html><head><title>' + title + '</title><script>var secret = "never read";</script><style>.x{}</style></head><body><nav>Home | Shop</nav><header>Site header</header><main><h1>' + title + '</h1><p>' + body + '</p>' +
  (links || []).map((l) => '<a href="' + l + '">' + l + '</a>').join(' ') + '</main><footer>Footer words</footer></body></html>';

console.log('1. which addresses are read at all');
ok('https only: plain http, ftp and a file are not', !L.checkUrl('http://example.org/').ok && !L.checkUrl('ftp://example.org/').ok && !L.checkUrl('file:///etc/passwd').ok && L.checkUrl('https://example.org/x').ok);
ok('   the standard port only; no name or password in the address', !L.checkUrl('https://example.org:8443/').ok && !L.checkUrl('https://me:secret@example.org/').ok && L.checkUrl('https://example.org:443/').ok);
ok('   not a web address: refused', !L.checkUrl('not a url').ok);

console.log('\n2. public addresses only');
const priv = ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.1', '172.16.5.5', '172.31.255.255', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd00::1', 'fc00::5', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1'];
ok('PRIVATE, LOOPBACK, LINK-LOCAL (the cloud’s 169.254.169.254), SHARED, MULTICAST, IPv6 LOCAL: all refused', priv.every(L.privateIp), J(priv.filter((x) => !L.privateIp(x))));
ok('   public ones are fine (IPv4 and IPv6)', !L.privateIp(PUB) && !L.privateIp('2606:4700:4700::1111') && !L.privateIp('172.32.0.1') && !L.privateIp('100.128.0.1'));

console.log('\n3. one page, safely');
let w = web({ 'help.example.org': [PUB] }, { 'https://help.example.org/a': { body: page('A', 'Every leader must have a DBS check.') } });
let r = await L.readPages(['https://help.example.org/a'], w);
ok('a public page is read: its words, its title', r.pages.length === 1 && r.pages[0].title === 'A' && /Every leader must have a DBS check\./.test(r.pages[0].text), J(r));
ok('   SCRIPTS, STYLES, MENUS, HEADERS AND FOOTERS are stripped: only the words', !/never read|Home \| Shop|Site header|Footer words|\.x\{\}/.test(r.pages[0].text), r.pages[0].text);
ok('   CONNECTED TO THE ADDRESS THAT WAS CHECKED (the name can’t be switched in between)', w.asked.length === 1 && w.asked[0].address === PUB && w.looked.length === 1, J(w.asked));
w = web({ 'evil.example.org': ['10.0.0.5'] }, { 'https://evil.example.org/': { body: page('X', 'x') } });
r = await L.readPages(['https://evil.example.org/'], w);
ok('A NAME THAT POINTS TO A PRIVATE ADDRESS: refused, and never asked for', r.pages.length === 0 && /private address/.test(r.refused[0].why) && w.asked.length === 0, J(r));
w = web({ 'mixed.example.org': [PUB, '127.0.0.1'] }, { 'https://mixed.example.org/': { body: page('X', 'x') } });
r = await L.readPages(['https://mixed.example.org/'], w);
ok('   a name with a public AND a private address: refused too (no rebinding trick)', r.pages.length === 0 && w.asked.length === 0, J(r));
r = await L.readPages(['https://169.254.169.254/latest/meta-data/'], web({}, {}));
ok('   the cloud’s own metadata address, given straight: refused', r.pages.length === 0 && /private address/.test(r.refused[0].why), J(r));

console.log('\n4. redirects, size and kind');
w = web({ 'a.example.org': [PUB], 'inside.example.org': ['192.168.1.10'] }, { 'https://a.example.org/r': { redirect: 'https://inside.example.org/admin' }, 'https://inside.example.org/admin': { body: 'secret' } });
r = await L.readPages(['https://a.example.org/r'], w);
ok('A REDIRECT TO A PRIVATE ADDRESS: refused, and the private one never asked for', r.pages.length === 0 && /private address/.test(r.refused[0].why) && !w.asked.some((x) => /inside/.test(x.url)), J(r));
w = web({ 'a.example.org': [PUB] }, { 'https://a.example.org/r': { redirect: 'http://a.example.org/plain' } });
r = await L.readPages(['https://a.example.org/r'], w);
ok('   a redirect to plain http: refused', r.pages.length === 0 && /only https/.test(r.refused[0].why), J(r));
w = web({ 'a.example.org': [PUB] }, { 'https://a.example.org/1': { redirect: '/2' }, 'https://a.example.org/2': { redirect: '/3' }, 'https://a.example.org/3': { redirect: '/4' }, 'https://a.example.org/4': { redirect: '/5' }, 'https://a.example.org/5': { body: 'x' } });
r = await L.readPages(['https://a.example.org/1'], w);
ok('   more than 3 redirects: refused', r.pages.length === 0 && /too many redirects/.test(r.refused[0].why), J(r));
w = web({ 'a.example.org': [PUB] }, { 'https://a.example.org/big': { body: 'x'.repeat(L.LIMITS.bytes + 1) } });
r = await L.readPages(['https://a.example.org/big'], w);
ok('A PAGE OVER 2 MB: refused', r.pages.length === 0 && /bigger than 2 MB/.test(r.refused[0].why), J(r.refused));
w = web({ 'a.example.org': [PUB] }, { 'https://a.example.org/app.exe': { body: 'MZ', type: 'application/octet-stream' } });
r = await L.readPages(['https://a.example.org/app.exe'], w);
ok('   not a web page, plain text or a PDF: refused', r.pages.length === 0 && /not a web page/.test(r.refused[0].why), J(r.refused));

console.log('\n5. one level down, on the same site; 20 pages; 45 seconds');
const F = 'https://help.example.org/folders/1';
w = web({ 'help.example.org': [PUB], 'other.example.com': [PUB] }, {
  [F]: { body: page('Being a Group Coordinator', 'Articles:', ['/articles/a', '/articles/b', 'https://other.example.com/elsewhere', '/style.css', '#top']) },
  'https://help.example.org/articles/a': { body: page('Safeguarding', 'Every adult must have read the safeguarding policy.', ['/articles/deeper']) },
  'https://help.example.org/articles/b': { body: page('Camping', 'Tents must be 2 metres apart.') },
  'https://help.example.org/articles/deeper': { body: page('Deeper', 'Not read: two levels down.') }
});
r = await L.readPages([F], w);
ok('A FOLDER PAGE AND ITS ARTICLES: the folder, then the two articles on the same site', J(r.pages.map((p) => p.title)) === J(['Being a Group Coordinator', 'Safeguarding', 'Camping']), J(r.pages.map((p) => p.url)));
ok('   not another site’s page, not a style sheet, and nothing two levels down', !w.asked.some((x) => /other\.example\.com|style\.css|deeper/.test(x.url)), J(w.asked.map((x) => x.url)));
const many = {}; const links = []; for (let i = 0; i < 25; i++) { links.push('/p' + i); many['https://big.example.org/p' + i] = { body: page('P' + i, 'x') }; }
many['https://big.example.org/'] = { body: page('Index', 'x', links) };
r = await L.readPages(['https://big.example.org/'], web({ 'big.example.org': [PUB] }, many));
ok('AT MOST 20 PAGES: the rest are named as not read', r.pages.length === 20 && r.refused.some((x) => /beyond the 20 pages/.test(x.why)), r.pages.length);
r = await L.readPages(['https://a.example.org/1', 'https://a.example.org/2', 'https://a.example.org/3', 'https://a.example.org/4', 'https://a.example.org/5', 'https://a.example.org/6'], web({ 'a.example.org': [PUB] }, {}));
ok('   at most 5 addresses given are read', r.refused.length === 5, r.refused.length);
let clock = 0;
const slow = web({ 'a.example.org': [PUB] }, { 'https://a.example.org/x': { body: page('X', 'x') }, 'https://a.example.org/y': { body: page('Y', 'y') } });
const req0 = slow.request; slow.request = async (o) => { clock += 30000; return req0(o); }; slow.now = () => clock;
r = await L.readPages(['https://a.example.org/x', 'https://a.example.org/y', 'https://a.example.org/z'], slow);
ok('45 SECONDS IN ALL: what isn’t reached in time is named as not read', r.pages.length === 2 && r.refused.some((x) => /out of time/.test(x.why)), J(r.refused));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
