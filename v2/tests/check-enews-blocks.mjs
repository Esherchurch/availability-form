/* The e-news's blocks: what goes in, and what is never in the public copy
 * (FINDINGS-comms C-7, C-8, C-9, C-11). No browser, no emulator.
 *
 *   node tests/check-enews-blocks.mjs      (from v2/)
 *
 * Asks egbc-mailblocks.js directly, with made-up events and notices. Then
 * THE DELIBERATE BREAKS: each one is a small edit to a copy of the file
 * (never the file itself) that the checks must catch - for example letting
 * members-only blocks into the public copy. A break nobody catches is
 * reported as a failure, so a check that cannot fail does not pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const V2 = path.resolve('.');
const SRC = fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8');

function load(src) {
  const module = { exports: {} };
  vm.runInNewContext(src, { module, exports: module.exports, Intl, Date, Math, String, Object, Array, JSON, encodeURIComponent, isNaN });
  return module.exports;
}

/* ---- made-up data (never real records) --------------------------------- */
const NOW = new Date('2026-10-19T09:00:00Z');   /* a Monday */
const ev = (id, o) => Object.assign({ id, title: 'Event ' + id, status: 'confirmed', startLocal: '2026-10-24T18:30', startUtc: Date.UTC(2026, 9, 24, 17, 30), image: 'https://example.invalid/' + id + '.gif' }, o);
const EVENTS = [
  ev('pub', { title: 'Harvest supper', visibility: 'public', signupOn: true, labels: ['Harvest'] }),
  ev('mem', { title: 'Members prayer evening', visibility: 'members' }),
  ev('cm', { title: 'Church members meeting', visibility: 'churchMembers' }),
  ev('team', { title: 'Worship team rehearsal', visibility: 'team', teams: ['Worship'] }),
  ev('unl', { title: 'Tuesday support group', visibility: 'unlisted' }),
  ev('cancel', { title: 'Cancelled quiz', visibility: 'public', status: 'cancelled' }),
  ev('held', { title: 'Held booking', visibility: 'public', status: 'pending' }),
  ev('rota', { title: 'Morning Worship', visibility: 'public', source: 'rota' }),
  ev('late', { title: 'Far-off carols', visibility: 'public', startLocal: '2026-12-20T18:00', startUtc: Date.UTC(2026, 11, 20, 18) }),
  ev('past', { title: 'Last week lunch', visibility: 'public', startLocal: '2026-10-12T12:00', startUtc: Date.UTC(2026, 9, 12, 11) }),
  ev('utc', { title: 'Film club', visibility: 'public', startLocal: undefined, startUtc: Date.UTC(2026, 9, 30, 15) })
];
const NOTICES = [
  { id: 'n1', title: 'Car park closed Saturday', body: '<p>Please park on the road.</p>', teams: [] },
  { id: 'n2', title: 'Worship team only', body: '<p>Bring your folders.</p>', teams: ['Worship'] },
  { id: 'n3', title: 'Old notice', body: '<p>Gone.</p>', teams: [], until: '2026-10-01' }
];
const CHURCH = { name: 'Synthetic Green Church', address: '1 Test Lane, Testtown TT1 1TT', charityNo: '0000001', email: 'office@example.invalid' };
const ZOOM = 'Passcode 271828';

