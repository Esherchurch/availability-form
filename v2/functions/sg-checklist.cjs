/* THE REQUIRED CHECKLIST, the server's copy (for the AI drafts and the host's
   requirements): the same ids and words as egbc-sg-templates.js CHECKLIST and
   FLAGS - the unit test checks they match. Generated from the page's copy;
   change both together. */
'use strict';
const CHECKLIST = {
  "core": [
    {
      "id": "insurance",
      "label": "Insurance: is the activity covered by the church’s insurance, and has the insurer been told where it needs to be (overseas, overnight, adventurous activities, hired transport)? Who checked, and when?"
    },
    {
      "id": "incharge",
      "label": "Who is in charge on the day, and who is the named deputy?",
      "hint": "Roles and names of leaders are fine; never a child"
    },
    {
      "id": "leaders",
      "label": "Leaders: enough for the ratio, two adults at all times, and every leader’s criminal record check and training in date?",
      "hint": "The hub’s own check is shown here"
    },
    {
      "id": "consent",
      "label": "Consent: has a parent or guardian given consent for this event, covering the activities, photos and medical treatment, for every child before they go?"
    },
    {
      "id": "paedFirstAid",
      "label": "Is there a trained paediatric first aider with the group? Who, and when does their certificate run out?",
      "hint": "Essential where young children are present.",
      "yesNo": true
    },
    {
      "id": "medical",
      "label": "Medical needs and allergies: are needs known (in general terms), medicines carried by a named leader, and a trained first aider and kit going?"
    },
    {
      "id": "emergency",
      "label": "Emergencies: the nearest hospital, how to call for help, the emergency plan, and how parents and the church at home will be told."
    },
    {
      "id": "contacts",
      "label": "Contacts: who is the 24-hour contact at home (not on the trip)? Are leaders’ phones charged and with signal?"
    },
    {
      "id": "headcount",
      "label": "Head counts and the lost-child plan; the meeting point, and hand-back only to people on the collection list."
    },
    {
      "id": "transport",
      "label": "Transport: is the operator or driver checked (licence, insurance, seatbelts)? Private cars only with driver checks, and booster seats where needed."
    },
    {
      "id": "venue",
      "label": "The venue, host or activity provider: checked, their safeguarding policy and risk assessment seen, and licences where they apply (for example adventure activity licensing in the UK)?"
    },
    {
      "id": "photos",
      "label": "Photos and social media: consent given, and no locations or names posted?"
    },
    {
      "id": "weather",
      "label": "Weather, and the plan if it has to be cancelled or cut short."
    },
    {
      "id": "incidents",
      "label": "Incidents: how will any incident or concern be recorded and reported to the safeguarding lead?"
    }
  ],
  "abroad": [
    {
      "id": "travelAdvice",
      "label": "Government travel advice for the destination: checked, and checked again just before leaving?"
    },
    {
      "id": "passports",
      "label": "Passports, visas, and any rules for children travelling without a parent?"
    },
    {
      "id": "travelInsurance",
      "label": "Travel insurance for everyone, including medical treatment and repatriation?"
    },
    {
      "id": "health",
      "label": "Vaccinations and health advice for the destination?"
    },
    {
      "id": "localEmergency",
      "label": "Local emergency numbers, and the nearest embassy or consulate?"
    },
    {
      "id": "money",
      "label": "Money, and how the group will keep in touch (phones, roaming, wifi)?"
    },
    {
      "id": "localHelpers",
      "label": "Local helpers or hosts: do they need checks equivalent to ours, and have they had them?"
    }
  ],
  "overnight": [
    {
      "id": "sleeping",
      "label": "Sleeping arrangements: separate by age and gender, and adults never sharing with children (unless their own child)?"
    },
    {
      "id": "nightRota",
      "label": "The night supervision rota: who is awake or on call, and when?"
    },
    {
      "id": "fire",
      "label": "Fire safety: the exits, the alarm, and a night-time walk-through?"
    },
    {
      "id": "privacy",
      "label": "Privacy for changing and washing?"
    }
  ],
  "holidayclub": [
    {
      "id": "registration",
      "label": "Registration, and signing every child in and out each day?"
    },
    {
      "id": "staffRota",
      "label": "The staffing rota across the days, keeping the ratio every day?"
    },
    {
      "id": "food",
      "label": "Food hygiene and allergies?"
    },
    {
      "id": "toilets",
      "label": "Toilets, and how children are supervised going to them?"
    }
  ],
  "offsite": [
    {
      "id": "siteRules",
      "label": "The site’s own rules and hazards?"
    },
    {
      "id": "water",
      "label": "Any water nearby, and how children are kept safe from it?"
    },
    {
      "id": "boundaries",
      "label": "The boundaries of the area, and how children know them?"
    }
  ],
  "adventurous": [
    {
      "id": "instructor",
      "label": "A qualified instructor or a licensed provider for each activity?"
    },
    {
      "id": "lifeguard",
      "label": "Lifeguard cover for any swimming or water activity?"
    },
    {
      "id": "equipment",
      "label": "Equipment checked, and fitted to each child?"
    }
  ]
};
const FLAGS = [
  {
    "id": "abroad",
    "label": "Overseas: the trip leaves the country"
  },
  {
    "id": "adventurous",
    "label": "Water, heights or other adventurous activities"
  },
  {
    "id": "under8",
    "label": "Children under 8 are going"
  }
];
/* the required questions for one event: the core, its kind's, the ticked flags', then the church's own and the host's */
function checklistFor(kind, flags, extra) {
  flags = flags || {};
  let out = CHECKLIST.core.slice();
  if (CHECKLIST[kind] && kind !== 'core') out = out.concat(CHECKLIST[kind]);
  FLAGS.forEach((f) => { if (flags[f.id] === true && CHECKLIST[f.id]) out = out.concat(CHECKLIST[f.id]); });
  return out.concat((extra || []).filter((q) => q && q.id && (q.q || q.label)).map((q) => ({ id: q.id, label: q.q || q.label })));
}
module.exports = { CHECKLIST, FLAGS, checklistFor };
