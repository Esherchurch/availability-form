/* ===================================================================
   EGBC — starter templates for any church (FINDINGS-comms plan G; the
   reviewing window went through the usual starter layouts and chose these)
   ===================================================================

   Generic wording any church can change. Each follows the shape of an
   email people already know; the hub's own words and look. Parts still to
   fill in are written [in square brackets]: Check lists them and Send is
   held until none is left (egbc-mailblocks.js readyToSend). Blocks are
   the e-news's own (egbc-mailblocks.js). A church's own templates are kept
   in emailTemplates; these are never stored, so every church has them
   from the start (rule 13: nobody presses "set up").

     EGBCStarters.LIST   -> [{ id, name, group, about, subject, preheader, audience, blocks }]
     EGBCStarters.get(id)
   Works in a page (window.EGBCStarters) and in node (module.exports).
   =================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCStarters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var P = function (h) { return '<p>' + h + '</p>'; };
  var text = function (title, html) { return { type: 'text', title: title || '', html: html }; };
  var pic = function (alt) { return { type: 'picture', url: '', alt: alt || '' }; };
  var hero = { type: 'header', imageUrl: '', title: '' };
  var btn = function (label) { return { type: 'button', label: label, url: '' }; };
  var bar = function (label) { return { type: 'section', label: label }; };
  var card = function (title) { return { type: 'event', imageUrl: '', html: '<p><strong>' + title + '</strong><br>[What it is, who it’s for, when and where.]</p>' }; };
  var sign = text('', P('With every blessing,') + P('[Your name]'));

  var LIST = [
    /* Weekly and monthly */
    { id: 'weekly', group: 'News', name: 'Weekly news', about: 'This week’s picture and verse, Sunday, What’s On and the notices.', subject: '[Church] e-news [date]', preheader: 'What’s happening this week', audience: 'subscribers', weekly: true, blocks: [] },
    { id: 'monthly', group: 'News', name: 'Monthly news', about: 'The month at a glance: a letter, what’s coming up, and news.', subject: '[Month] news from [Church]', preheader: 'The month ahead', audience: 'subscribers',
      blocks: [hero, text('A word for the month', P('[A few lines to open the month.]')), bar('Coming up this month'), { type: 'diary', title: 'Dates for the diary', weeks: 6, items: [] }, bar('News'), text('', P('[A piece of news, with a link if there is one.]'))] },
    { id: 'minister', group: 'News', name: 'Letter from the minister', about: 'Plain words, no pictures: a pastoral letter.', subject: 'A letter from [name]', preheader: '', audience: 'subscribers',
      blocks: [text('', P('Dear {{first_name}},') + P('[Your letter.]')), sign] },
    { id: 'story', group: 'People and stories', name: 'Story / ministry update', about: 'A picture, a story, and how to pray or get involved.', subject: 'News from [the ministry]', preheader: '[One line about the story]', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: '[The headline]' }, text('', P('[The story: what happened, who was there, what it meant.]')), bar('How you can help'), text('', '<ul><li>[Pray for…]</li><li>[Give or volunteer…]</li></ul>'), btn('Find out more')] },
    { id: 'team', group: 'People and stories', name: 'Meet our team', about: 'Two or three people, with a picture and a few words each.', subject: 'Meet [the team]', preheader: 'The people behind [the team]', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'Meet [the team]' }, text('', P('[A line about what the team does.]')), card('[Name], [role]'), card('[Name], [role]'), card('[Name], [role]')] },
    /* Events */
    { id: 'invite', group: 'Events', name: 'Event invitation', about: 'One event, with its picture and a button to sign up.', subject: 'You’re invited: [event]', preheader: '[Day and time]', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: '[The event]' }, text('', P('[What it is and who it’s for.]') + P('<strong>[Day, date and time]</strong><br>[Where]')), btn('Sign up here')] },
    { id: 'whatson', group: 'Events', name: 'What’s on this month', about: 'The month’s events from What’s On, filled in for you.', subject: 'What’s on in [month]', preheader: 'Dates for your diary', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'What’s on in [month]' }, { type: 'diary', title: 'Dates for the diary', weeks: 6, items: [] }, btn('See everything on What’s On')] },
    { id: 'multiday', group: 'Events', name: 'Holiday club / weekend away', about: 'Several days: what each day holds, and how to book.', subject: '[Holiday club]: [dates]', preheader: 'Book your place', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: '[Holiday club]' }, text('', P('[Who it’s for, the dates, the cost.]')), { type: 'columns', cols: [{ html: P('<strong>[Day 1]</strong><br>[What happens]') }, { html: P('<strong>[Day 2]</strong><br>[What happens]') }, { html: P('<strong>[Day 3]</strong><br>[What happens]') }] }, btn('Book a place')] },
    { id: 'carols', group: 'Events', name: 'Carol service / concert', about: 'A performance: the programme, the time, tickets if any.', subject: '[Carol service], [date]', preheader: 'Everyone welcome', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: '[Carol service]' }, text('', P('<strong>[Day, date and time]</strong><br>[Where]') + P('[What to expect: carols, readings, mince pies.]')), btn('Tickets and details')] },
    { id: 'speaker', group: 'Events', name: 'Guest speaker', about: 'Who is coming, a photo and a few lines about them.', subject: '[Name] is coming to [Church]', preheader: '[Day and time]', audience: 'subscribers',
      blocks: [{ type: 'heading', text: '[Name] is coming' }, card('[Name]'), text('', P('<strong>[Day, date and time]</strong><br>[Where]')), btn('Find out more')] },
    { id: 'cmm', group: 'Church life', name: 'Church members’ meeting', about: 'The agenda and papers, and the meeting with Join. Church members only.', subject: 'Church members’ meeting, {date}', preheader: 'For church members: the agenda and how to join', audience: 'members',
      blocks: [text('Church members’ meeting', P('Dear {{first_name}},') + P('You are warmly invited to our church members’ meeting on <strong>[day and date at time]</strong>, at [place].') + P('[The agenda, or a line about it.]')), btn('See the agenda and papers'), { type: 'meeting', room: 'CMM', members: true }, sign] },
    { id: 'after', group: 'Events', name: 'After the event', about: 'Thank you for coming, a few pictures, and what’s next.', subject: 'Thank you for coming to [event]', preheader: 'A few pictures', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'Thank you for coming' }, text('', P('[A few lines: how it went, a thank you.]')), { type: 'pictures', urls: ['', ''] }, text('What’s next', P('[The next thing to come to.]'))] },
    { id: 'service', group: 'Church life', name: 'Service change', about: 'A short notice: what’s changed and when.', subject: 'Change to [service] on [date]', preheader: '', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'A change to [the service]' }, text('', P('[What has changed, when, and why, in a line or two.]'))] },
    { id: 'sermon', group: 'Church life', name: 'Sermon video', about: 'Last Sunday’s talk to watch, with a line about it.', subject: 'Watch: [title]', preheader: '[Speaker] on [passage]', audience: 'subscribers',
      blocks: [{ type: 'heading', text: '[Title of the talk]' }, { type: 'video', url: '', label: 'Watch the talk' }, text('', P('[Speaker], on [passage]. [A line about it.]'))] },
    { id: 'appeal', group: 'Giving', name: 'Gift day / appeal', about: 'What the gift is for, what it will make possible, how to give.', subject: '[Gift day]: [what it is for]', preheader: 'How you can help', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: '[Gift day]' }, text('', P('Dear {{first_name}},') + P('[What we’re giving for, and what it will make possible.]')), btn('Give'), sign] },
    { id: 'thanks', group: 'Giving', name: 'Thank you', about: 'Thanks for giving or helping, and what it made possible.', subject: 'Thank you', preheader: '[What your giving made possible]', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'Thank you' }, text('', P('Dear {{first_name}},') + P('[What happened because of your gift or help.]')), sign] },
    { id: 'welcome-sub', group: 'Welcome', name: 'New subscriber welcome', about: 'Sent when someone signs up: what to expect and where to find things.', subject: 'Welcome to [Church]’s e-news', preheader: 'What to expect', audience: 'picked',
      blocks: [{ type: 'heading', text: 'Welcome' }, text('', P('Dear {{first_name}},') + P('Thank you for signing up. Each week you’ll get [what’s in the e-news].') + P('[Where to find Sunday services and What’s On.]')), btn('See What’s On')] },
    { id: 'newcomer', group: 'Welcome', name: 'Newcomer welcome', about: 'For someone who said "I’m new here": a friendly hello and next steps.', subject: 'Lovely to meet you', preheader: 'A few things you might like to know', audience: 'picked',
      blocks: [text('', P('Dear {{first_name}},') + P('It was lovely to see you [on Sunday]. [A few lines of welcome.]') + '<ul><li>[Something for families]</li><li>[A way to get to know people]</li><li>[Who to ask]</li></ul>'), sign] },
    { id: 'course', group: 'Welcome', name: 'Course welcome', about: 'Before a course starts: when, where, what to bring.', subject: 'Welcome to [course]', preheader: 'Before we start', audience: 'picked',
      blocks: [{ type: 'heading', text: 'Welcome to [course]' }, text('', P('Dear {{first_name}},') + P('<strong>[First session: day, date and time]</strong><br>[Where]') + P('[What to bring, and who to contact.]')), sign] },
    { id: 'reminder', group: 'Church life', name: 'Reminder', about: 'A short reminder of something soon.', subject: 'Reminder: [what]', preheader: '[When]', audience: 'subscribers',
      blocks: [text('', P('<strong>[What, when and where]</strong>') + P('[One line about it.]')), btn('Find out more')] },
    /* The church year */
    { id: 'advent', group: 'The church year', name: 'Advent & Christmas', about: 'Christmas services and events, and a word for the season.', subject: 'Christmas at [Church]', preheader: 'Services and events this Christmas', audience: 'subscribers',
      blocks: [hero, { type: 'verse', text: '', ref: '' }, bar('Christmas services'), text('', P('<strong>[Carol service: day, date, time]</strong>') + P('<strong>[Christmas Eve: time]</strong>') + P('<strong>[Christmas Day: time]</strong>')), text('A word for Christmas', P('[A few lines.]'))] },
    { id: 'easter', group: 'The church year', name: 'Lent & Easter', about: 'Holy Week and Easter services, and a word for the season.', subject: 'Easter at [Church]', preheader: 'Holy Week and Easter services', audience: 'subscribers',
      blocks: [hero, { type: 'verse', text: '', ref: '' }, bar('Holy Week and Easter'), text('', P('<strong>[Good Friday: time]</strong>') + P('<strong>[Easter Sunday: time]</strong>')), text('A word for Easter', P('[A few lines.]'))] },
    { id: 'harvest', group: 'The church year', name: 'Harvest', about: 'Harvest services and what to bring.', subject: 'Harvest at [Church]', preheader: 'Harvest services and how to give', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: 'Harvest' }, text('', P('<strong>[Harvest service: day, date, time]</strong>') + P('[What to bring, and where it goes.]')), btn('Find out more')] },
    { id: 'remembrance', group: 'The church year', name: 'Remembrance Sunday', about: 'The service, the two minutes’ silence, and a word.', subject: 'Remembrance Sunday, [date]', preheader: 'We will remember them', audience: 'subscribers',
      blocks: [{ type: 'heading', text: 'Remembrance Sunday' }, text('', P('<strong>[Service: day, date, time]</strong>') + P('[The silence at 11, and any parade or wreaths.]')), { type: 'verse', text: '', ref: '' }] },
    { id: 'mothering', group: 'The church year', name: 'Mothering Sunday', about: 'The service, and flowers or a gift for everyone.', subject: 'Mothering Sunday, [date]', preheader: 'Everyone welcome', audience: 'subscribers',
      blocks: [hero, { type: 'heading', text: 'Mothering Sunday' }, text('', P('<strong>[Service: day, date, time]</strong>') + P('[Flowers for everyone, or what is planned.]'))] }
  ];
  function get(id) { var s = LIST.filter(function (x) { return x.id === id; })[0]; return s ? JSON.parse(JSON.stringify(s)) : null; }
  return { LIST: LIST, get: get };
});
