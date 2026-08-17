import ical from 'ical.js';

const ICS_PROPS = {
  summary: 'summary',
  description: 'description',
  location: 'location',
  url: 'url',
  status: 'status',
  class: 'class',
  priority: 'priority',
  transparency: 'transp',
  sequence: 'sequence',
  categories: 'categories',
  contacts: 'contact',
  resources: 'resources',
  uid: 'uid',
};

export function yamlToIcal(yamlObj) {
  const lines = [];

  function esc(v) { return String(v).replace(/[\n\r]/g, '\\n'); }

  lines.push('BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:' + esc(yamlObj.prodid || '-//Legion//Calendar//EN'),
    'CALSCALE:GREGORIAN');
  if (yamlObj.method) lines.push('METHOD:' + esc(yamlObj.method));
  if (yamlObj.timezone) lines.push('X-WR-TIMEZONE:' + esc(yamlObj.timezone));
  if (yamlObj.name) lines.push('X-WR-CALNAME:' + esc(yamlObj.name));
  if (yamlObj.description) lines.push('X-WR-CALDESC:' + esc(yamlObj.description));

  for (const ev of (yamlObj.events || [])) {
    lines.push('BEGIN:VEVENT');

    for (const [key, icsKey] of Object.entries(ICS_PROPS)) {
      const val = ev[key];
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          if (icsKey === 'categories') {
            lines.push(icsKey + ':' + val.join(','));
          } else {
            for (const item of val) lines.push(icsKey + ':' + esc(item));
          }
        } else {
          lines.push(icsKey + ':' + esc(val));
        }
      }
    }

    if (ev.start) {
      if (ev.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + ev.start.slice(0, 10).replace(/-/g, ''));
      } else {
        const dt = ev.start.replace(/[-:]/g, '').slice(0, 15);
        if (yamlObj.timezone) {
          lines.push('DTSTART;TZID=' + esc(yamlObj.timezone) + ':' + dt);
        } else {
          lines.push('DTSTART:' + dt);
        }
      }
    }
    if (ev.end) {
      if (ev.allDay) {
        lines.push('DTEND;VALUE=DATE:' + ev.end.slice(0, 10).replace(/-/g, ''));
      } else {
        const dt = ev.end.replace(/[-:]/g, '').slice(0, 15);
        if (yamlObj.timezone) {
          lines.push('DTEND;TZID=' + esc(yamlObj.timezone) + ':' + dt);
        } else {
          lines.push('DTEND:' + dt);
        }
      }
    }

    if (ev.recurrence) {
      lines.push('RRULE:' + buildRruleStr(ev.recurrence));
    }

    if (ev.exceptionDates && ev.exceptionDates.length > 0) {
      for (const ex of ev.exceptionDates) {
        lines.push('EXDATE;VALUE=DATE:' + ex.replace(/-/g, ''));
      }
    }

    if (ev.organizer) {
      let org = 'ORGANIZER';
      if (ev.organizer.name) org += ';CN=' + esc(ev.organizer.name);
      org += ':mailto:' + ev.organizer.email;
      lines.push(org);
    }

    if (ev.attendees) {
      for (const att of ev.attendees) {
        let a = 'ATTENDEE';
        if (att.name) a += ';CN=' + esc(att.name);
        if (att.role) a += ';ROLE=' + att.role;
        if (att.status) a += ';PARTSTAT=' + att.status;
        a += ':mailto:' + att.email;
        lines.push(a);
      }
    }

    if (ev.geo) {
      lines.push('GEO:' + ev.geo.lat + ';' + ev.geo.lon);
    }

    if (ev.created) lines.push('CREATED:' + toIcalDt(ev.created));
    if (ev.updated) lines.push('LAST-MODIFIED:' + toIcalDt(ev.updated));

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function icalToYaml(icsString) {
  const jcal = ical.parse(icsString);
  const comp = new ical.Component(jcal);

  const yamlObj = {
    name: comp.getFirstPropertyValue('x-wr-calname') || '',
    timezone: comp.getFirstPropertyValue('x-wr-timezone') || '',
    prodid: comp.getFirstPropertyValue('prodid') || '',
    events: [],
  };

  const vevents = comp.getAllSubcomponents('vevent');
  for (const vevent of vevents) {
    const ev = {};
    for (const [key, icsKey] of Object.entries(ICS_PROPS)) {
      if (icsKey === 'categories') {
        const val = vevent.getFirstPropertyValue(icsKey);
        if (val) ev[key] = String(val).split(',').map(s => s.trim());
      } else {
        const val = vevent.getFirstPropertyValue(icsKey);
        if (val !== null && val !== undefined) ev[key] = val;
      }
    }

    const dtstart = vevent.getFirstProperty('dtstart');
    const dtend = vevent.getFirstProperty('dtend');
    if (dtstart) {
      ev.start = parseDateValue(dtstart);
      ev.allDay = dtstart.type === 'date';
    }
    if (dtend) {
      ev.end = parseDateValue(dtend);
    }

    const rrule = vevent.getFirstProperty('rrule');
    if (rrule) {
      ev.recurrence = parseRrule(rrule);
    }

    const exdates = vevent.getAllProperties('exdate');
    if (exdates.length > 0) {
      ev.exceptionDates = exdates.map(ex => {
        const val = ex.getFirstValue();
        return typeof val === 'object' && val.toISOString
          ? val.toISOString().slice(0, 10)
          : String(val).slice(0, 10);
      });
    }

    const organizer = vevent.getFirstProperty('organizer');
    if (organizer) {
      ev.organizer = {
        name: organizer.getParameter('cn') || '',
        email: organizer.getFirstValue().replace(/^mailto:/i, ''),
      };
    }

    const attendees = vevent.getAllProperties('attendee');
    if (attendees.length > 0) {
      ev.attendees = attendees.map(att => ({
        email: att.getFirstValue().replace(/^mailto:/i, ''),
        name: att.getParameter('cn') || '',
        role: att.getParameter('role') || 'REQ-PARTICIPANT',
        status: att.getParameter('partstat') || 'NEEDS-ACTION',
      }));
    }

    const geo = vevent.getFirstProperty('geo');
    if (geo) {
      const parts = String(geo.getFirstValue()).split(';');
      ev.geo = { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
    }

    ev.created = vevent.getFirstPropertyValue('created') || '';
    ev.updated = vevent.getFirstPropertyValue('last-modified') || '';
    ev.sequence = vevent.getFirstPropertyValue('sequence') || 0;

    yamlObj.events.push(ev);
  }

  return yamlObj;
}

const COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60', '#8e44ad', '#f1c40f', '#d35400',
];

