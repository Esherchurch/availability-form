/* ===================================================================
   DRIVERS AND VEHICLES (the reviewing window's job 4)
   ===================================================================
   Who may drive for the church, and the vehicles it uses, kept to what the
   checks need. A driver's record (drivers/{memberId}) holds only:

     licence     the categories that matter (B, D1, D), when it was last
                 checked (with the DVLA, or the licence seen) and by whom,
                 and when the photocard runs out - never its number, a date
                 of birth, an address or any points
     insurance   their own (with when it runs out) or the church's
     minibus     may they drive the minibus: D1 on their licence; their car
                 licence under the conditions; or no
     midas       the minibus driver course (MiDAS), when done; renewed
                 every 4 years, where the church asks for it

   Only the people the church names (transportSettings/main.readers) and
   master admins read those. Everyone else - an event's organiser choosing
   drivers - reads driverOk/{memberId}: a name and the dates they are
   cleared until, for cars and for the minibus. Nothing else.

   Vehicles (vehicles/{id}) are not personal: their MOT, insurance, road tax
   and service dates, and each walk-round check before a journey.

     TR.settingsOf(s)                     { readers, midas, recheckMonths }
     TR.driverState(d, set, day)          { cars, minibus, carsUntil, minibusUntil, rag, why[] }
     TR.okRecord(d, set, name)            the driverOk record
     TR.vehicleState(v, day)              { rag, legalOk, rows[] }
     TR.eventRows(o)                      the event assessment's own rows
   =================================================================== */