function checks(M) {
  const R = [];
  const ok = (n, v, x) => R.push({ n, v: !!v, x });
  const blocks = M.draft({ now: NOW, events: EVENTS, notices: NOTICES, sunday: { title: 'Morning Worship', when: 'Sunday 25 October · 10am', speaker: 'Sam Taylor' }, base: 'https://example.invalid/v2' });
  const ids = blocks.filter(b => b.type === 'event').map(b => b.eventId);
  const byId = id => blocks.find(b => b.eventId === id);
  ok('draft: a public event goes in, for everyone', byId('pub') && byId('pub').members !== true);
  ok('draft: a members event goes in as members-only', byId('mem') && byId('mem').members === true);
  ok('draft: a church-members event goes in as members-only', byId('cm') && byId('cm').members === true);
  ok('draft: a team event never goes in', !ids.includes('team'), ids);
  ok('draft: a NOT LISTED event never goes in (the AA case)', !ids.includes('unl'), ids);
  ok('draft: cancelled and held events never go in', !ids.includes('cancel') && !ids.includes('held'), ids);
  ok('draft: services come from the Sunday block, not twice', !ids.includes('rota') && blocks.some(b => b.type === 'sunday' && b.speaker === 'Sam Taylor'));
  ok('draft: only the next 14 days', !ids.includes('late') && !ids.includes('past'), ids);
  ok('draft: an event with only startUtc is placed by London time', byId('utc') && /Friday 30 October · 3pm/.test(byId('utc').when), byId('utc') && byId('utc').when);
  ok('draft: London time from startLocal', byId('pub') && /Saturday 24 October · 6:30pm/.test(byId('pub').when), byId('pub') && byId('pub').when);
  ok('draft: sign-up button only where sign-ups are on', byId('pub').buttonUrl.endsWith('/signup.html?event=pub') && !byId('mem').buttonUrl);
  const nb = blocks.find(b => b.type === 'notices');
  ok('draft: church-wide notices only, not a team’s or an expired one', nb && nb.items.map(i => i.id).join() === 'n1', nb && nb.items.map(i => i.id));

  /* Members-only, rendered. Add Val's Zoom block, members-only. */
  const issue = { subject: 'Test', template: 'classic', blocks: blocks.concat([{ type: 'text', title: 'Prayer on Zoom', html: '<p>' + ZOOM + '</p>', members: true }]) };
  const pub = M.render(issue, { version: 'everyone', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER, webUrl: 'https://example.invalid/v2/enews.html?issue=x' });
  const mem = M.render(issue, { version: 'members', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER });
  ok('public copy: no members-only words (Zoom passcode)', !pub.includes(ZOOM));
  ok('public copy: no members-only event', !pub.includes('Members prayer evening') && !pub.includes('Church members meeting'));
  ok('public copy: no notices (members-only until ticked)', !pub.includes('Car park closed'));
  ok('members copy: has the passcode and members events', mem.includes(ZOOM) && mem.includes('Members prayer evening'));
  ok('both copies: the public event card with its words as text', pub.includes('Harvest supper') && mem.includes('Harvest supper'));
  ok('an unknown version is treated as public', !M.render(issue, { version: 'admin', church: CHURCH }).includes(ZOOM));

  ok('an empty verse (drafted for Val) is never in an email', !pub.includes('class="verse"') && M.render({ blocks: [{ type: 'verse', text: '  ' }] }, {}).indexOf('class="verse"') < 0);

  /* Every e-news can be left (C-11), and says who sent it. */
  const empty = M.render({ blocks: [] }, { version: 'everyone', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER });
  ok('unsubscribe link in every copy, even an empty one', [pub, mem, empty].every(h => h.includes('href="' + M.PLACEHOLDER + '"') && />unsubscribe from this list</.test(h)));
  ok('footer: name, address and charity number', [pub, mem].every(h => h.includes('Synthetic Green Church') && h.includes('1 Test Lane') && h.includes('0000001')));
  const viaBlock = M.render({ blocks: [{ type: 'footer' }, { type: 'text', html: '' }] }, { church: CHURCH, unsubscribeUrl: 'https://example.invalid/u?t=1' });
  ok('a real unsubscribe address is kept', viaBlock.includes('href="https://example.invalid/u?t=1"'));

  /* Nothing dangerous reaches an inbox. */
  const bad = M.render({ blocks: [
    { type: 'button', label: 'Click', url: 'javascript:alert(1)' },
    { type: 'text', html: '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=y><a href="javascript:bad()">l</a><a href="https://ok.invalid/">ok</a></p>' },
    { type: 'event', title: '<b>Bold</b>', imageUrl: 'data:image/png;base64,AAAA' }
  ] }, { church: CHURCH });
  ok('no javascript: links', !/javascript:/i.test(bad));
  ok('no scripts, no event handlers, no pasted images', !/<script|onclick|onerror|<img src=x/i.test(bad));
  ok('safe links kept', bad.includes('href="https://ok.invalid/"'));
  ok('titles are text, not HTML', bad.includes('&lt;b&gt;Bold&lt;/b&gt;') && !bad.includes('data:image'));

  /* The two looks, and a church's own colours (decision 4). */
  const green = M.render({ template: 'green', blocks: [{ type: 'section', label: 'Coming up' }] }, { church: CHURCH });
  const own = M.render({ template: 'classic', colours: { bar: '#123456', page: 'red; background:url(x)' }, blocks: [{ type: 'section', label: 'Coming up' }] }, { church: CHURCH });
  ok('green look uses the hub colour', green.includes('bgcolor="#3d6263"'));
  ok('classic look uses the orange bar', pub.includes('bgcolor="#fe7e07"'));
  ok('a church colour is used; a bad one is ignored', own.includes('bgcolor="#123456"') && !own.includes('url(x)'));

  /* The Compiler's snippets are the Compiler's HTML (decision 1). */
  const EB = fs.readFileSync(path.join(V2, 'EmailBuilder2.html'), 'utf8');
  const s = M.snippet;
  ok('Compiler snippets match EmailBuilder2.html',
    EB.includes('<td align="center" bgcolor="#3d6263" style="border-radius:9px;">') && s.button('A', 'https://x.invalid').includes('<td align="center" bgcolor="#3d6263" style="border-radius:9px;">') &&
    EB.includes(s.divider()) && EB.includes(s.spacer()) &&
    EB.includes('<td width="50%" valign="top" style="padding:0 10px 0 0;">Left column…</td>'.replace('…', '…')) && s.columns().includes('Left column'));
  /* Val's look (C-29): the order, the parts, placeholders only in the
     preview, the week can't go out with an empty top, and Outlook-safe. */
  const order = blocks.map(b => b.type).filter(t => t !== 'notices');
  ok('draft in Val\u2019s order: picture, verse, "Coming up this week", Sunday, events', order.slice(0, 4).join() === 'header,verse,section,sunday' && blocks.find(b => b.type === 'section').label === 'Coming up this week', order.join());
  const ev1 = M.draft({ now: NOW, events: [Object.assign({}, EVENTS[0], { description: '<p>Bring a <a href="https://example.invalid/food">dish</a> to share.</p>' })], notices: [], base: 'https://x.invalid' }).find(b => b.type === 'event');
  const evHtml = M.render({ blocks: [ev1] }, { church: CHURCH });
  ok('an event card carries the event\u2019s own description and its links', /Bring a <a href="https:\/\/example\.invalid\/food"[^>]*color:#17a809/.test(evHtml) && evHtml.includes('Harvest supper'));
  const rt = M.readyToSend({ blocks });
  ok('a new week is not ready to send: picture and verse missing', !rt.ok && rt.missing.join() === 'picture,verse', rt);
  ok('not ready without the verse, once the picture is in', !M.readyToSend({ blocks: blocks.map(b => b.type === 'header' ? Object.assign({}, b, { imageUrl: 'https://x.invalid/p.jpg' }) : b) }).ok);
  ok('ready once both are in, or both blocks removed', M.readyToSend({ blocks: blocks.map(b => b.type === 'header' ? Object.assign({}, b, { imageUrl: 'https://x.invalid/p.jpg' }) : b.type === 'verse' ? Object.assign({}, b, { text: 'Love one another' }) : b) }).ok &&
    M.readyToSend({ blocks: blocks.filter(b => b.type !== 'header' && b.type !== 'verse') }).ok);
  const prev = M.render({ blocks }, { church: CHURCH, preview: true });
  ok('the preview shows "Add this week\u2019s picture" and "Add this week\u2019s verse"', prev.includes('Add this week\u2019s picture') && prev.includes('Add this week\u2019s verse'));
  ok('placeholders are never in the copy that is sent', !pub.includes('Add this week') && !mem.includes('Add this week'));
  ok('fluid: 100% wide up to 600px, a fixed 600px table only for Outlook', pub.includes('class="wrap" width="100%"') && pub.includes('max-width:600px') && pub.includes('<!--[if mso]><table role="presentation" width="600"'));
  ok('every picture shrinks to the screen (max-width, height:auto, a width)', (pub.match(/<img [^>]*>/g) || []).every(i => /max-width:\d+px/.test(i) && /height:auto/.test(i) && /width="\d+"/.test(i)));
  ok('Outlook-safe: tables and inline styles, no flex or grid', !/display:\s*(flex|grid)/i.test(pub) && /<td[^>]+style=/.test(pub));
  ok('Val\u2019s colours and sizes: #202020 15px text, teal titles, #17a809 links, #fe7e07 bar, #222222 top bar', pub.includes('font-size:15px;line-height:150%;color:#202020') && pub.includes('color:#008080') && pub.includes('bgcolor="#fe7e07"') && pub.includes('bgcolor="#222222"'));
  ok('on a phone: 18px text and stacked event pictures (Val\u2019s phone rules)', pub.includes('@media only screen and (max-width:480px)') && /\.t,\.t p,\.t li\{font-size:18px !important/.test(pub) && /\.cimg\{display:block !important;width:100% !important/.test(pub));
  /* A meeting (Martin, 20 Oct): from the Meetings list, Join is the hub's
     meeting page (knock), members' copy only by default, CMM always. */
  const mt = M.meetingFrom({ id: 'ev9', type: 'Church Members Meeting', description: 'Autumn', date: '2026-11-03', startTime: '19:30', endTime: '21:00' }, 'CMM', 'https://example.invalid/v2/');
  ok('a meeting: its name, day and time, and Join to the hub\u2019s meeting page (never a host link)', mt.url === 'https://example.invalid/v2/meeting.html?room=CMM&event=ev9' && M.meetingWhen(mt) === 'Tuesday 3 November · 7:30pm–9pm' && mt.title === 'Church Members Meeting · Autumn' && !/daily\.co|[?&]t=|token/i.test(mt.url), [mt.url, M.meetingWhen(mt)]);
  const mtMem = M.render({ blocks: [mt] }, { version: 'members', church: CHURCH });
  ok('a meeting is in the members\u2019 copy with Join and the knock words', mtMem.includes('meeting.html?room=CMM&amp;event=ev9') && />Join the meeting</.test(mtMem) && /knock/.test(mtMem));
  const prayer = M.meetingFrom({ id: 'ev8', type: 'Prayer Meeting', date: '2026-11-04', startTime: '20:00' }, 'Prayer', 'https://example.invalid/v2');
  ok('a meeting is members-only by default: never in everyone else\u2019s copy or the web version', !M.render({ blocks: [prayer, Object.assign({}, prayer, { members: undefined })] }, { version: 'everyone', church: CHURCH }).includes('meeting.html'));
  ok('unticked by the office, an ordinary room\u2019s meeting is for everyone', M.render({ blocks: [Object.assign({}, prayer, { members: false })] }, { version: 'everyone', church: CHURCH }).includes('meeting.html?room=Prayer'));
  ok('the CMM is always members-only, even unticked', !M.render({ blocks: [Object.assign({}, mt, { members: false })] }, { version: 'everyone', church: CHURCH }).includes('meeting.html'));
  ok('not ready to send until the meeting is picked; "Pick the meeting" in the preview only', !M.readyToSend({ blocks: [{ type: 'meeting', room: 'CMM' }] }).ok && M.render({ blocks: [{ type: 'meeting' }] }, { version: 'members', preview: true }).includes('Pick the meeting') && !M.render({ blocks: [{ type: 'meeting' }] }, { version: 'members' }).includes('Pick the meeting'));
  const snip = M.snippet.meeting(mt);
  ok('the Compiler\u2019s meeting: name, day and time, Join to the meeting page, tables only', snip.includes('Church Members Meeting') && snip.includes('Tuesday 3 November') && snip.includes('href="https://example.invalid/v2/meeting.html?room=CMM&amp;event=ev9"') && /<table/.test(snip) && !/display:\s*(flex|grid)/.test(snip));
  /* Stage 1 (plan B and C, approved 20 Oct): Val's card titles, spacing,
     colours, the footer and the draft. */
  const T1 = M.theme({ template: 'classic' });
  const card1 = M.render({ blocks: [{ type: 'event', imageUrl: 'https://x.invalid/p.jpg', html: '<p><strong>NO SOAP!</strong> Words here.</p><p>More words.</p>' }] }, { version: 'members' });
  ok('a card with no title: its first bold line is teal, as Val’s', /<strong style="color:#008080;">NO SOAP!<\/strong>/.test(card1), card1.match(/<strong[^>]*>NO SOAP/));
  ok('a card with a title: the title is teal and bold', /<strong style="color:#008080;">Harvest supper/.test(M.render({ blocks: [{ type: 'event', title: 'Harvest supper', html: '<p>Hi</p>' }] }, {})));
  ok('Val’s paragraphs: 10px above and below', card1.includes('<p style="margin:10px 0;">More words.</p>'));
  ok('Val’s card words: 14px at 125% on a computer', /class="ctext t"[^>]*font-size:14px;line-height:125%/.test(card1));
  ok('Val’s card pictures: corners rounded 3%', /<img [^>]*border-radius:3%/.test(card1));
  const coloured = M.cleanHtml('<p><span style="color: rgb(0, 128, 128)">teal</span> <span style="color:#123456">odd</span> <font color="#fe7e07">orange</font> <span style="color:#008080;background:url(x)">x</span></p>', T1);
  ok('a word coloured from the church’s palette keeps its colour (inline, on a span)', coloured.includes('<span style="color:#008080;">teal</span>') && coloured.includes('<span style="color:#fe7e07;">orange</span>'), coloured);
  ok('a colour not in the palette is dropped, and nothing else on a span survives', coloured.includes('<span>odd</span>') && !/background|url\(/.test(coloured), coloured);
  /* Font, size, line height and highlight, by hand (Martin, 20 Oct). */
  const styled = M.cleanHtml('<p style="line-height:175%"><span style="background-color: rgb(255, 243, 176); font-family: Georgia; font-size: 24px">a</span><span style="font-family:Comic Sans MS;font-size:60px;background:url(x)">b</span><span style="background-color:#008080">c</span></p>', T1);
  ok('font, size, line height and highlight are kept, as email-safe styles', styled.includes('<p style="margin:10px 0;line-height:175%;"><span style="background-color:#fff3b0;font-family:Georgia,Times New Roman,serif;font-size:24px;">a</span>'), styled);
  ok('only fonts every email program has, sizes from the list, light highlights', styled.includes('<span>b</span>') && !/Comic|60px|url\(/.test(styled), styled);
  ok('a highlight is never taken for the words’ colour', styled.includes('<span>c</span>'), styled);
  ok('the palette is the look’s own colours and a few more', ['#008080', '#17a809', '#fe7e07', '#202020'].every(c => M.palette(T1).includes(c)) && M.palette(T1).length <= 12, M.palette(T1));
  const bare = M.render({ blocks: [{ type: 'event', title: 'Prayer evening', when: 'Monday 2 November · 8pm', moreUrl: 'https://x.invalid/whatson.html?event=e1' }] }, {});
  ok('a bare event is a finished card: its title and day, and "More details" to its page', bare.includes('Prayer evening') && /href="https:\/\/x\.invalid\/whatson\.html\?event=e1"[^>]*>More details</.test(bare));
  ok('a card with words has no "More details"', !M.render({ blocks: [{ type: 'event', title: 'X', html: '<p>Hi</p>', moreUrl: 'https://x.invalid/w' }] }, {}).includes('More details'));
  ok('every drafted event links to its page on What’s On', blocks.filter(b => b.type === 'event').every(b => /\/whatson\.html\?event=/.test(b.moreUrl || '')), blocks.filter(b => b.type === 'event').map(b => b.moreUrl));
  const miss = M.missing([{ type: 'event', title: 'Bare' }, { type: 'event', title: 'Has both', imageUrl: 'https://x.invalid/p.jpg', html: '<p>Yes</p>' }, { type: 'event', title: 'No picture', html: '<p>Yes</p>' }]);
  ok('the draft lists events missing a picture or write-up', miss.length === 2 && miss[0].need.join() === 'picture,write-up' && miss[1].need.join() === 'picture', miss);
  const diary = M.diaryItems({ now: NOW, weeks: 6, events: EVENTS, base: 'https://x.invalid' });
  ok('"Dates for the diary": public events only, a date and a title each, linked to What’s On', diary.length > 0 && diary.every(d => d.date && d.title && /whatson\.html\?event=/.test(d.url)) && !diary.some(d => /members|NOT LISTED|support/i.test(d.title)), diary);
  ok('"Dates for the diary" draws as a list', /Dates for the diary[\s\S]*<strong>[^<]+<\/strong> – /.test(M.render({ blocks: [{ type: 'diary', items: diary }] }, {})));
  const foot = M.render({ blocks: [] }, { church: Object.assign({}, CHURCH, { diaryUrl: 'https://x.invalid/whatson.html', social: [{ kind: 'facebook', url: 'https://facebook.com/x' }, { kind: 'email', url: 'office@x.invalid' }, { kind: 'myspace', url: 'https://y.invalid' }, { kind: 'youtube', url: 'javascript:alert(1)' }] }) });
  ok('the footer opens with "Dates for the diary for the coming weeks", to What’s On', /class="foot"[\s\S]*href="https:\/\/x\.invalid\/whatson\.html"[^>]*>Dates for the diary for the coming weeks</.test(foot));
  ok('social icons: PNG pictures the hub serves, 48px, only known networks and safe links', (foot.match(/img\/social\/[a-z]+\.png/g) || []).join() === 'img/social/facebook.png,img/social/email.png' && /width="48" height="48"/.test(foot) && foot.includes('href="mailto:office@x.invalid"') && !/javascript:|myspace/.test(foot), foot.match(/img\/social\/[a-z]+\.png/g));
  ok('no diary button or icons when the church has none', !/Dates for the diary|img\/social/.test(M.render({ blocks: [] }, { church: CHURCH })));

  /* The event invitation, filled from a What's On event (plan G). */
  const INV = [{ type: 'header', imageUrl: '', title: '' }, { type: 'heading', text: '[The event]' },
    { type: 'text', title: '', html: '<p>[What it is and who it\u2019s for.]</p><p><strong>[Day, date and time]</strong><br>[Where]</p>' }, { type: 'button', label: 'Sign up here', url: '' }];
  const evI = (o) => Object.assign({ id: 'e9', title: 'Synthetic harvest supper', visibility: 'public', status: 'confirmed', startLocal: '2026-10-23T18:30', image: 'https://x.invalid/p.jpg', description: '<p>Supper, then a barn dance.</p>', location: 'The church hall', signupOn: true }, o);
  const fi = M.fillInvite(INV, evI(), 'https://x.invalid/v2/');
  ok('an invitation from an event: its picture, title, words, day and time, place', fi && fi.blocks[0].imageUrl === 'https://x.invalid/p.jpg' && fi.blocks[1].text === 'Synthetic harvest supper' &&
    fi.blocks[2].html === '<p>Supper, then a barn dance.</p><p><strong>Friday 23 October, 6:30pm</strong><br>The church hall</p>' && fi.subject === 'You\u2019re invited: Synthetic harvest supper' && fi.preheader === 'Friday 23 October, 6:30pm', fi);
  ok('…its Sign up button goes to the event\u2019s sign-up', fi && fi.blocks[3].label === 'Sign up here' && fi.blocks[3].url === 'https://x.invalid/v2/signup.html?event=e9');
  ok('…complete: nothing left to fill in', fi && M.readyToSend(Object.assign({ kind: 'oneoff', templateId: 'invite' }, fi)).ok);
  const fb = M.fillInvite(INV, evI({ signupOn: false, image: '', description: '', location: '' }), 'https://x.invalid/v2');
  ok('no sign-ups: Find out more, to its What\u2019s On page; no picture: no empty picture block', fb && fb.blocks[fb.blocks.length - 1].label === 'Find out more' && /whatson\.html\?event=e9$/.test(fb.blocks[fb.blocks.length - 1].url) && !fb.blocks.some(b => b.type === 'header'), fb && fb.blocks);
  ok('…what the event lacks stays a [part to fill in], and no "[Where]" left dangling', fb && /\[What it is/.test(JSON.stringify(fb.blocks)) && !/\[Where\]/.test(JSON.stringify(fb.blocks)) && M.readyToSend(Object.assign({ kind: 'oneoff', templateId: 'invite' }, fb)).missing.includes('fill'));
  const fm = M.fillInvite(INV, evI({ visibility: 'members' }), 'https://x.invalid/v2');
  ok('a members\u2019 event: for church members, every block members-only', fm && fm.audience === 'members' && fm.blocks.every(b => b.members === true) && !M.render(Object.assign({}, fm, { subject: '', preheader: '' }), { version: 'everyone' }).includes('Synthetic harvest supper'));
  ok('never a not-listed, team, cancelled or unconfirmed event', ['unlisted', 'team'].every(v => M.fillInvite(INV, evI({ visibility: v }), '') === null) && M.fillInvite(INV, evI({ status: 'cancelled' }), '') === null && M.fillInvite(INV, evI({ status: 'pending' }), '') === null);
  ok('an event\u2019s title cannot break the email', (M.fillInvite(INV, evI({ title: '<img src=x onerror=alert(1)>' }), '') || {}).blocks && !/<img src=x/.test(M.render(M.fillInvite(INV, evI({ title: '<img src=x onerror=alert(1)>' }), ''), {})));
  return R;
}

/* ---- the run ------------------------------------------------------------ */
const R = checks(load(SRC));
R.forEach(r => console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))));

/* ---- deliberate breaks: each must turn at least one named check red ---- */
const BREAKS = [
  ['an invitation to a members\u2019 event for everyone', "      if (share === 'members') b.members = true;", '', 'every block members-only'],
  ['an invitation without its sign-up', "    var link = ev.signupOn === true ?", "    var link = false ?", 'goes to the event\u2019s sign-up'],
  ['members-only blocks let into the public copy', "if (membersOnly(b) && version !== 'members') return false;", '', 'public copy: no members-only words'],
  ['not-listed events allowed in', "return null;   /* 'team', 'unlisted'", "return 'public';   /* 'team', 'unlisted'", 'NOT LISTED'],
  ['the unsubscribe link dropped from the footer', "'Want to change how you receive these emails?<br>You can <a href=\"' + u + '\" style=\"' + white + '\">update your preferences</a> or <a href=\"' + u + '\" style=\"' + white + '\">unsubscribe from this list</a>.'", "''", 'unsubscribe link in every copy'],
  ['javascript: links allowed', "if (/^https?:\\/\\/[^\\s<>\"]+$/i.test(u)", "if (/^(https?|javascript):[^\\s<>\"]+$/i.test(u)", 'no javascript: links'],
  ['team notices let in', 'if ((n.teams || []).length) return false;', '', 'church-wide notices only'],
  ['an empty verse sent', "if (!String(b.text || '').trim()) return o.preview ? row(placeholder('Add this week’s verse', 90), '18px 18px 9px') : '';", '', 'an empty verse'],
  ['the charity number dropped', "c.charityNo ? 'Registered Charity No ' + esc(c.charityNo) : ''", "''", 'footer: name, address and charity number'],
  ['ready to send without a verse', "if (b.type === 'verse' && !String(b.text || '').trim()) missing.push('verse');", '', 'not ready without the verse'],
  ['placeholders sent in the email', "var body = (issue.blocks || [])", "opts = Object.assign({}, opts, { preview: true }); var body = (issue.blocks || [])", 'never in the copy that is sent'],
  ['events drafted without their description', "html: String(ev.description || '').slice(0, 20000),", "html: '',", 'own description'],
  ['meetings let into everyone’s copy', "return b.members !== false || MEMBERS_ONLY_ROOMS.indexOf(String(b.room || '')) >= 0;", 'return false;', 'members-only by default'],
  ['the CMM let out when unticked', "return b.members !== false || MEMBERS_ONLY_ROOMS.indexOf(String(b.room || '')) >= 0;", 'return b.members !== false;', 'the CMM is always members-only'],
  ['card titles left black', "if (!head) body = body.replace(", 'if (false) body = body.replace(', 'first bold line is teal'],
  ['any colour kept on a span', "if (c && t && palette(t).indexOf(c) >= 0) out += ", 'if (c) out += ', 'not in the palette is dropped'],
  ['any font kept', "    if (f) out += 'font-family:' + f + ';';", "    if (pr['font-family']) out += 'font-family:' + pr['font-family'] + ';';", 'only fonts every email program has'],
  ['a highlight taken for the words’ colour', "var out = '', c = hexOf(pr.color),", "var out = '', c = hexOf(pr.color || pr['background-color']),", 'never taken for the words'],
  ['bare events left bare', "var more = bare && safeUrl(b.moreUrl) ?", 'var more = false ?', 'finished card'],
  ['members’ events in the diary', "eventShare(x.ev) === 'public' &&", '', 'public events only'],
  ['any network’s icon allowed', "var k = String(x && x.kind || ''); if (!SOCIAL[k]) return '';", "var k = String(x && x.kind || '');", 'only known networks'],
  ['a fixed 600px width on phones', "class=\"wrap\" width=\"100%\"", "class=\"wrap\" width=\"600\"", 'fluid']
];
let caught = 0;
for (const [what, from, to, expect] of BREAKS) {
  if (!SRC.includes(from)) { console.log('  FAIL  break "' + what + '": the line to break is not in egbc-mailblocks.js any more - update the break'); R.push({ v: false }); continue; }
  let red = [];
  try { red = checks(load(SRC.replace(from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = ['(threw) ' + e.message]; }
  const hit = red.some(n => n.includes(expect));
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '  (red: ' + red.filter(n => n.includes(expect)).join('; ') + ')' : '  - NOTHING CAUGHT IT'));
  if (hit) caught++; else R.push({ v: false });
}
const fails = R.filter(r => !r.v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' checks, ' + caught + '/' + BREAKS.length + ' breaks caught');
process.exit(fails ? 1 : 0);