const categoryColorMap = {};

export function getColorForCategories(categories) {
  if (!categories || categories.length === 0) return '#3498db';
  const catColorMap = {
    'blue': '#3498db', 'red': '#e74c3c', 'green': '#2ecc71', 'orange': '#f39c12',
    'purple': '#9b59b6', 'cyan': '#1abc9c', 'gray': '#95a5a6',
    'meeting': '#3498db', 'holiday': '#e74c3c', 'informal': '#2ecc71',
  };
  return catColorMap[categories[0].toLowerCase()] || COLORS[0];
}

export function yamlToFullCalendarEvents(yamlObj) {
  return (yamlObj.events || []).map(ev => {
    const evt = {
      id: ev.uid || ('ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)),
      title: ev.summary || '(no title)',
      start: ev.start,
      end: ev.end,
      allDay: !!ev.allDay,
      backgroundColor: getColorForCategories(ev.categories),
      borderColor: getColorForCategories(ev.categories),
      extendedProps: {
        location: ev.location || '',
        description: ev.description || '',
        categories: ev.categories || [],
        status: ev.status || '',
        uid: ev.uid || '',
        actionLabel: ev.actionType === 'instruction'
          ? (ev.actionConfig?.instruction || '')
          : ev.actionType === 'command'
            ? (ev.actionConfig?.command || '')
            : '',
        actionEnabled: ev.enabled !== false,
      },
    };

    if (ev.recurrence) {
      evt.rrule = {
        freq: ev.recurrence.freq?.toLowerCase(),
        interval: ev.recurrence.interval || 1,
        dtstart: ev.start,
        until: ev.recurrence.until ? new Date(ev.recurrence.until) : undefined,
      };
      if (ev.recurrence.byDay) evt.rrule.byweekday = ev.recurrence.byDay.map(d => d.toLowerCase());
      if (ev.recurrence.byMonthDay) evt.rrule.bymonthday = ev.recurrence.byMonthDay;

      if (ev.start && ev.end) {
        const dur = new Date(ev.end) - new Date(ev.start);
        evt.duration = msToDuration(dur);
      }
    }

    if (ev.exceptionDates && ev.exceptionDates.length > 0) {
      const timePart = ev.start && ev.start.includes('T') ? ev.start.slice(10) : '';
      evt.exdate = timePart
        ? ev.exceptionDates.map(d => d + timePart)
        : ev.exceptionDates;
    }

    return evt;
  });
}

function msToDuration(ms) {
  const hours = ms / 3600000;
  return { hours };
}

function buildRruleStr(rrule) {
  const parts = [`FREQ=${rrule.freq}`];
  if (rrule.interval) parts.push(`INTERVAL=${rrule.interval}`);
  if (rrule.byDay) parts.push(`BYDAY=${rrule.byDay.join(',')}`);
  if (rrule.byMonthDay) parts.push(`BYMONTHDAY=${rrule.byMonthDay.join(',')}`);
  if (rrule.until) parts.push(`UNTIL=${rrule.until.replace(/[-:]/g, '')}`);
  if (rrule.count) parts.push(`COUNT=${rrule.count}`);
  return parts.join(';');
}

function toIcalDt(dateStr) {
  return dateStr.replace(/[-:]/g, '').replace(/\.\d{3}Z?$/, '') + 'Z';
}

function parseDateValue(prop) {
  const val = prop.getFirstValue();
  if (prop.type === 'date') {
    return val.toISOString().slice(0, 10);
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:${s}`;
  }
  return String(val);
}

function parseRrule(rruleProp) {
  const val = rruleProp.getFirstValue();
  if (!val) return null;
  const parts = val.toString().split(';');
  const rrule = {};
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const v = rest.join('=');
    switch (key) {
      case 'FREQ': rrule.freq = v; break;
      case 'INTERVAL': rrule.interval = parseInt(v, 10); break;
      case 'BYDAY': rrule.byDay = v.split(','); break;
      case 'BYMONTHDAY': rrule.byMonthDay = v.split(',').map(Number); break;
      case 'UNTIL': rrule.until = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8); break;
      case 'COUNT': rrule.count = parseInt(v, 10); break;
    }
  }
  return rrule;
}