(function (global) {
  'use strict';
  var CATS = [['B', 'B (cars)'], ['D1', 'D1 (minibuses)'], ['D', 'D (buses)']];
  var MINIBUS = [['d1', 'Yes: D1 is on their licence'],
    ['car', 'Yes: on their car licence, under the conditions (aged 21 or over, held it at least 2 years, a volunteer, not paid, and a minibus of 3.5 tonnes at most, or 4.25 with a wheelchair lift)'],
    ['no', 'No']];
  var CHECKED_HOW = [['dvla', 'Checked with the DVLA (a check code)'], ['seen', 'The licence was seen']];
  var VEHICLE_DATES = [['mot', 'MOT', true], ['insurance', 'Insurance', true], ['tax', 'Road tax', true], ['service', 'Service', false]];
  var WALK = ['Tyres: tread and pressure, no damage', 'Lights and indicators work', 'Mirrors, windows and wipers clean and working', 'Seatbelts, one for every seat, working',
    'Doors and the emergency exit open and close', 'Fuel, oil and screen wash', 'First aid kit and fire extinguisher on board', 'Wheelchair lift and restraints (if fitted) work'];

  function addMonths(day, n) { var p = String(day).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1 + n, p[2])).toISOString().slice(0, 10); }
  function plusDays(day, n) { var p = String(day).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  var isDay = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };
  var first = function (list) { return list.filter(isDay).sort()[0] || ''; };

  function settingsOf(s) {
    s = s || {};
    var m = parseInt(s.recheckMonths, 10);
    return { readers: (s.readers || []).slice(0, 20), midas: s.midas !== false, recheckMonths: m >= 6 && m <= 36 ? m : 12 };
  }

  /* the day each kind of driving stops being cleared ('' = not cleared at all) */
  function driverState(d, set, day) {
    d = d || {}; set = settingsOf(set);
    var lic = d.licence || {}, ins = d.insurance || {}, why = [];
    var cats = lic.categories || [];
    var licUntil = isDay(lic.checkedOn) ? first([addMonths(lic.checkedOn, set.recheckMonths), lic.expires]) : '';
    if (!isDay(lic.checkedOn)) why.push('The licence has not been checked.');
    if (cats.indexOf('B') < 0 && cats.indexOf('D1') < 0 && cats.indexOf('D') < 0) why.push('No licence category is recorded.');
    var insUntil = ins.kind === 'church' ? '9999-12-31' : (ins.kind === 'own' && isDay(ins.expires) ? ins.expires : '');
    if (!insUntil) why.push('Their insurance is not recorded.');
    var carsUntil = licUntil && insUntil && cats.length ? first([licUntil, insUntil]) : '';
    var mb = d.minibus || 'no', midasUntil = !set.midas ? '9999-12-31' : (d.midas && isDay(d.midas.on) ? addMonths(d.midas.on, 48) : '');
    var minibusOk = mb === 'd1' ? cats.indexOf('D1') >= 0 || cats.indexOf('D') >= 0 : mb === 'car' ? cats.indexOf('B') >= 0 : false;
    if (mb !== 'no' && !minibusOk) why.push('The minibus answer doesn’t match the licence categories.');
    if (mb !== 'no' && !midasUntil) why.push('The minibus driver course (MiDAS) is not recorded.');
    var minibusUntil = minibusOk && licUntil && midasUntil ? first([licUntil, midasUntil]) : '';
    var at = day || new Date().toISOString().slice(0, 10);
    var cars = !!carsUntil && carsUntil >= at, minibus = !!minibusUntil && minibusUntil >= at;
    if (carsUntil && carsUntil < at) why.push('Cleared for cars until ' + carsUntil + ': out of date.');
    if (minibusUntil && minibusUntil < at) why.push('Cleared for the minibus until ' + minibusUntil + ': out of date.');
    var soonest = first([cars ? carsUntil : '', minibus ? minibusUntil : '']);
    var rag = !cars && !minibus ? 'red' : soonest && soonest <= plusDays(at, 42) ? 'amber' : 'green';
    return { cars: cars, minibus: minibus, carsUntil: carsUntil === '9999-12-31' ? '' : carsUntil, minibusUntil: minibusUntil, rag: rag, why: why };
  }
  /* what everyone else may read */
  function okRecord(d, set, name) {
    var s = driverState(d, set, '0000-01-01');
    return { name: String(name || '').slice(0, 120), carsUntil: s.carsUntil, minibusUntil: s.minibusUntil };
  }

  function vehicleState(v, day) {
    v = v || {};
    var at = day || new Date().toISOString().slice(0, 10), legalOk = true, worst = 'green';
    var rows = VEHICLE_DATES.map(function (x) {
      var due = (v.due || {})[x[0]] || '', rag;
      if (!isDay(due)) { rag = x[2] ? 'amber' : 'grey'; }
      else if (due < at) { rag = x[2] ? 'red' : 'amber'; if (x[2]) legalOk = false; }
      else rag = due <= plusDays(at, 42) ? 'amber' : 'green';
      if (rag === 'red' || (rag === 'amber' && worst === 'green')) worst = rag;
      return { k: x[0], label: x[1], due: due, rag: rag };
    });
    return { rag: worst, legalOk: legalOk, rows: rows };
  }

  /* An event's own rows (H&S step 5's "from the hub's own numbers"):
     o: { transport: { driverIds, vehicleIds }, drivers: { id: driverOk }, vehicles: { id: vehicle }, day, away } */
  var low = function (r) { return r.k === 'mot' ? 'MOT' : r.label.toLowerCase(); };
  function eventRows(o) {
    var t = o.transport || {}, out = [], day = o.day;
    var dIds = t.driverIds || [], vIds = t.vehicleIds || [];
    if (!dIds.length && !vIds.length) {
      if (o.away) out.push({ rag: 'amber', words: 'No drivers or vehicles chosen from the church’s records (if the church is driving).' });
      return out;
    }
    var minibus = vIds.some(function (id) { return (o.vehicles[id] || {}).kind === 'minibus'; });
    vIds.forEach(function (id) {
      var v = o.vehicles[id]; if (!v) return;
      var s = vehicleState(v, day), name = v.name || 'A vehicle';
      s.rows.filter(function (r) { return r.rag === 'red'; }).forEach(function (r) { out.push({ rag: 'red', mustNot: true, words: name + ': its ' + low(r) + ' ran out on ' + r.due + ', before the day. Must not be used.' }); });
      s.rows.filter(function (r) { return r.rag === 'amber' && !r.due && r.k !== 'service'; }).forEach(function (r) { out.push({ rag: 'amber', words: name + ': no ' + low(r) + ' date recorded.' }); });
      if (s.legalOk && s.rows.every(function (r) { return r.due || r.k === 'service'; })) out.push({ rag: 'green', words: name + ': MOT, insurance and road tax in date on the day.' });
    });
    dIds.forEach(function (id) {
      var d = o.drivers[id] || {}, name = d.name || 'A driver';
      var until = minibus ? d.minibusUntil : d.carsUntil, what = minibus ? 'the minibus' : 'for the church';
      if (!until) out.push({ rag: 'red', mustNot: true, words: name + ' is not cleared to drive ' + what + '.' });
      else if (until < day) out.push({ rag: 'red', mustNot: true, words: name + ' is cleared to drive ' + what + ' only until ' + until + ', before the day.' });
      else out.push({ rag: 'green', words: name + ' is cleared to drive ' + what + ' on the day.' });
    });
    return out;
  }

  var api = { CATS: CATS, MINIBUS: MINIBUS, CHECKED_HOW: CHECKED_HOW, VEHICLE_DATES: VEHICLE_DATES, WALK: WALK,
    settingsOf: settingsOf, driverState: driverState, okRecord: okRecord, vehicleState: vehicleState, eventRows: eventRows, addMonths: addMonths };
  global.EGBCTransport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
