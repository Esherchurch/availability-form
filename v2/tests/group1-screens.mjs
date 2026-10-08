/* The Group 1 pages and every screen each one has.
 *
 * Shared, because two checks walk the same screens and a second copy of this
 * list is how one of them quietly stops covering a screen the other does. The
 * style check measures what each screen looks like; the icon check measures
 * whether its controls still read as controls.
 *
 * A screen the set-up hides is still a screen - see "the welcome tour" below,
 * which A3b dismissed as its first action and so never measured, leaving the
 * only two capsules on CoreTeamApp in place.
 */
const SHUT = "(()=>{document.querySelectorAll('.modal,.sheet,[id^=modal-]').forEach(m=>m.classList.remove('open'));try{openSection('home')}catch(e){}})()";

export const PAGES = [
  { page: 'CoreTeamApp.html', wait: 9000,
    first: "(()=>{try{if(typeof endTour==='function')endTour()}catch(e){}" +
           "const o=document.getElementById('tour-overlay');if(o)o.classList.remove('active');})()",
    states: [
      /* The tour FIRST, before it is dismissed. A3b ran endTour() as its very
         first action and so never looked at it - which left the two controls a
         new person sees before anything else, Skip and Next, as the only
         capsules on the page. A screen that the measurement's own set-up hides
         is still a screen. */
      ['the welcome tour', "(()=>{ if (typeof startTour === 'function') { startTour(); return 'started'; } " +
        "const o = document.getElementById('tour-overlay'); if (o) { o.classList.add('active'); return 'shown'; } return 'no tour'; })()"],
      ['home', "(()=>{ try { if (typeof endTour === 'function') endTour(); } catch (e) {} " +
        "const o = document.getElementById('tour-overlay'); if (o) o.classList.remove('active'); return openSection('home'); })()"],
      ['service planner', "openSection('service')"],
      ['service detail', "(()=>{const c=document.querySelector('#service-list .service-card,#service-list [onclick]');if(c)c.click();else openSection('service-detail')})()"],
      ['rota', "openSection('rota')"],
      ['meetings', "openSection('meetings')"],
      ['email compiler', "openSection('email')"],
      ['sheet: role', SHUT + ";openModal('modal-role-sheet')"],
      ['sheet: availability', SHUT + ";openModal('modal-avail-sheet')"],
      ['sheet: add role', SHUT + ";openModal('modal-add-role-sheet')"],
      ['sheet: drafts', SHUT + ";openModal('modal-drafts')"],
      ['sheet: mailing list', SHUT + ";openModal('modal-mailing')"],
      ['modal: new event', SHUT + ";openModal('modal-new-event')"],
      ['modal: new service', SHUT + ";openModal('modal-new-service')"],
      ['modal: song', SHUT + ";openModal('modal-song')"],
      ['modal: add item', SHUT + ";openModal('modal-add-item')"],
      ['modal: email team', SHUT + ";openModal('modal-email-team')"],
      ['modal: who are you', SHUT + ";openModal('modal-who')"],
      ['modal: confirm', SHUT + ";openModal('modal-confirm')"]
    ] },
  { page: 'Planner.html', wait: 10000, states: [
      ['main', '1'],
      ['archived terms', "(()=>{const a=[...document.querySelectorAll('button')].find(b=>/Restore/i.test(b.textContent));return a?'shown':'none seeded'})()"],
      /* REVEALED, never pressed: the button that opens this panel emails the
         whole team. */
      ['send panel', "(()=>{let n=0;document.querySelectorAll('[id*=odal],[id*=istribution],[id*=send]').forEach(m=>{if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"],
      ['every term expanded', "(()=>{document.querySelectorAll('[onclick^=\"toggleTermCollapse\"]').forEach(h=>h.click());return 1})()"]
    ] },
  { page: 'SundayServicePlanner.html', wait: 9000, states: [
      ['main', '1'],
      /* The two states where the YouTube and SongSelect links exist at all.
         They are built into innerHTML when you type a song title or choose a
         key, so they are on no screen until you do - which is why nothing had
         ever looked at them, and why all three faults in them survived A3,
         A3b and the first side-by-side comparison. A control that only exists
         once you have done something is still a control. */
      ['a song title that is not in the library', `(() => {
         const i = document.querySelector('input.song-title');
         if (!i) return 'no song input';
         i.value = 'Synthetic Song Nobody Has';
         i.dispatchEvent(new Event('input', { bubbles: true }));
         return 'typed'; })()`],
      ['a key chosen on a song', `(() => {
         const i = document.querySelector('input.song-title');
         const s = document.querySelector('select.song-key');
         if (!i || !s) return 'no song row';
         i.value = 'Synthetic Song One';
         i.dispatchEvent(new Event('input', { bubbles: true }));
         if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }
         return 'chose ' + (s.options[s.selectedIndex] || {}).text; })()`],
      ['email modal', "(()=>{const m=document.getElementById('emailModal');if(m){m.classList.remove('hidden');m.style.display='flex'}return 1})()"],
      ['every panel revealed', "(()=>{let n=0;document.querySelectorAll('[id*=odal],details').forEach(m=>{if(m.tagName==='DETAILS'){m.open=true;n++}else if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"]
    ] },
  { page: 'addressbook.html', wait: 8000, states: [
      ['main', '1'],
      ['per-team caps open', "(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);return 1})()"],
      ['editing somebody', "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Edit$/i.test(x.textContent.trim()));if(b)b.click();return 1})()"]
    ] },
  { page: 'resources.html', wait: 8000, states: [
      ['main', '1'],
      ['editor: upload', 'openEditor();'],
      ['editor: add a link', "openEditor();setTimeout(()=>{try{editorMode('link')}catch(e){}},300);1"]
    ] },
  { page: 'videos.html', wait: 8000, states: [
      ['main', '1'],
      ['a video open', "(()=>{const c=document.querySelector('.card');if(c)c.click();return 1})()"]
    ] },
  { page: 'view-only-rota.html', wait: 8000, states: [
      ['main', '1'],
      ['a term collapsed', "(()=>{const h=document.querySelector('[onclick^=\"toggleTermCollapse\"]');if(h)h.click();return 1})()"]
    ] },
  { page: 'places-admin.html', wait: 8000, states: [
      ['tab: sites', "(()=>{const b=[...document.querySelectorAll('.tab')][0];if(b)b.click();return 1})()"],
      ['tab: rooms', "(()=>{const b=[...document.querySelectorAll('.tab')][1];if(b)b.click();return 1})()"],
      ['tab: kit', "(()=>{const b=[...document.querySelectorAll('.tab')][2];if(b)b.click();return 1})()"],
      ['tab: outside venues', "(()=>{const b=[...document.querySelectorAll('.tab')][3];if(b)b.click();return 1})()"],
      ['tab: who approves', "(()=>{const b=[...document.querySelectorAll('.tab')][4];if(b)b.click();return 1})()"]
    ] },

  /* F-067, from the events window: the four pages R1 and R2 added that
     nothing was measuring. Their screens are the tabs and views each one
     actually has, read off the pages, not guessed. */
  { page: 'rooms.html', wait: 9000, states: [
      ['main', '1'],
      ['the week view', "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/week/i.test(x.textContent||''));if(b)b.click();return 1})()"],
      ['the day view', "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\s*day/i.test(x.textContent||''));if(b)b.click();return 1})()"]
    ] },
  { page: 'bookings-admin.html', wait: 9000, states: [
      ['tab: waiting', "(()=>{const b=document.querySelector('[data-tab=\"waiting\"]');if(b)b.click();return 1})()"],
      ['tab: coming up', "(()=>{const b=document.querySelector('[data-tab=\"coming\"]');if(b)b.click();return 1})()"],
      ['tab: day view', "(()=>{const b=document.querySelector('[data-tab=\"day\"]');if(b)b.click();return 1})()"],
      ['tab: past and cancelled', "(()=>{const b=document.querySelector('[data-tab=\"past\"]');if(b)b.click();return 1})()"]
    ] },
  { page: 'book.html', wait: 9000, states: [
      ['main', '1'],
      ['the form filled in', "(()=>{document.querySelectorAll('#f input,#f textarea').forEach(i=>{if(!i.value&&i.type!=='file')i.value=i.type==='email'?'nobody@example.invalid':'Synthetic'});return 1})()"]
    ] },
  { page: 'church-settings.html', wait: 9000, states: [
      ['main', '1']
    ] },
  /* F-089 and F-095, from the events window: the children's register and
     Sunday check-in. */
  { page: 'kids-admin.html', wait: 9000, states: [
      ['main', '1']
    ] },
  { page: 'checkin.html', wait: 9000, states: [
      ['main', '1']
    ] },

  /* ---- RESTYLE GROUP 2: the Worship & AV pages (Step H) --------------

     NONE OF THESE WAS IN THIS LIST. The style check has been reporting a
     clean sweep across twelve pages while eight of the group it is about had
     never been opened by it - the same shape as A-023, where six gated pages
     scored nothing and nothing scored read as nothing wrong.

     So they go in BEFORE the restyle, to get a number to restyle against,
     and each one's screens are read off the page rather than guessed: the
     three tab buttons the AV pages have, the five dialogs the Email Compiler
     has, the admin bar and HTML editor every charter has.

     `restyled: false` comes off each as it is done. */

  { page: 'Library.html', wait: 9000, states: [
      ['main', '1'],
      ['a song picked', "(()=>{const a=document.querySelector('#list a, #list .song, #list li');if(a)a.click();return 1})()"],
      ['searching', "(()=>{const s=document.getElementById('search');if(s){s.value='a';s.dispatchEvent(new Event('input',{bubbles:true}))}return 1})()"]
    ] },
  { page: 'batchupload.html', wait: 9000, states: [
      ['main', '1'],
      ['the form filled in', "(()=>{document.querySelectorAll('input[type=text],textarea').forEach(i=>{if(!i.value)i.value='Synthetic'});return 1})()"]
    ] },
  { page: 'music-uploader.html', wait: 9000, states: [
      ['main', '1'],
      ['the form filled in', "(()=>{document.querySelectorAll('input[type=text],textarea').forEach(i=>{if(!i.value)i.value='Synthetic'});return 1})()"]
    ] },
  { page: 'EmailBuilder2.html', wait: 10000, states: [
      ['main', '1'],
      ['who it goes to', "(()=>{const m=document.getElementById('whoModal');if(m){m.classList.add('open','on');m.style.display='flex'}return 1})()"],
      ['review before sending', "(()=>{const a=document.getElementById('whoModal');if(a){a.classList.remove('open','on');a.style.display='none'}const m=document.getElementById('reviewModal');if(m){m.classList.add('open','on');m.style.display='flex'}return 1})()"],
      ['drafts', "(()=>{const a=document.getElementById('reviewModal');if(a){a.classList.remove('open','on');a.style.display='none'}const m=document.getElementById('draftsModal');if(m){m.classList.add('open','on');m.style.display='flex'}return 1})()"],
      ['people', "(()=>{const a=document.getElementById('draftsModal');if(a){a.classList.remove('open','on');a.style.display='none'}const m=document.getElementById('peopleModal');if(m){m.classList.add('open','on');m.style.display='flex'}return 1})()"],
      ['pictures', "(()=>{const a=document.getElementById('peopleModal');if(a){a.classList.remove('open','on');a.style.display='none'}const m=document.getElementById('gifModal');if(m){m.classList.add('open','on');m.style.display='flex'}return 1})()"]
    ] },
  { page: 'EGBC-HowTo-AV.html', wait: 9000, states: [
      ['tab 1', "(()=>{const b=document.querySelectorAll('.tab-btn')[0];if(b)b.click();return 1})()"],
      ['tab 2', "(()=>{const b=document.querySelectorAll('.tab-btn')[1];if(b)b.click();return 1})()"],
      ['tab 3', "(()=>{const b=document.querySelectorAll('.tab-btn')[2];if(b)b.click();return 1})()"]
    ] },
  { page: 'EGBC-Troubleshoot-AV.html', wait: 9000, states: [
      ['tab 1', "(()=>{const b=document.querySelectorAll('.tab-btn')[0];if(b)b.click();return 1})()"],
      ['tab 2', "(()=>{const b=document.querySelectorAll('.tab-btn')[1];if(b)b.click();return 1})()"],
      ['tab 3', "(()=>{const b=document.querySelectorAll('.tab-btn')[2];if(b)b.click();return 1})()"]
    ] },
  { page: 'EGBC-Training-Worship.html', wait: 9000, states: [
      ['tab 1', "(()=>{const b=document.querySelectorAll('.tab-btn')[0];if(b)b.click();return 1})()"],
      ['tab 2', "(()=>{const b=document.querySelectorAll('.tab-btn')[1];if(b)b.click();return 1})()"],
      ['tab 3', "(()=>{const b=document.querySelectorAll('.tab-btn')[2];if(b)b.click();return 1})()"]
    ] },

  /* The four charters are one page four times over - same markup, same
     admin bar, same HTML editor - so they get the same three screens, and a
     fault in one is a fault in all four. */
  ...['Worshipteamcharter.html', 'Youthcharter.html', 'Coreteamcharter.html',
      'AVteamlandingpage.html'].map(page => ({
    page, wait: 9000, states: [
      ['main', '1'],
      ['the password box', "(()=>{try{openPwModal()}catch(e){const m=document.getElementById('pw-modal');if(m)m.style.display='flex'}return 1})()"],
      ['the admin bar unlocked', "(()=>{const m=document.getElementById('pw-modal');if(m)m.style.display='none';const u=document.getElementById('admin-unlocked-controls');if(u)u.style.display='flex';const l=document.getElementById('admin-locked-controls');if(l)l.style.display='none';return 1})()"],
      ['the HTML editor', "(()=>{try{openHtmlEditor()}catch(e){const m=document.getElementById('html-editor-modal');if(m)m.style.display='flex'}return 1})()"]
    ]
  })),

  /* Added when the emoji were counted: A3 took 42 out of the hub, 1 out of the
     pin board and 1 out of Play-Through, and none of those three was on this
     list - so nothing had ever measured them.

     They carried `restyled: false` while the restyle had not reached them,
     because a gate that fails for work nobody has scheduled is noise. Step H
     restyled all three, so the flag is gone and the style check asserts on
     them like every other page. */
  { page: 'hub.html', wait: 11000, states: [
      ['the tools', '1'],
      ['the admin panel', "(()=>{try{openAdmin();return 'opened'}catch(e){return 'no openAdmin'}})()"],
      ['admin: people', "(()=>{try{adminTab('people');return 1}catch(e){return 'no adminTab'}})()"],
      ['admin: pages', "(()=>{try{adminTab('pages');return 1}catch(e){return 'no adminTab'}})()"],
      ['admin: youth codes', "(()=>{try{adminTab('youth');return 1}catch(e){return 'no adminTab'}})()"],
      ['admin: notices', "(()=>{try{adminTab('news');return 1}catch(e){return 'no adminTab'}})()"],
      ['the team picker', "(()=>{try{openTeamPicker();return 'opened'}catch(e){const b=[...document.querySelectorAll('button')].find(x=>/^switch$/i.test((x.textContent||'').trim()));if(b){b.click();return 'clicked'}return 'no picker'}})()"]
    ] },
  { page: 'stickynotes.html', wait: 8000, states: [
      ['main', '1'],
      ['every panel revealed', "(()=>{let n=0;document.querySelectorAll('[id*=odal],details').forEach(m=>{if(m.tagName==='DETAILS'){m.open=true;n++}else if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"]
    ] },
  { page: 'EGBC-PlayThrough.html', wait: 8000, states: [
      ['main', '1'],
      ['the admin panel revealed', "(()=>{let n=0;document.querySelectorAll('[id*=dmin],[id*=odal]').forEach(m=>{if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"]
    ] }
];

