<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Calendar } from '@fullcalendar/core';
  import dayGridPlugin from '@fullcalendar/daygrid';
  import timeGridPlugin from '@fullcalendar/timegrid';
  import interactionPlugin from '@fullcalendar/interaction';
  import rrulePlugin from '@fullcalendar/rrule';
  import multimonthPlugin from '@fullcalendar/multimonth';
  import allLocales from '@fullcalendar/core/locales-all';
  import yaml from 'yaml';
  import { v4 as uuidv4 } from 'uuid';
  import { yamlToFullCalendarEvents, getColorForCategories, icalToYaml, yamlToIcal } from '../../libs/calendar-utils.js';
  import jaLocale from '@fullcalendar/core/locales/ja';
  import { t, getLocale } from '../../libs/i18n.js';

  const dispatch = createEventDispatcher();
  const API = (path) => `/api/knowledge/raw/${path}`;

  export let rawContent = '';
  export let filePath = '';

  let container;
  let calendarInstance = null;
  let parseError = '';
  let currentData = null;
  let dirty = false;
  let multiMode = false;
  let calendarSources = [];
  let loading = false;

  let showCreateModal = false;
  let showEditModal = false;
  let showAddModal = false;
  let addPath = '';
  let sourceDragOver = false;
  let fileInput;
  let fileDragOver = false;
  let importResult = '';

  const emptyCreateForm = () => ({
    title: '', location: '', category: '', description: '',
    startDate: '', startTime: '', endDate: '', endTime: '', allDay: false,
    recurrenceEnabled: false, recurrenceFreq: 'weekly',
    recurrenceInterval: 1, recurrenceByDay: [],
    recurrenceUntil: '', recurrenceCount: 10, recurrenceEndType: 'never',
    sourceIdx: 0,
    actionType: '', actionEnabled: true,
    actionInstruction: '', actionToPersona: '',
    actionCommand: '', actionWorkdir: '', actionUseBwrap: false, actionBwrapArgs: '',
    actionEnvEntries: emptyEnvEntries(), actionTriggerTime: '',
  });
  const emptyEditForm = () => ({
    title: '', location: '', category: '', description: '',
    startDate: '', startTime: '', endDate: '', endTime: '', allDay: false, uid: '',
    instanceDate: '',
    _parentStartDate: '', _parentStartTime: '', _parentEndDate: '', _parentEndTime: '',
    _instStartDate: '', _instStartTime: '', _instEndDate: '', _instEndTime: '',
    recurrenceEnabled: false, recurrenceFreq: 'weekly',
    recurrenceInterval: 1, recurrenceByDay: [],
    recurrenceUntil: '', recurrenceCount: 10, recurrenceEndType: 'never',
    editMode: 'all', isRecurring: false,
    _sourceFile: '', _sourceIdx: -1,
    actionType: '', actionEnabled: true,
    actionInstruction: '', actionToPersona: '',
    actionCommand: '', actionWorkdir: '', actionUseBwrap: false, actionBwrapArgs: '',
    actionEnvEntries: emptyEnvEntries(), actionTriggerTime: '',
  });
  let createForm = emptyCreateForm();
  let editForm = emptyEditForm();
  let selectedRange = null;

  let showViewModal = false;
  let viewForm = {};
  let pendingEdit = null;
  let showDeleteChoice = false;

  let tooltipVisible = false;
  let tooltipX = 0; let tooltipY = 0; let tooltipContent = '';

  const CATEGORY_COLORS = [
    { name: 'blue', label: t('blue'), color: '#3498db' },
    { name: 'red', label: t('red'), color: '#e74c3c' },
    { name: 'green', label: t('green'), color: '#2ecc71' },
    { name: 'orange', label: t('orange'), color: '#f39c12' },
    { name: 'purple', label: t('purple'), color: '#9b59b6' },
    { name: 'cyan', label: t('cyan'), color: '#1abc9c' },
    { name: 'gray', label: t('gray'), color: '#95a5a6' },
  ];

  const CALENDAR_DOTS = ['🔵','🔴','🟢','🟠','🟣','🟡','🟤','⚪','⚫','🔶','🔷','🔘','❤️','💜'];
  const WEEKDAYS = [
    { key: 'mo', label: t('month') }, { key: 'tu', label: t('tue') },
    { key: 'we', label: t('wed') }, { key: 'th', label: t('thu') },
    { key: 'fr', label: t('fri') }, { key: 'sa', label: t('sat') },
    { key: 'su', label: t('day') },
  ];

  const hoursList = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));
  const minsList = Array.from({length: 60}, (_, i) => String(i).padStart(2, '0'));

  function timePart(obj, field, idx, fb = '00') {
    const p = (obj[field] || '').split(':');
    return p[idx] || fb;
  }

  let _cSH = '09', _cSM = '00', _cEH = '10', _cEM = '00';
  let _eSH = '00', _eSM = '00', _eEH = '00', _eEM = '00';

  $: _cSH = timePart(createForm, 'startTime', 0);
  $: _cSM = timePart(createForm, 'startTime', 1);
  $: _cEH = timePart(createForm, 'endTime', 0, '10');
  $: _cEM = timePart(createForm, 'endTime', 1);
  $: _eSH = timePart(editForm, 'startTime', 0);
  $: _eSM = timePart(editForm, 'startTime', 1);
  $: _eEH = timePart(editForm, 'endTime', 0);
  $: _eEM = timePart(editForm, 'endTime', 1);

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function splitDate(iso) {
    if (!iso) return { date: '', time: '' };
    const i = iso.indexOf('T');
    return i === -1 ? { date: iso, time: '' } : { date: iso.slice(0, i), time: iso.slice(i + 1, i + 6) };
  }
  function joinDate(date, time) {
    return date ? (time ? `${date}T${time}:00` : date) : '';
  }

  function applyEditFormMode() {
    if (!editForm._parentStartDate) return;
    const u = editForm.editMode === 'single';
    editForm.startDate = u ? editForm._instStartDate : editForm._parentStartDate;
    editForm.startTime = u ? editForm._instStartTime : editForm._parentStartTime;
    editForm.endDate = u ? editForm._instEndDate : editForm._parentEndDate;
    editForm.endTime = u ? editForm._instEndTime : editForm._parentEndTime;
  }

  function markDirty() {
    dirty = true;
    dispatch('change', { value: yaml.stringify(currentData) });
  }

  function getUrlParams() {
    const p = new URLSearchParams(window.location.search);
    return { view: p.get('view') || 'dayGridMonth', date: p.get('date') || undefined };
  }
  let _popStateActive = false;

  function updateUrl(view, date) {
    if (_popStateActive) return;
    const url = new URL(window.location);
    url.searchParams.set('view', view); url.searchParams.set('date', date);
    const href = url.toString();
    if (href !== window.location.href) {
      window.history.pushState({ view, date }, '', url);
    }
  }

  function onPopState() {
    _popStateActive = true;
    if (calendarInstance) {
      calendarInstance.destroy();
      calendarInstance = null;
    }
    refreshCalendar();
    _popStateActive = false;
  }

  function buildRecurrenceObj(f) {
    if (!f.recurrenceEnabled) return undefined;
    const r = { freq: f.recurrenceFreq.toUpperCase(), interval: f.recurrenceInterval || 1 };
    if (f.recurrenceFreq === 'weekly' && f.recurrenceByDay.length > 0) r.byDay = f.recurrenceByDay.map(d => d.toUpperCase());
    if (f.recurrenceEndType === 'date' && f.recurrenceUntil) r.until = f.recurrenceUntil;
    if (f.recurrenceEndType === 'count' && f.recurrenceCount) r.count = f.recurrenceCount;
    return r;
  }
  function applyRecurrenceToForm(f, ev) {
    f.recurrenceEnabled = !!ev.recurrence;
    if (ev.recurrence) {
      f.recurrenceFreq = (ev.recurrence.freq || 'WEEKLY').toLowerCase();
      f.recurrenceInterval = ev.recurrence.interval || 1;
      f.recurrenceByDay = (ev.recurrence.byDay || []).map(d => d.toLowerCase());
      f.recurrenceUntil = ev.recurrence.until || '';
      f.recurrenceCount = ev.recurrence.count || 10;
      f.recurrenceEndType = ev.recurrence.until ? 'date' : ev.recurrence.count ? 'count' : 'never';
    }
  }

  function emptyEnvEntries() {
    return [{ key: '', value: '' }];
  }
  function addActionEnv(form) {
    form.actionEnvEntries = [...form.actionEnvEntries, { key: '', value: '' }];
  }
  function removeActionEnv(form, i) {
    form.actionEnvEntries = form.actionEnvEntries.filter((_, j) => j !== i);
    if (form.actionEnvEntries.length === 0) form.actionEnvEntries = emptyEnvEntries();
  }
  function applyActionToForm(f, ev) {
    f.actionType = ev.actionType || '';
    f.actionEnabled = ev.enabled !== false;
    f.actionInstruction = ev.actionConfig?.instruction || '';
    f.actionToPersona = ev.actionConfig?.toPersona || '';
    f.actionCommand = ev.actionConfig?.command || '';
    f.actionWorkdir = ev.actionConfig?.workdir || '';
    f.actionUseBwrap = !!ev.actionConfig?.useBwrap;
    f.actionBwrapArgs = Array.isArray(ev.actionConfig?.bwrapArgs)
      ? ev.actionConfig.bwrapArgs.join(' ')
      : (ev.actionConfig?.bwrapArgs || '');
    const env = ev.actionConfig?.env || {};
    f.actionEnvEntries = Object.keys(env).length > 0
      ? Object.entries(env).map(([k, v]) => ({ key: k, value: v }))
      : emptyEnvEntries();
    f.actionTriggerTime = ev.triggerTime || '';
  }
  function buildActionObj(form) {
    if (!form.actionType) return null;
    const ac = {};
    if (form.actionType === 'instruction') {
      const instruction = String(form.actionInstruction || '').trim();
      if (!instruction) return null;
      ac.instruction = instruction;
      const toPersona = String(form.actionToPersona || '').trim();
      if (toPersona) ac.toPersona = toPersona;
    } else {
      const command = String(form.actionCommand || '').trim();
      if (!command) return null;
      ac.command = command;
      const workdir = String(form.actionWorkdir || '').trim();
      if (workdir) ac.workdir = workdir;
      ac.useBwrap = !!form.actionUseBwrap;
      const args = String(form.actionBwrapArgs || '').split(/\s+/).filter(Boolean);
      if (args.length > 0) ac.bwrapArgs = args;
      const env = {};
      for (const e of form.actionEnvEntries || []) {
        const k = String(e?.key || '').trim();
        if (k) env[k] = e.value;
      }
      if (Object.keys(env).length > 0) ac.env = env;
    }
    return {
      actionType: form.actionType,
      actionConfig: ac,
      enabled: form.actionEnabled !== false,
      triggerTime: (form.allDay && form.actionTriggerTime) ? String(form.actionTriggerTime) : '',
    };
  }
  function applyActionToEvent(target, form) {
    const act = buildActionObj(form);
    if (act) {
      target.actionType = act.actionType;
      target.actionConfig = act.actionConfig;
      target.enabled = act.enabled;
      if (act.triggerTime) target.triggerTime = act.triggerTime;
      else delete target.triggerTime;
    } else {
      delete target.actionType;
      delete target.actionConfig;
      delete target.triggerTime;
      delete target.enabled;
    }
  }

  async function fetchRaw(path) {
    const r = await fetch(API(path), { credentials: 'include' });
    const d = await r.json();
    return yaml.parse(d.content || '') || { events: [] };
  }
  async function putRaw(path, content) {
    const r = await fetch(API(path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }), credentials: 'include',
    });
    if (!r.ok) throw new Error(`PUT ${path}: HTTP ${r.status}`);
  }

  function getSourceEvents() {
    if (!multiMode) return yamlToFullCalendarEvents(currentData || { events: [] });
    let all = [];
    for (const src of calendarSources) {
      if (!src.enabled) continue;
      const fcEvents = yamlToFullCalendarEvents({ events: src.data.events || [] });
      for (const e of fcEvents) {
        e.extendedProps = e.extendedProps || {};
        e.extendedProps._sourceFile = src.path;
        e.extendedProps._sourceDot = src.dot;
      }
      all = all.concat(fcEvents);
    }
    return all;
  }

  function getSourceIdxByUid(uid) {
    if (!multiMode) return -1;
    for (let i = 0; i < calendarSources.length; i++) {
      const ev = (calendarSources[i].data.events || []).find(e => e.uid === uid);
      if (ev) return i;
    }
    return -1;
  }

  function refreshCalendar() {
    if (!container) return;
    const prevView = calendarInstance?.view;
    const prevViewType = prevView?.type;
    const prevDate = calendarInstance?.getDate ? formatDate(calendarInstance.getDate()) : undefined;
    if (calendarInstance) { calendarInstance.destroy(); calendarInstance = null; }
    parseError = '';

    const allEvents = getSourceEvents();
    const urlParams = getUrlParams();

    const fcLocale = getLocale() === 'ja' ? jaLocale : undefined;
    calendarInstance = new Calendar(container, {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin, multimonthPlugin],
      events: allEvents,
      initialView: prevViewType || urlParams.view,
      initialDate: prevDate || urlParams.date,
      locale: fcLocale, firstDay: 1, height: 'auto',
      editable: true, selectable: true, unselectAuto: false, selectMirror: true,
      navLinks: true, weekNumbers: true, navLinkDayClick: 'timeGridDay',
      datesSet: () => {
        if (!calendarInstance) return;
        updateUrl(calendarInstance.view.type, formatDate(calendarInstance.getDate()));
      },
      headerToolbar: {
        left: 'prevYear,prev,today,next,nextYear',
        center: 'title',
        right: 'multiMonthYear,dayGridYear,dayGridMonth,timeGridWeek',
      },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      noEventsText: t('noEvents'),
      moreLinkText: (n) => t('moreEvents', n),
      buttonText: { today: t('today'), multiMonthYear: t('year'), dayGridYear: t('year'), month: t('month'), week: t('week') },

      eventDidMount: (info) => {
        const el = info.el; const ev = info.event;
        const bg = ev.backgroundColor || '#3498db';
        el.style.backgroundColor = bg; el.style.borderColor = ev.borderColor || bg; el.style.color = '#fff';
        const dot = ev.extendedProps?._sourceDot || '';
        if (dot) {
          const timeEl = el.querySelector('.fc-event-time');
          const titleEl = el.querySelector('.fc-event-title');
          const target = timeEl || titleEl;
          if (target) target.innerHTML = dot + ' ' + target.innerHTML;
        }
        const loc = ev.extendedProps?.location; const desc = ev.extendedProps?.description;
        let h = `<strong>${dot} ${ev.title}</strong>`;
        if (ev.extendedProps?._sourceFile) h += `<br><span class="tt-label">${t('source')}</span> ${ev.extendedProps._sourceFile}`;
        if (ev.start) {
          const d = ev.allDay ? ev.start.toLocaleDateString(navigator.language) : ev.start.toLocaleString(navigator.language);
          h += `<br><span class="tt-label">${t('dateTime')}</span> ${d}`;
        }
        if (ev.end) {
          const d = ev.allDay ? ev.end.toLocaleDateString(navigator.language) : ev.end.toLocaleString(navigator.language);
          h += `<br><span class="tt-label">${t('end')}</span> ${d}`;
        }
        if (loc) h += `<br><span class="tt-label">${t('location')}</span> ${loc}`;
        if (desc) h += `<br><span class="tt-label">${t('details')}</span> ${desc.replace(/\n/g, '<br>')}`;
        const actLabel = ev.extendedProps?.actionLabel;
        if (actLabel) h += `<br><span class="tt-label">⚡${t('action')}</span> ${actLabel.replace(/</g, '&lt;')}`;
        el.addEventListener('mouseenter', () => {
          tooltipContent = h; const r = el.getBoundingClientRect();
          tooltipX = r.left + r.width / 2; tooltipY = r.top - 8; tooltipVisible = true;
        });
        el.addEventListener('mouseleave', () => { tooltipVisible = false; });
      },

      eventClick: (info) => {
        info.jsEvent.preventDefault();
        const event = info.event;
        const uid = event.id || event.extendedProps?.uid || '';
        const srcFile = event.extendedProps?._sourceFile || '';

        let evData, srcIdx;
        if (multiMode && srcFile) {
          srcIdx = calendarSources.findIndex(s => s.path === srcFile);
          if (srcIdx < 0) return;
          evData = (calendarSources[srcIdx].data.events || []).find(e => e.uid === uid);
        } else {
          srcIdx = -1;
          evData = currentData?.events?.find(e => e.uid === uid);
        }
        if (!evData) return;

        const isRecurring = !!evData.recurrence;
        const f = emptyEditForm();
        f.uid = uid; f._sourceFile = srcFile; f._sourceIdx = srcIdx;

        const ps = splitDate(evData.start); const pe = splitDate(evData.end);
        f._parentStartDate = ps.date; f._parentStartTime = ps.time;
        f._parentEndDate = pe.date; f._parentEndTime = pe.time;

        if (isRecurring && event.start) {
          f.instanceDate = formatDate(event.start);
          f._instStartDate = formatDate(event.start); f._instStartTime = ps.time;
          if (evData.end) {
            const dur = new Date(evData.end) - new Date(evData.start);
            const ie = new Date(event.start.getTime() + dur);
            f._instEndDate = formatDate(ie); f._instEndTime = pe.time;
          } else { f._instEndDate = f._instStartDate; f._instEndTime = f._instStartTime; }
        } else {
          f.instanceDate = event.start ? formatDate(event.start) : '';
          f._instStartDate = ps.date; f._instStartTime = ps.time;
          f._instEndDate = pe.date; f._instEndTime = pe.time;
        }
        f.startDate = f._parentStartDate; f.startTime = f._parentStartTime;
        f.endDate = f._parentEndDate; f.endTime = f._parentEndTime;
        f.title = evData.summary || ''; f.location = evData.location || '';
        f.category = (evData.categories && evData.categories.length > 0) ? evData.categories[0] : '';
        f.description = evData.description || ''; f.allDay = !!evData.allDay;
        applyRecurrenceToForm(f, evData);
        applyActionToForm(f, evData);
        if (isRecurring) { f.editMode = 'all'; f.isRecurring = true; }
        pendingEdit = f;

        const catColor = getColorForCategories(evData.categories);
        const fmt = (iso, allDay) => {
          if (!iso) return '';
          const d = splitDate(iso);
          return allDay ? d.date : `${d.date} ${d.time}`;
        };
        const actionLabel = evData.actionType === 'instruction'
          ? (evData.actionConfig?.instruction || '')
          : evData.actionType === 'command'
            ? `$ ${evData.actionConfig?.command || ''}`
            : '';
        viewForm = {
          title: evData.summary || '(no title)',
          location: evData.location || '',
          startLabel: fmt(evData.start, evData.allDay),
          endLabel: fmt(evData.end, evData.allDay),
          categoryColor: catColor,
          categories: evData.categories || [],
          descriptionHtml: linkify(evData.description || ''),
          url: evData.url || '',
          organizerLabel: evData.organizer ? (evData.organizer.name || evData.organizer.email) : '',
          attendeeLabels: (evData.attendees || []).map(a => a.name || a.email),
          recurrenceLabel: describeRecurrence(evData.recurrence),
          actionLabel,
          actionEnabled: evData.enabled !== false,
        };
        showDeleteChoice = false;
        showViewModal = true;
      },

      customButtons: {},

      select: (info) => {
        selectedRange = { start: info.allDay ? info.startStr.slice(0, 10) : info.startStr, end: info.allDay ? info.endStr.slice(0, 10) : info.endStr, allDay: info.allDay };
        createForm = emptyCreateForm();
        const cs = splitDate(selectedRange.start); const ce = splitDate(selectedRange.end);
        createForm.startDate = cs.date; createForm.startTime = cs.time;
        createForm.endDate = ce.date; createForm.endTime = ce.time;
        createForm.allDay = selectedRange.allDay;
        showCreateModal = true;
      },

      eventDrop: (info) => {
        multiSaveByEvent(info.event, (evData) => {
          evData.start = info.event.startStr; evData.end = info.event.endStr || info.event.startStr;
          evData.allDay = info.event.allDay;
        }, () => info.revert());
      },

      eventResize: (info) => {
        multiSaveByEvent(info.event, (evData) => {
          evData.end = info.event.endStr || info.event.startStr;
        }, () => info.revert());
      },
    });

    calendarInstance.render();
  }

  function isRecurringEvent(info) {
    const uid = info.event.id || info.event.extendedProps?.uid || '';
    const srcFile = info.event.extendedProps?._sourceFile || '';
    if (multiMode && srcFile) {
      const src = calendarSources.find(s => s.path === srcFile);
      const ev = src?.data?.events?.find(e => e.uid === uid);
      return ev && ev.recurrence;
    }
    return currentData?.events?.find(e => e.uid === uid)?.recurrence;
  }

  async function multiSaveByEvent(fcEvent, modifyFn, revertFn) {
    const uid = fcEvent.id || fcEvent.extendedProps?.uid || '';
    const srcFile = fcEvent.extendedProps?._sourceFile || '';
    if (multiMode && srcFile) {
      const src = calendarSources.find(s => s.path === srcFile);
      const ev = src?.data?.events?.find(e => e.uid === uid);
      if (!ev) { if (revertFn) revertFn(); return; }
      if (ev.recurrence) { if (revertFn) revertFn(); alert(t('dragRecurringHint')); return; }
      modifyFn(ev);
      await putRaw(srcFile, yaml.stringify(src.data));
      await reloadMultiSources();
      refreshCalendar();
    } else {
      const ev = currentData?.events?.find(e => e.uid === uid);
      if (!ev) { if (revertFn) revertFn(); return; }
      if (ev.recurrence) { if (revertFn) revertFn(); alert(t('dragRecurringHint')); return; }
      modifyFn(ev);
      refreshCalendar(); markDirty();
    }
  }

  async function reloadMultiSources() {
    for (const src of calendarSources) {
      try { src.data = await fetchRaw(src.path); } catch { src.data = { events: [] }; }
    }
  }

  async function initCalendar() {
    if (!container) return;
    parseError = '';
    try {
      currentData = yaml.parse(rawContent || '') || { events: [] };
    } catch (e) { parseError = `YAML parse error: ${e.message}`; currentData = { events: [] }; return; }

    if (currentData.calendars) {
      multiMode = true;
      const dotColors = currentData.dotColors || {};
      calendarSources = currentData.calendars.map((path, i) => ({
        path, name: path.split('/').pop() || path,
        dot: dotColors[path] || CALENDAR_DOTS[i % CALENDAR_DOTS.length],
        enabled: true, data: { events: [] },
      }));
      loading = true;
      await reloadMultiSources();
      loading = false;
      refreshCalendar();
    } else {
      multiMode = false;
      calendarSources = [];
      if (!currentData.events) currentData.events = [];
      refreshCalendar();
    }
  }

  function createEvent() {
    if (!createForm.title.trim()) return;
    const uid = uuidv4() + '@legion';
    const categories = createForm.category ? [createForm.category] : [];
    const ev = {
      uid, summary: createForm.title.trim(),
      start: joinDate(createForm.startDate, createForm.allDay ? '' : _cSH + ':' + _cSM),
      end: joinDate(createForm.endDate, createForm.allDay ? '' : _cEH + ':' + _cEM),
      allDay: createForm.allDay,
      location: createForm.location.trim() || undefined,
      description: createForm.description.trim() || undefined,
      categories, status: 'CONFIRMED',
    };
    const rec = buildRecurrenceObj(createForm);
    if (rec) ev.recurrence = rec;
    applyActionToEvent(ev, createForm);

    (async () => {
      if (multiMode) {
        const src = calendarSources[createForm.sourceIdx];
        if (!src) return;
        src.data.events.push(ev);
        await putRaw(src.path, yaml.stringify(src.data));
        await reloadMultiSources();
        refreshCalendar();
      } else {
        currentData.events.push(ev);
        refreshCalendar(); markDirty();
      }
    })();
    closeCreateModal();
  }

  async function saveEdit() {
    if (!editForm.title.trim()) return;
    if (multiMode && editForm._sourceIdx >= 0) {
      const src = calendarSources[editForm._sourceIdx];
      const evData = src?.data?.events?.find(e => e.uid === editForm.uid);
      if (!evData) return;
      const isRecurring = !!evData.recurrence;
      if (isRecurring && editForm.editMode === 'single') {
        if (!evData.exceptionDates) evData.exceptionDates = [];
        const ed = editForm.instanceDate || editForm.startDate;
        if (!evData.exceptionDates.includes(ed)) evData.exceptionDates.push(ed);
        const uid = uuidv4() + '@legion';
        const categories = editForm.category ? [editForm.category] : [];
        const standalone = {
          uid, summary: editForm.title.trim(),
          start: joinDate(editForm.startDate, editForm.allDay ? '' : _eSH + ':' + _eSM),
          end: joinDate(editForm.endDate, editForm.allDay ? '' : _eEH + ':' + _eEM), allDay: editForm.allDay,
          location: editForm.location.trim() || undefined,
          description: editForm.description.trim() || undefined,
          categories, status: 'CONFIRMED',
          _parentUid: evData.uid, _exceptionDate: ed,
        };
        applyActionToEvent(standalone, editForm);
        src.data.events.push(standalone);
      } else {
        const categories = editForm.category ? [editForm.category] : [];
        Object.assign(evData, {
          summary: editForm.title.trim(),
          start: joinDate(editForm.startDate, editForm.allDay ? '' : _eSH + ':' + _eSM),
          end: joinDate(editForm.endDate, editForm.allDay ? '' : _eEH + ':' + _eEM), allDay: editForm.allDay,
          location: editForm.location.trim() || undefined,
          description: editForm.description.trim() || undefined,
          categories,
        });
        applyActionToEvent(evData, editForm);
        const rec = buildRecurrenceObj(editForm);
        if (rec) evData.recurrence = rec;
        else delete evData.recurrence;
      }
      await putRaw(src.path, yaml.stringify(src.data));
      await reloadMultiSources();
      refreshCalendar();
    } else {
      const evData = currentData?.events?.find(e => e.uid === editForm.uid);
      if (!evData) return;
      const isRecurring = !!evData.recurrence;
      if (isRecurring && editForm.editMode === 'single') {
        if (!evData.exceptionDates) evData.exceptionDates = [];
        const ed = editForm.instanceDate || editForm.startDate;
        if (!evData.exceptionDates.includes(ed)) evData.exceptionDates.push(ed);
        const uid = uuidv4() + '@legion';
        const categories = editForm.category ? [editForm.category] : [];
        const standalone = {
          uid, summary: editForm.title.trim(),
          start: joinDate(editForm.startDate, editForm.allDay ? '' : _eSH + ':' + _eSM),
          end: joinDate(editForm.endDate, editForm.allDay ? '' : _eEH + ':' + _eEM), allDay: editForm.allDay,
          location: editForm.location.trim() || undefined,
          description: editForm.description.trim() || undefined,
          categories, status: 'CONFIRMED',
          _parentUid: evData.uid, _exceptionDate: ed,
        };
        applyActionToEvent(standalone, editForm);
        currentData.events.push(standalone);
      } else {
        const categories = editForm.category ? [editForm.category] : [];
        Object.assign(evData, {
          summary: editForm.title.trim(),
          start: joinDate(editForm.startDate, editForm.allDay ? '' : _eSH + ':' + _eSM),
          end: joinDate(editForm.endDate, editForm.allDay ? '' : _eEH + ':' + _eEM), allDay: editForm.allDay,
          location: editForm.location.trim() || undefined,
          description: editForm.description.trim() || undefined,
          categories,
        });
        applyActionToEvent(evData, editForm);
        const rec = buildRecurrenceObj(editForm);
        if (rec) evData.recurrence = rec;
        else delete evData.recurrence;
      }
      refreshCalendar(); markDirty();
    }
    closeEditModal();
  }

  async function deleteEdit(skipConfirm) {
    if (!editForm.uid) return;
    if (!skipConfirm && !confirm(t('confirmDeleteEvent'))) return;

    if (multiMode && editForm._sourceIdx >= 0) {
      const src = calendarSources[editForm._sourceIdx];
      const evData = src?.data?.events?.find(e => e.uid === editForm.uid);
      if (!evData) return;
      if (evData._parentUid && evData._exceptionDate) {
        const parent = src.data.events.find(e => e.uid === evData._parentUid);
        if (parent && parent.exceptionDates) {
          parent.exceptionDates = parent.exceptionDates.filter(d => d !== evData._exceptionDate);
          if (parent.exceptionDates.length === 0) delete parent.exceptionDates;
        }
        const idx = src.data.events.indexOf(evData);
        if (idx > -1) src.data.events.splice(idx, 1);
      } else {
        const isRecurring = evData.recurrence;
        if (isRecurring && editForm.editMode === 'single') {
          const ed = editForm.instanceDate || editForm.startDate;
          if (!evData.exceptionDates) evData.exceptionDates = [];
          if (!evData.exceptionDates.includes(ed)) evData.exceptionDates.push(ed);
        } else {
          const idx = src.data.events.findIndex(e => e.uid === editForm.uid);
          if (idx > -1) src.data.events.splice(idx, 1);
        }
      }
      await putRaw(src.path, yaml.stringify(src.data));
      await reloadMultiSources();
      refreshCalendar();
    } else {
      const evData = currentData?.events?.find(e => e.uid === editForm.uid);
      if (!evData) return;
      if (evData._parentUid && evData._exceptionDate) {
        const parent = currentData.events.find(e => e.uid === evData._parentUid);
        if (parent && parent.exceptionDates) {
          parent.exceptionDates = parent.exceptionDates.filter(d => d !== evData._exceptionDate);
          if (parent.exceptionDates.length === 0) delete parent.exceptionDates;
        }
        const idx = currentData.events.indexOf(evData);
        if (idx > -1) currentData.events.splice(idx, 1);
      } else {
        const isRecurring = evData.recurrence;
        if (isRecurring && editForm.editMode === 'single') {
          const ed = editForm.instanceDate || editForm.startDate;
          if (!evData.exceptionDates) evData.exceptionDates = [];
          if (!evData.exceptionDates.includes(ed)) evData.exceptionDates.push(ed);
        } else {
          const idx = currentData.events.findIndex(e => e.uid === editForm.uid);
          if (idx > -1) currentData.events.splice(idx, 1);
        }
      }
      refreshCalendar(); markDirty();
    }
    closeEditModal();
  }

  function closeCreateModal() { showCreateModal = false; createForm = emptyCreateForm(); }
  function closeEditModal() { showEditModal = false; editForm = emptyEditForm(); }

  function toggleSource(i) { calendarSources[i].enabled = !calendarSources[i].enabled; calendarSources = calendarSources; refreshCalendar(); }
  function cycleDot(i) {
    const src = calendarSources[i];
    const idx = CALENDAR_DOTS.indexOf(src.dot);
    src.dot = CALENDAR_DOTS[(idx + 1) % CALENDAR_DOTS.length];
    calendarSources = calendarSources;
    if (!currentData.dotColors) currentData.dotColors = {};
    currentData.dotColors[src.path] = src.dot;
    putRaw(filePath, yaml.stringify(currentData));
    dispatch('change', { value: yaml.stringify(currentData) });
    refreshCalendar();
  }
  async function removeSource(i) {
    if (!confirm(t('confirmDeleteNamed', calendarSources[i].name))) return;
    calendarSources = calendarSources.filter((_, idx) => idx !== i);
    currentData.calendars = calendarSources.map(s => s.path);
    await putRaw(filePath, yaml.stringify(currentData));
    dispatch('change', { value: yaml.stringify(currentData) });
    refreshCalendar();
  }
  function handleIcsImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    readIcsFile(file);
    e.target.value = '';
  }

  function readIcsFile(file) {
    const reader = new FileReader();
    reader.onload = () => { importIcsEvents(reader.result); };
    reader.onerror = () => { importResult = t('loadFileFailed'); };
    reader.readAsText(file);
  }

  function importIcsEvents(icsText) {
    try {
      const imported = icalToYaml(icsText);
      const events = imported.events || [];
      if (events.length === 0) {
        importResult = t('noImportableEvents');
        return;
      }

      let added = 0;
      let skipped = 0;
      const existingUids = new Set((currentData.events || []).map(e => e.uid).filter(Boolean));

      for (const ev of events) {
        if (ev.uid && existingUids.has(ev.uid)) {
          skipped++;
          continue;
        }
        if (!ev.uid) ev.uid = uuidv4() + '@legion';
        currentData.events.push(ev);
        existingUids.add(ev.uid);
        added++;
      }

      if (added > 0) {
        refreshCalendar();
        markDirty();
        importResult = t('importedCount', events.length, added);
        if (skipped > 0) importResult += t('skippedUidConflict', skipped);
      } else {
        importResult = t('importedZeroAllConflict', skipped);
      }
      setTimeout(() => { importResult = ''; }, 5000);
    } catch (e) {
      importResult = t('icsParseError', e.message);
      setTimeout(() => { importResult = ''; }, 8000);
    }
  }

  function exportIcs() {
    const icsText = yamlToIcal(currentData || { events: [] });
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (filePath || 'calendar').split('/').pop().replace(/\.(ical|mycal)$/, '') || 'calendar';
    a.download = baseName + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function closeViewModal() { showViewModal = false; viewForm = {}; showDeleteChoice = false; }

  function linkify(text) {
    return (text || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function describeRecurrence(r) {
    if (!r) return '';
    const freqMap = { DAILY: t('day'), WEEKLY: t('week'), MONTHLY: t('month'), YEARLY: t('year') };
    const freq = freqMap[r.freq] || r.freq;
    let s = t('everyFreq', freq);
    if (r.interval && r.interval > 1) s = `${r.interval}${s}`;
    if (r.byDay) s += `（${r.byDay.join(', ')}）`;
    if (r.until) s += ` ～${r.until}`;
    if (r.count) s += t('countTimes', r.count);
    return s;
  }

  function openEditFromView() {
    if (pendingEdit) {
      editForm = pendingEdit;
      applyEditFormMode();
      showDeleteChoice = false;
      showViewModal = false;
      showEditModal = true;
    }
  }

  async function deleteFromView() {
    if (!pendingEdit || !pendingEdit.uid) return;

    if (pendingEdit.isRecurring) {
      showDeleteChoice = true;
      return;
    }

    if (!confirm(t('confirmDeleteEvent'))) return;
    editForm = pendingEdit;
    await deleteEdit(true);
    closeViewModal();
  }

  async function confirmDeleteChoice(mode) {
    if (!confirm(t('confirmDeleteEvent'))) {
      showDeleteChoice = false;
      return;
    }
    pendingEdit.editMode = mode;
    editForm = pendingEdit;
    await deleteEdit(true);
    closeViewModal();
  }

  function addSource() {
    addPath = '';
    showAddModal = true;
  }
  async function confirmAdd() {
    const p = addPath.trim();
    if (!p) return;
    calendarSources = [...calendarSources, {
      path: p, name: p.split('/').pop() || p,
      dot: CALENDAR_DOTS[calendarSources.length % CALENDAR_DOTS.length],
      enabled: true, data: { events: [] },
    }];
    const idx = calendarSources.length - 1;
    currentData.calendars = calendarSources.map(s => s.path);
    showAddModal = false;
    try { calendarSources[idx].data = await fetchRaw(p); } catch { calendarSources[idx].data = { events: [] }; }
    await putRaw(filePath, yaml.stringify(currentData));
    dispatch('change', { value: yaml.stringify(currentData) });
    refreshCalendar();
  }

  onMount(() => {
    initCalendar();
    window.addEventListener('popstate', onPopState);
  });
  onDestroy(() => {
    window.removeEventListener('popstate', onPopState);
    if (calendarInstance) { calendarInstance.destroy(); calendarInstance = null; }
  });
</script>

<div class="calendar-viewer-root" class:file-drag-over={fileDragOver}
  ondragover={(e) => { if (e.dataTransfer.files?.length > 0) { e.preventDefault(); fileDragOver = true; } }}
  ondragleave={() => { fileDragOver = false; }}
  ondrop={(e) => { e.preventDefault(); fileDragOver = false; const f = e.dataTransfer.files?.[0]; if (f && /\.ics$/i.test(f.name)) readIcsFile(f); }}>
  {#if parseError}<div class="calendar-error">{parseError}</div>{/if}
  {#if multiMode}
    <div class="source-bar" class:drag-over={sourceDragOver}
      ondragover={(e) => { e.preventDefault(); sourceDragOver = true; }}
      ondragleave={() => { sourceDragOver = false; }}
      ondrop={(e) => {
        sourceDragOver = false; e.preventDefault();
      const p = e.dataTransfer.getData('text/plain');
      if (p && /\.ical$/i.test(p) && !calendarSources.some(s => s.path === p)) {
        calendarSources = [...calendarSources, {
          path: p, name: p.split('/').pop() || p,
          dot: CALENDAR_DOTS[calendarSources.length % CALENDAR_DOTS.length],
          enabled: true, data: { events: [] },
        }];
        const idx = calendarSources.length - 1;
        currentData.calendars = calendarSources.map(s => s.path);
        (async () => {
          try { calendarSources[idx].data = await fetchRaw(p); } catch { calendarSources[idx].data = { events: [] }; }
          await putRaw(filePath, yaml.stringify(currentData));
          dispatch('change', { value: yaml.stringify(currentData) });
          refreshCalendar();
        })();
      }
    }}>
      {#each calendarSources as src, i}
        <span class="source-item">
          <input type="checkbox" checked={src.enabled} onchange={() => toggleSource(i)} />
           <span class="source-dot" onclick={() => cycleDot(i)} title={t('clickToChangeColor')}>{src.dot}</span>
          <span class="source-name">{src.name}</span>
           <button class="source-del" onclick={() => removeSource(i)} title={t('delete')}>✕</button>
        </span>
      {/each}
      <button class="btn btn-sm btn-outline-secondary" onclick={addSource}>{t('addItem')}</button>
    </div>
  {/if}
  {#if !multiMode}
    <div class="import-toolbar">
      <input type="file" accept=".ics" bind:this={fileInput} onchange={handleIcsImport} style="display:none" />
      <button class="btn btn-sm btn-outline-secondary" onclick={() => fileInput?.click()}>{t('importIcs')}</button>
      <button class="btn btn-sm btn-outline-secondary" onclick={exportIcs}>{t('exportIcs')}</button>
      {#if importResult}
        <span class="import-result">{importResult}</span>
      {/if}
    </div>
  {/if}
  {#if loading}<div class="text-muted" style="padding:12px">{t('loading')}</div>{/if}
  <div bind:this={container} class="calendar-container"></div>
</div>

{#if tooltipVisible}
  <div class="fc-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;">
    {@html tooltipContent}
    <div class="fc-tooltip-arrow"></div>
  </div>
{/if}

{#if showAddModal}
  <div class="modal-overlay" onclick={() => showAddModal = false}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">{t('addCalendar')}</div>
      <div class="modal-body">
        <div class="form-group">
          <label>{t('calendarFilePath')}</label>
          <input class="form-control" placeholder={t('calendarFileExample')} bind:value={addPath}
            onkeydown={(e) => e.key === 'Enter' && confirmAdd()} autofocus />
          <div class="text-muted small" style="margin-top:4px">{t('absolutePathHint')}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick={() => showAddModal = false}>{t('cancel')}</button>
        <button class="btn btn-sm btn-primary" onclick={confirmAdd} disabled={!addPath.trim()}>{t('add')}</button>
      </div>
    </div>
  </div>
{/if}

{#if showCreateModal}
  <div class="modal-overlay" onclick={closeCreateModal}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">{t('newEvent')}</div>
      <div class="modal-body">
        {#if multiMode}
          <div class="form-group">
            <label>{t('saveTo')}</label>
            <select class="form-control" bind:value={createForm.sourceIdx}>
      {#each calendarSources as src, i (src.path)}
                <option value={i}>{src.dot} {src.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        <div class="form-group">
          <label>{t('subject')}</label>
          <input class="form-control" bind:value={createForm.title} onkeydown={(e) => e.key === 'Enter' && createEvent()} autofocus />
        </div>
        <div class="form-group">
          <label>{t('location')}</label>
          <input class="form-control" bind:value={createForm.location} />
        </div>
        <div class="form-group">
          <label>{t('color')}</label>
          <div class="color-picker">
            {#each CATEGORY_COLORS as c}
              <button class="color-swatch" class:selected={createForm.category === c.name}
                style="background:{c.color};width:28px;height:28px;border-radius:50%;border:2px solid {createForm.category === c.name ? '#333' : 'transparent'}"
                onclick={() => createForm.category = c.name} title={c.label}></button>
            {/each}
            <button class="color-swatch" class:selected={!createForm.category}
              style="width:28px;height:28px;border-radius:50%;border:2px solid {!createForm.category ? '#333' : '#ccc'};background:linear-gradient(45deg,#3498db,#e74c3c,#2ecc71)"
              onclick={() => createForm.category = ''} title={t('auto')}></button>
          </div>
        </div>
        <div class="form-group">
          <label>{t('dateTime')}</label>
          <div class="form-datetime">
            <input class="form-control form-control-sm" type="date" bind:value={createForm.startDate} style="width:auto;display:inline" />
            {#if !createForm.allDay}
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_cSH}>
                {#each hoursList as h}
                  <option value={h}>{h}</option>
                {/each}
              </select>
              <span class="time-colon">:</span>
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_cSM}>
                {#each minsList as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            {/if}
            <span> ～ </span>
            <input class="form-control form-control-sm" type="date" bind:value={createForm.endDate} style="width:auto;display:inline" />
            {#if !createForm.allDay}
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_cEH}>
                {#each hoursList as h}
                  <option value={h}>{h}</option>
                {/each}
              </select>
              <span class="time-colon">:</span>
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_cEM}>
                {#each minsList as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            {/if}
            <label style="display:inline-flex;align-items:center;gap:4px;margin-left:8px">
              <input type="checkbox" bind:checked={createForm.allDay} onchange={() => { if (createForm.allDay) { createForm.startTime = ''; createForm.endTime = ''; } }} /> {t('allDay')}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label><input type="checkbox" bind:checked={createForm.recurrenceEnabled} /> {t('repeat')}</label>
          {#if createForm.recurrenceEnabled}
            <div class="recur-config">
              <div class="recur-row">
                <span>{t('every')}</span>
                <input class="form-control form-control-sm" type="number" min="1" bind:value={createForm.recurrenceInterval} style="width:60px;display:inline" />
                <select class="form-control form-control-sm" bind:value={createForm.recurrenceFreq} style="width:auto;display:inline">
                <option value="daily">{t('day')}</option><option value="weekly">{t('week')}</option><option value="monthly">{t('month')}</option><option value="yearly">{t('year')}</option>
              </select>
            </div>
            {#if createForm.recurrenceFreq === 'weekly'}
                <div class="recur-row recur-days">
                  {#each WEEKDAYS as wd}
                    <button class="wd-btn" class:selected={createForm.recurrenceByDay.includes(wd.key)}
                      onclick={() => { const a = createForm.recurrenceByDay; if (a.includes(wd.key)) createForm.recurrenceByDay = a.filter(x => x !== wd.key); else createForm.recurrenceByDay = [...a, wd.key]; }}>{wd.label}</button>
                  {/each}
                </div>
              {/if}
              <div class="recur-row">
                <label>{t('end')}</label>
                <select class="form-control form-control-sm" bind:value={createForm.recurrenceEndType} style="width:auto;display:inline">
                  <option value="never">{t('none')}</option><option value="date">{t('byDate')}</option><option value="count">{t('afterNTimes')}</option>
                </select>
                {#if createForm.recurrenceEndType === 'date'}
                  <input class="form-control form-control-sm" type="date" bind:value={createForm.recurrenceUntil} style="width:auto;display:inline" />
                {/if}
                {#if createForm.recurrenceEndType === 'count'}
                  <input class="form-control form-control-sm" type="number" min="1" bind:value={createForm.recurrenceCount} style="width:80px;display:inline" /> {t('times')}
                {/if}
              </div>
            </div>
          {/if}
        </div>
        <div class="form-group">
          <label>{t('details')}</label>
          <textarea class="form-control" rows="3" bind:value={createForm.description}></textarea>
        </div>
        <div class="form-group">
          <label>{t('actionTypeLabel')}</label>
          <select class="form-control" bind:value={createForm.actionType}>
            <option value="">{t('actionNone')}</option>
            <option value="instruction">{t('actionInstruction')}</option>
            <option value="command">{t('actionCommand')}</option>
          </select>
        </div>
        {#if createForm.actionType}
          <div class="form-group action-config">
            <label><input type="checkbox" bind:checked={createForm.actionEnabled} /> {t('actionEnabled')}</label>
            {#if createForm.allDay}
              <div class="recur-row">
                <span class="small-label">{t('actionTriggerTime')}</span>
                <input class="form-control form-control-sm" type="time" style="width:auto;display:inline" bind:value={createForm.actionTriggerTime} />
              </div>
            {/if}
            {#if createForm.actionType === 'instruction'}
              <textarea class="form-control" rows="2" placeholder={t('actionInstruction')} bind:value={createForm.actionInstruction}></textarea>
              <input class="form-control" style="margin-top:6px" placeholder={t('actionSendTo')} bind:value={createForm.actionToPersona} />
            {:else}
              <input class="form-control" placeholder={t('actionCommand')} bind:value={createForm.actionCommand} />
              <div class="recur-row" style="margin-top:6px">
                <input class="form-control form-control-sm" style="flex:1;width:auto;display:inline" placeholder={t('actionWorkdir')} bind:value={createForm.actionWorkdir} />
                <label style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" bind:checked={createForm.actionUseBwrap} /> bwrap</label>
              </div>
              <input class="form-control form-control-sm" style="margin-top:6px" placeholder="bwrap args" bind:value={createForm.actionBwrapArgs} />
              {#each createForm.actionEnvEntries as entry, i}
                <div class="recur-row">
                  <input class="form-control form-control-sm" style="flex:1;width:auto" placeholder="KEY" bind:value={entry.key} />
                  <input class="form-control form-control-sm" style="flex:1;width:auto" placeholder="VALUE" bind:value={entry.value} />
                  <button class="btn btn-sm btn-outline-danger" onclick={() => removeActionEnv(createForm, i)}>✕</button>
                </div>
              {/each}
              <button class="btn btn-sm btn-outline-secondary" onclick={() => addActionEnv(createForm)}>+ env</button>
            {/if}
            <div class="text-muted action-hint">{t('actionVariablesHint')}</div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick={closeCreateModal}>{t('cancel')}</button>
        <button class="btn btn-sm btn-primary" onclick={createEvent} disabled={!createForm.title.trim()}>{t('create')}</button>
      </div>
    </div>
  </div>
{/if}

{#if showEditModal}
  <div class="modal-overlay" onclick={closeEditModal}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">{t('editEvent')}</div>
      <div class="modal-body">
        {#if editForm.isRecurring}
          <div class="edit-mode-select">
            <label class="edit-mode-radio"><input type="radio" name="editMode" value="all" bind:group={editForm.editMode} onchange={applyEditFormMode} /> {t('allEvents')}</label>
            <label class="edit-mode-radio"><input type="radio" name="editMode" value="single" bind:group={editForm.editMode} onchange={applyEditFormMode} /> {t('thisEventOnly')}</label>
          </div>
        {/if}
        <div class="form-group">
          <label>{t('subject')}</label>
          <input class="form-control" bind:value={editForm.title} onkeydown={(e) => e.key === 'Enter' && saveEdit()} autofocus />
        </div>
        <div class="form-group">
          <label>{t('location')}</label>
          <input class="form-control" bind:value={editForm.location} />
        </div>
        <div class="form-group">
          <label>{t('color')}</label>
          <div class="color-picker">
            {#each CATEGORY_COLORS as c}
              <button class="color-swatch" class:selected={editForm.category === c.name}
                style="background:{c.color};width:28px;height:28px;border-radius:50%;border:2px solid {editForm.category === c.name ? '#333' : 'transparent'}"
                onclick={() => editForm.category = c.name} title={c.label}></button>
            {/each}
            <button class="color-swatch" class:selected={!editForm.category}
              style="width:28px;height:28px;border-radius:50%;border:2px solid {!editForm.category ? '#333' : '#ccc'};background:linear-gradient(45deg,#3498db,#e74c3c,#2ecc71)"
              onclick={() => editForm.category = ''} title={t('auto')}></button>
          </div>
        </div>
        <div class="form-group">
          <label>{t('dateTime')}</label>
          <div class="form-datetime">
            <input class="form-control form-control-sm" type="date" bind:value={editForm.startDate} style="width:auto;display:inline" />
            {#if !editForm.allDay}
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_eSH}>
                {#each hoursList as h}
                  <option value={h}>{h}</option>
                {/each}
              </select>
              <span class="time-colon">:</span>
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_eSM}>
                {#each minsList as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            {/if}
            <span> ～ </span>
            <input class="form-control form-control-sm" type="date" bind:value={editForm.endDate} style="width:auto;display:inline" />
            {#if !editForm.allDay}
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_eEH}>
                {#each hoursList as h}
                  <option value={h}>{h}</option>
                {/each}
              </select>
              <span class="time-colon">:</span>
              <select class="form-control form-control-sm" style="width:auto;display:inline" bind:value={_eEM}>
                {#each minsList as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            {/if}
            <label style="display:inline-flex;align-items:center;gap:4px;margin-left:8px">
              <input type="checkbox" bind:checked={editForm.allDay} onchange={() => { if (editForm.allDay) { editForm.startTime = ''; editForm.endTime = ''; } }} /> {t('allDay')}
            </label>
          </div>
        </div>
        {#if editForm.isRecurring}
          <div class="form-group">
            <label><input type="checkbox" bind:checked={editForm.recurrenceEnabled} disabled={editForm.editMode === 'single'} /> {t('repeat')}</label>
            {#if editForm.recurrenceEnabled}
              <div class="recur-config">
                <div class="recur-row">
                  <span>{t('every')}</span>
                  <input class="form-control form-control-sm" type="number" min="1" bind:value={editForm.recurrenceInterval} disabled={editForm.editMode === 'single'} style="width:60px;display:inline" />
                  <select class="form-control form-control-sm" bind:value={editForm.recurrenceFreq} disabled={editForm.editMode === 'single'} style="width:auto;display:inline">
                    <option value="daily">{t('day')}</option><option value="weekly">{t('week')}</option><option value="monthly">{t('month')}</option><option value="yearly">{t('year')}</option>
                  </select>
                </div>
                {#if editForm.recurrenceFreq === 'weekly'}
                  <div class="recur-row recur-days">
                    {#each WEEKDAYS as wd}
                      <button class="wd-btn" class:selected={editForm.recurrenceByDay.includes(wd.key)}
                        onclick={() => { if (editForm.editMode === 'single') return; const a = editForm.recurrenceByDay; if (a.includes(wd.key)) editForm.recurrenceByDay = a.filter(x => x !== wd.key); else editForm.recurrenceByDay = [...a, wd.key]; }}>{wd.label}</button>
                    {/each}
                  </div>
                {/if}
                <div class="recur-row">
                  <label>{t('end')}</label>
                  <select class="form-control form-control-sm" bind:value={editForm.recurrenceEndType} disabled={editForm.editMode === 'single'} style="width:auto;display:inline">
                    <option value="never">{t('none')}</option><option value="date">{t('byDate')}</option><option value="count">{t('afterNTimes')}</option>
                  </select>
                  {#if editForm.recurrenceEndType === 'date'}
                    <input class="form-control form-control-sm" type="date" bind:value={editForm.recurrenceUntil} disabled={editForm.editMode === 'single'} style="width:auto;display:inline" />
                  {/if}
                  {#if editForm.recurrenceEndType === 'count'}
                    <input class="form-control form-control-sm" type="number" min="1" bind:value={editForm.recurrenceCount} disabled={editForm.editMode === 'single'} style="width:80px;display:inline" /> {t('times')}
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}
        <div class="form-group">
          <label>{t('details')}</label>
          <textarea class="form-control" rows="3" bind:value={editForm.description}></textarea>
        </div>
        <div class="form-group">
          <label>{t('actionTypeLabel')}</label>
          <select class="form-control" bind:value={editForm.actionType}>
            <option value="">{t('actionNone')}</option>
            <option value="instruction">{t('actionInstruction')}</option>
            <option value="command">{t('actionCommand')}</option>
          </select>
        </div>
        {#if editForm.actionType}
          <div class="form-group action-config">
            <label><input type="checkbox" bind:checked={editForm.actionEnabled} /> {t('actionEnabled')}</label>
            {#if editForm.allDay}
              <div class="recur-row">
                <span class="small-label">{t('actionTriggerTime')}</span>
                <input class="form-control form-control-sm" type="time" style="width:auto;display:inline" bind:value={editForm.actionTriggerTime} />
              </div>
            {/if}
            {#if editForm.actionType === 'instruction'}
              <textarea class="form-control" rows="2" placeholder={t('actionInstruction')} bind:value={editForm.actionInstruction}></textarea>
              <input class="form-control" style="margin-top:6px" placeholder={t('actionSendTo')} bind:value={editForm.actionToPersona} />
            {:else}
              <input class="form-control" placeholder={t('actionCommand')} bind:value={editForm.actionCommand} />
              <div class="recur-row" style="margin-top:6px">
                <input class="form-control form-control-sm" style="flex:1;width:auto;display:inline" placeholder={t('actionWorkdir')} bind:value={editForm.actionWorkdir} />
                <label style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" bind:checked={editForm.actionUseBwrap} /> bwrap</label>
              </div>
              <input class="form-control form-control-sm" style="margin-top:6px" placeholder="bwrap args" bind:value={editForm.actionBwrapArgs} />
              {#each editForm.actionEnvEntries as entry, i}
                <div class="recur-row">
                  <input class="form-control form-control-sm" style="flex:1;width:auto" placeholder="KEY" bind:value={entry.key} />
                  <input class="form-control form-control-sm" style="flex:1;width:auto" placeholder="VALUE" bind:value={entry.value} />
                  <button class="btn btn-sm btn-outline-danger" onclick={() => removeActionEnv(editForm, i)}>✕</button>
                </div>
              {/each}
              <button class="btn btn-sm btn-outline-secondary" onclick={() => addActionEnv(editForm)}>+ env</button>
            {/if}
            <div class="text-muted action-hint">{t('actionVariablesHint')}</div>
          </div>
        {/if}
        <hr>
        <button class="btn btn-sm btn-outline-danger" onclick={deleteEdit}>{t('deleteThisEvent')}</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick={closeEditModal}>{t('cancel')}</button>
        <button class="btn btn-sm btn-primary" onclick={saveEdit} disabled={!editForm.title.trim()}>{t('save')}</button>
      </div>
    </div>
  </div>
{/if}

{#if showViewModal}
  <div class="modal-overlay" onclick={closeViewModal}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:{viewForm.categoryColor}"></span>
          {viewForm.title}
        </span>
      </div>
      <div class="modal-body">
        {#if viewForm.location}
          <div class="view-row"><span class="view-icon">📍</span> {viewForm.location}</div>
        {/if}
        <div class="view-row"><span class="view-icon">📅</span> {viewForm.startLabel}{#if viewForm.endLabel} ～ {viewForm.endLabel}{/if}</div>
        {#if viewForm.recurrenceLabel}
          <div class="view-row"><span class="view-icon">🔄</span> {viewForm.recurrenceLabel}</div>
        {/if}
        {#if viewForm.organizerLabel}
          <div class="view-row"><span class="view-icon">👤</span> {viewForm.organizerLabel}</div>
        {/if}
        {#if viewForm.attendeeLabels.length > 0}
          <div class="view-row"><span class="view-icon">👥</span> {viewForm.attendeeLabels.join(', ')}</div>
        {/if}
        {#if viewForm.url}
          <div class="view-row"><span class="view-icon">🔗</span> <a href={viewForm.url} target="_blank" rel="noopener noreferrer">{viewForm.url}</a></div>
        {/if}
        {#if viewForm.categories.length > 0}
          <div class="view-row"><span class="view-icon">🏷️</span> {viewForm.categories.join(', ')}</div>
        {/if}
        {#if viewForm.actionLabel}
          <div class="view-row"><span class="view-icon">⚡</span> <code class="action-code">{viewForm.actionLabel}</code>{#if !viewForm.actionEnabled}<span class="text-muted"> ({t('disabled')})</span>{/if}</div>
        {/if}
        {#if viewForm.descriptionHtml}
          <div class="view-desc">{@html viewForm.descriptionHtml}</div>
        {/if}
      </div>
      <div class="modal-footer">
        {#if showDeleteChoice}
          <button class="btn btn-sm btn-outline-secondary" onclick={() => showDeleteChoice = false}>{t('cancel')}</button>
          <button class="btn btn-sm btn-danger" onclick={() => confirmDeleteChoice('single')} style="margin-left:auto">{t('deleteThisEventOnly')}</button>
          <button class="btn btn-sm btn-danger" onclick={() => confirmDeleteChoice('all')}>{t('deleteAllEvents')}</button>
        {:else}
          <button class="btn btn-sm btn-outline-danger" onclick={deleteFromView} style="margin-right:auto">{t('delete')}</button>
          <button class="btn btn-sm btn-outline-secondary" onclick={closeViewModal}>{t('close')}</button>
          <button class="btn btn-sm btn-primary" onclick={openEditFromView}>{t('edit')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .calendar-viewer-root { height:100%; min-height:400px; }
  .calendar-container { width:100%; height:100%; padding:8px; }
  .calendar-container :global(.fc) { font-size:.85rem; }
  .calendar-container :global(.fc-toolbar-title) { font-size:1.1rem; }
  .calendar-error { padding:12px; color:#721c24; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px; margin:8px; font-size:.85rem; white-space:pre-wrap; }
  .source-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:6px 12px; border-bottom:1px solid #eee; background:#fafafa; transition:background .15s; }
  .source-bar.drag-over { background:#e8f4fd; outline:2px dashed #3498db; outline-offset:-2px; }
  .source-item { display:inline-flex; align-items:center; gap:4px; font-size:.8rem; cursor:pointer; padding:2px 6px; border-radius:4px; }
  .source-item:hover { background:#f0f0f0; }
  .source-dot { font-size:1rem; line-height:1; }
  .source-name { max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .source-del { background:none; border:none; cursor:pointer; font-size:.8rem; color:#999; padding:0 2px; }
  .source-del:hover { color:#e53e3e; }
  .form-group { margin-bottom:12px; }
  .form-group label { display:block; font-size:.85rem; font-weight:600; color:#555; margin-bottom:4px; }
  .form-datetime { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
  .color-picker { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .color-swatch { padding:0; }
  .color-swatch.selected { transform:scale(1.15); box-shadow:0 0 0 2px #fff,0 0 0 4px #333; }
  .recur-config { margin-top:8px; padding-left:8px; border-left:2px solid #ddd; }
  .recur-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
  .recur-days { gap:3px; }
  .action-config { padding-left:8px; border-left:2px solid #3498db; }
  .action-hint { font-size:.75rem; margin-top:6px; word-break:break-all; }
  .action-code { background:#f5f5f5; padding:1px 5px; border-radius:3px; font-size:.8rem; word-break:break-all; white-space:pre-wrap; }
  .small-label { font-size:.85rem; color:#555; }
  .wd-btn { width:32px; height:32px; border-radius:50%; border:1px solid #ccc; background:#f8f8f8; cursor:pointer; font-size:.8rem; display:flex; align-items:center; justify-content:center; }
  .wd-btn.selected { background:#3498db; color:#fff; border-color:#3498db; }
  .fc-tooltip { position:fixed; z-index:99999; background:#333; color:#fff; font-size:.78rem; line-height:1.5; padding:8px 12px; border-radius:6px; transform:translate(-50%,-100%); pointer-events:none; max-width:360px; white-space:normal; box-shadow:0 2px 8px rgba(0,0,0,.3); }
  .fc-tooltip :global(.tt-label) { color:#aaa; }
  .fc-tooltip-arrow { position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); width:0;height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:6px solid #333; }
  .edit-mode-select { display:flex; gap:12px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee; }
  .edit-mode-radio { display:flex; align-items:center; gap:4px; font-size:.85rem; cursor:pointer; }
  .import-toolbar { display:flex; align-items:center; gap:8px; padding:4px 12px; background:#fafafa; border-bottom:1px solid #eee; font-size:.82rem; }
  .import-result { color:#27ae60; font-size:.8rem; }
  .import-result:empty { display:none; }
  .calendar-viewer-root.file-drag-over { outline:3px dashed #27ae60; outline-offset:-3px; }
  .view-row { margin-bottom:8px; font-size:.85rem; display:flex; align-items:flex-start; gap:6px; line-height:1.5; }
  .view-icon { flex-shrink:0; width:16px; text-align:center; }
  .view-desc { margin-top:10px; padding-top:10px; border-top:1px solid #eee; font-size:.85rem; line-height:1.7; white-space:pre-wrap; word-break:break-all; }
  .view-desc a { color:#3498db; text-decoration:underline; }
  .time-colon { font-size:.85rem; margin:0 1px; }
</style>
