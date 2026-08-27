import { useEffect, useMemo, useRef, useState } from 'react';
import './calendar-error.css';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const holidayTypeLabels = {
  regular:'Regular holiday',
  special_non_working:'Special non-working',
  company:'Company holiday',
  other:'Other holiday'
};
const eventTypeLabels = {
  company_event:'Company event',
  meeting:'Meeting',
  training:'Training',
  celebration:'Celebration',
  other:'Other event'
};

function localDateValue(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateValue, days) {
  const value = new Date(`${dateValue}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function firstOfMonth(dateValue) {
  return new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), 1));
}

function changeMonth(month, offset) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1));
}

function monthGrid(month) {
  const monthStart = firstOfMonth(month);
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  return Array.from({ length:42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      value:date.toISOString().slice(0, 10),
      day:date.getUTCDate(),
      inMonth:date.getUTCMonth() === monthStart.getUTCMonth(),
      month:date.getUTCMonth()
    };
  });
}

function monthLabel(month) {
  return month.toLocaleDateString(undefined, { timeZone:'UTC', month:'long', year:'numeric' });
}

function displayDate(value, options = { month:'short', day:'numeric', year:'numeric' }) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { timeZone:'UTC', ...options });
}

function displayDateRange(item) {
  const start = displayDate(item.startDate);
  const end = item.endDate && item.endDate !== item.startDate ? displayDate(item.endDate) : '';
  return end ? `${start} – ${end}` : start;
}

function displayTime(item) {
  if (!item.startTime) return 'All day';
  const format = (time) => new Date(`2000-01-01T${time}:00`).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  return item.endTime ? `${format(item.startTime)} – ${format(item.endTime)}` : format(item.startTime);
}

function displayType(item) {
  return item.kind === 'holiday' ? holidayTypeLabels[item.type] || item.type : eventTypeLabels[item.type] || item.type;
}

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (response.ok) return data;
  const error = new Error(data.error || fallbackMessage);
  error.requestId = data.requestId || response.headers.get('x-request-id') || '';
  error.debug = data.debug || null;
  throw error;
}

function errorState(error, fallbackMessage) {
  if (error?.name === 'AbortError') return null;
  return {
    message:error?.message === 'Failed to fetch' ? 'Unable to reach the calendar service.' : error?.message || fallbackMessage,
    requestId:error?.requestId || '',
    debug:error?.debug || null
  };
}

function blankHoliday(date) {
  return { name:'', startDate:date, endDate:'', holidayType:'regular', description:'', isRecurring:false, status:'active' };
}

function blankEvent(date, organizerId) {
  return {
    title:'', startDate:date, endDate:'', startTime:'09:00', endTime:'10:00', allDay:false,
    location:'', description:'', eventType:'company_event', organizerId:String(organizerId || ''),
    attendees:'', isRecurring:false, status:'active'
  };
}

function formFromItem(item) {
  const sourceStartDate = item.isRecurring && item.sourceStartDate ? item.sourceStartDate : item.startDate;
  const sourceEndDate = item.isRecurring && Object.prototype.hasOwnProperty.call(item, 'sourceEndDate') ? item.sourceEndDate : item.endDate;
  if (item.kind === 'holiday') return {
    name:item.title, startDate:sourceStartDate, endDate:sourceEndDate || '', holidayType:item.type,
    description:item.description || '', isRecurring:Boolean(item.isRecurring), status:item.status || 'active'
  };
  return {
    title:item.title, startDate:sourceStartDate, endDate:sourceEndDate || '', startTime:item.startTime || '', endTime:item.endTime || '',
    allDay:!item.startTime, location:item.location || '', description:item.description || '', eventType:item.type,
    organizerId:String(item.organizerId || ''), attendees:(item.attendees || []).join(', '),
    isRecurring:Boolean(item.isRecurring), status:item.status || 'active'
  };
}

function itemDates(item) {
  const last = item.endDate || item.startDate;
  const dates = [];
  for (let date = item.startDate; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function useDebouncedValue(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

function CalendarAlert({ state, onDismiss }) {
  if (!state) return null;
  return <div className="calendar-alert" role="alert">
    <div><strong>{state.message}</strong>{state.requestId && <small>Reference: {state.requestId}</small>}{state.debug?.message && <details><summary>Technical details</summary><code>{state.debug.message}</code></details>}</div>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss message">×</button>}
  </div>;
}

export function UpcomingCalendarCard({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/calendar/upcoming?limit=4', { signal:controller.signal, cache:'no-store' })
      .then((response) => readApiResponse(response, 'Unable to load upcoming calendar items.'))
      .then((data) => setItems(data.items || []))
      .catch((loadError) => { const next = errorState(loadError, 'Unable to load upcoming calendar items.'); if (next) setError(next); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return <section className="upcoming-calendar-card" aria-labelledby="upcoming-calendar-title">
    <div className="upcoming-calendar-heading"><div><span>Company calendar</span><h2 id="upcoming-calendar-title">Upcoming</h2><p>Dates your team should know about.</p></div><button type="button" onClick={() => onNavigate('calendar')}>Open calendar →</button></div>
    {loading && <p className="calendar-empty">Loading upcoming dates…</p>}
    {!loading && error && <div className="calendar-inline-error"><span>{error.message}</span><button type="button" onClick={() => setAttempt((current) => current + 1)}>Try again</button></div>}
    {!loading && !error && !items.length && <p className="calendar-empty">Your company calendar is clear for now.</p>}
    {!loading && !error && items.length > 0 && <div className="upcoming-calendar-items">{items.map((item) => <button type="button" onClick={() => onNavigate('calendar')} key={`${item.kind}-${item.id}-${item.startDate}`}><i className={item.kind} aria-hidden="true">{item.kind === 'holiday' ? '✦' : '◷'}</i><span><strong>{item.title}</strong><small>{displayDate(item.startDate, { month:'long', day:'numeric' })}{item.kind === 'event' && item.startTime ? ` · ${displayTime(item)}` : ''}</small></span><b>{item.kind === 'holiday' ? 'Holiday' : 'Event'}</b></button>)}</div>}
  </section>;
}

export function CalendarModule({ user, permission, onConfirm }) {
  const today = localDateValue();
  const [month, setMonth] = useState(() => firstOfMonth(new Date(`${today}T00:00:00Z`)));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('active');
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dayItems, setDayItems] = useState(null);
  const [createPicker, setCreatePicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [organizers, setOrganizers] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search);
  const canCreate = Boolean(permission?.create);
  const canUpdate = Boolean(permission?.update);
  const canDelete = Boolean(permission?.delete);
  const cells = useMemo(() => monthGrid(month), [month]);
  const range = useMemo(() => ({ startDate:cells[0].value, endDate:cells[cells.length - 1].value }), [cells]);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setLoading(true);
    setItems([]);
    setLoadError(null);
    const parameters = new URLSearchParams({ ...range, search:debouncedSearch, type, status });
    fetch(`/api/calendar?${parameters}`, { signal:controller.signal, cache:'no-store' })
      .then((response) => readApiResponse(response, 'Unable to load the calendar.'))
      .then((data) => {
        if (controller.signal.aborted || currentRequestId !== requestId.current) return;
        setItems(data.items || []);
      })
      .catch((requestError) => {
        const next = errorState(requestError, 'Unable to load the calendar.');
        if (next && !controller.signal.aborted && currentRequestId === requestId.current) setLoadError(next);
      })
      .finally(() => {
        if (!controller.signal.aborted && currentRequestId === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [range, debouncedSearch, type, status, refresh]);

  useEffect(() => {
    if (!canCreate && !canUpdate) return undefined;
    const controller = new AbortController();
    fetch('/api/calendar/organizers', { signal:controller.signal, cache:'no-store' })
      .then((response) => readApiResponse(response, 'Unable to load event organizers.'))
      .then((data) => setOrganizers(data.organizers || []))
      .catch(() => setOrganizers([]));
    return () => controller.abort();
  }, [canCreate, canUpdate]);

  const itemsByDate = useMemo(() => {
    const next = new Map();
    for (const item of items) {
      for (const date of itemDates(item)) {
        const itemsForDate = next.get(date) || [];
        itemsForDate.push(item);
        next.set(date, itemsForDate);
      }
    }
    return next;
  }, [items]);

  function openCreate(kind, date = today) {
    if (!canCreate) return;
    setNotice('');
    setMutationError(null);
    setEditor({ kind, mode:'create', id:null, form:kind === 'holiday' ? blankHoliday(date) : blankEvent(date, user.id) });
  }

  function openCreatePicker(date = today) {
    if (!canCreate) return;
    setNotice('');
    setMutationError(null);
    setCreatePicker({ date });
  }

  function chooseCreateKind(kind) {
    const date = createPicker?.date || today;
    setCreatePicker(null);
    openCreate(kind, date);
  }

  function openEdit(item) {
    if (!canUpdate) return;
    setSelected(null);
    setNotice('');
    setMutationError(null);
    setEditor({ kind:item.kind, mode:'edit', id:item.id, form:formFromItem(item), isRecurringSeries:Boolean(item.isRecurring), occurrenceYear:item.occurrenceYear || null });
  }

  async function saveEditor(form) {
    if (!editor) return;
    if (form.endDate && form.endDate < form.startDate) {
      setMutationError({ message:'End date cannot be earlier than the start date.' });
      return;
    }
    if (editor.kind === 'event' && !form.allDay && form.startDate === (form.endDate || form.startDate) && form.endTime <= form.startTime) {
      setMutationError({ message:'End time must be after the start time.' });
      return;
    }
    setSaving(true);
    setMutationError(null);
    try {
      const endpoint = `/api/calendar/${editor.kind === 'holiday' ? 'holidays' : 'events'}${editor.mode === 'edit' ? `/${editor.id}` : ''}`;
      const response = await fetch(endpoint, {
        method:editor.mode === 'edit' ? 'PUT' : 'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(form)
      });
      await readApiResponse(response, `Unable to save this ${editor.kind}.`);
      setEditor(null);
      setNotice(`${editor.kind === 'holiday' ? 'Holiday' : 'Event'} ${editor.mode === 'edit' ? 'updated' : 'created'} successfully.`);
      setRefresh((current) => current + 1);
    } catch (saveError) { setMutationError(errorState(saveError, `Unable to save this ${editor.kind}.`)); }
    finally { setSaving(false); }
  }

  async function removeSelected() {
    if (!selected || !canDelete) return;
    const label = selected.kind === 'holiday' ? 'holiday' : 'event';
    const recurringWarning = selected.isRecurring ? ' This will delete every yearly occurrence in this series.' : '';
    const confirmed = await onConfirm(`Are you sure you want to delete ${selected.title}?${recurringWarning}`, `Delete ${label}?`);
    if (!confirmed) return;
    setDeleting(true);
    setMutationError(null);
    try {
      const response = await fetch(`/api/calendar/${label === 'holiday' ? 'holidays' : 'events'}/${selected.id}`, { method:'DELETE' });
      await readApiResponse(response, `Unable to delete this ${label}.`);
      setSelected(null);
      setNotice(`${label === 'holiday' ? 'Holiday' : 'Event'} deleted.`);
      setRefresh((current) => current + 1);
    } catch (deleteError) { setMutationError(errorState(deleteError, `Unable to delete this ${label}.`)); }
    finally { setDeleting(false); }
  }

  return <section className="calendar-view" aria-labelledby="calendar-title">
    <div className="module-title calendar-title"><div><span>Company schedule</span><h1 id="calendar-title">Calendar</h1><p>Keep holidays, team events, and important company dates in one clear place.</p></div><div className="calendar-title-actions">{canCreate && <button type="button" className="primary-calendar-action" onClick={() => openCreatePicker()}>+ Add schedule item</button>}</div></div>
    {notice && <div className="calendar-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
    <CalendarAlert state={loadError} onDismiss={() => setLoadError(null)} />
    <section className="calendar-workspace">
      <div className="calendar-toolbar">
        <div className="calendar-month-controls"><button type="button" onClick={() => setMonth((current) => changeMonth(current, -1))} aria-label="Previous month">‹</button><div><strong>{monthLabel(month)}</strong><small>{loading ? 'Loading calendar…' : `${items.length} ${items.length === 1 ? 'item' : 'items'} in view`}</small></div><button type="button" onClick={() => setMonth((current) => changeMonth(current, 1))} aria-label="Next month">›</button><button type="button" className="today-button" onClick={() => setMonth(firstOfMonth(new Date(`${today}T00:00:00Z`)))}>Today</button></div>
        <div className="calendar-filters"><label><span className="sr-only">Search calendar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dates…" aria-label="Search calendar" /></label><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter calendar item type"><option value="all">All items</option><option value="holiday">Holidays</option><option value="event">Events</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter calendar item status"><option value="active">Active</option><option value="all">All statuses</option><option value="cancelled">Cancelled</option></select></div>
      </div>
      {loadError && <div className="calendar-retry"><span>Calendar data could not be refreshed.</span><button type="button" onClick={() => setRefresh((current) => current + 1)}>Try again</button></div>}
      <div className="calendar-grid" role="grid" aria-label={`${monthLabel(month)} calendar`}>
        {weekdayLabels.map((label) => <div className="calendar-weekday" role="columnheader" key={label}>{label}</div>)}
        {cells.map((cell) => {
          const dateItems = itemsByDate.get(cell.value) || [];
          const visibleItems = dateItems.slice(0, 2);
          const remainingItems = dateItems.length - visibleItems.length;
          return <article className={`calendar-day${cell.inMonth ? '' : ' outside-month'}${cell.value === today ? ' today' : ''}${dateItems.some((item) => item.kind === 'holiday') ? ' has-holiday' : ''}`} role="gridcell" aria-label={`${displayDate(cell.value)}, ${dateItems.length} calendar item${dateItems.length === 1 ? '' : 's'}`} key={cell.value}>
            <div className="calendar-day-top">{canCreate ? <button type="button" className="calendar-day-number" onClick={() => openCreatePicker(cell.value)} title={`Add a schedule item on ${displayDate(cell.value)}`}>{cell.day}</button> : <time className="calendar-day-number" dateTime={cell.value}>{cell.day}</time>}{cell.value === today && <span>Today</span>}</div>
            <div className="calendar-day-items">{visibleItems.map((item) => <button type="button" className={`calendar-item ${item.kind}${item.status === 'cancelled' ? ' cancelled' : ''}`} onClick={() => setSelected(item)} key={`${item.kind}-${item.id}-${item.startDate}`}><i aria-hidden="true">{item.kind === 'holiday' ? '✦' : '•'}</i><span>{item.title}</span>{item.kind === 'event' && item.startTime && <small>{displayTime(item)}</small>}</button>)}{remainingItems > 0 && <button type="button" className="calendar-more" onClick={() => setDayItems({ date:cell.value, items:dateItems })}>+{remainingItems} more</button>}</div>
          </article>;
        })}
      </div>
      {!loading && !loadError && !items.length && <div className="calendar-empty-state"><i aria-hidden="true">◫</i><strong>{search || type !== 'all' || status !== 'active' ? 'No matching dates' : 'No company dates scheduled'}</strong><p>{canCreate ? 'Use the actions above to add a holiday or event.' : 'Your company calendar is clear for now.'}</p></div>}
    </section>
    <section className="calendar-management" aria-labelledby="calendar-management-title">
      <div className="calendar-management-heading"><div><span>{canCreate || canUpdate || canDelete ? 'Calendar management' : 'Calendar schedule'}</span><h2 id="calendar-management-title">{canCreate || canUpdate || canDelete ? 'Upcoming holidays and events' : 'Company dates in this view'}</h2><p>{canCreate || canUpdate || canDelete ? 'Search, review, and manage the dates visible for this month.' : 'Select a date to view its details.'}</p></div><small>{range.startDate} to {range.endDate}</small></div>
      <div className="calendar-management-list">{loading && <p className="calendar-empty">Loading calendar…</p>}{!loading && items.map((item) => <button type="button" onClick={() => setSelected(item)} className={`calendar-management-item ${item.kind}${item.status === 'cancelled' ? ' cancelled' : ''}`} key={`manage-${item.kind}-${item.id}-${item.startDate}`}><i aria-hidden="true">{item.kind === 'holiday' ? '✦' : '◷'}</i><span><strong>{item.title}</strong><small>{displayDateRange(item)}{item.kind === 'event' ? ` · ${displayTime(item)}` : ''}</small></span><b>{displayType(item)}</b><em>View →</em></button>)}</div>
    </section>
    {createPicker && <CalendarCreatePicker date={createPicker.date} onClose={() => setCreatePicker(null)} onChoose={chooseCreateKind} />}
    {dayItems && <CalendarDayItems date={dayItems.date} items={dayItems.items} onClose={() => setDayItems(null)} onSelect={(item) => { setDayItems(null); setSelected(item); }} />}
    {selected && <CalendarDetails item={selected} error={mutationError} canUpdate={canUpdate} canDelete={canDelete} deleting={deleting} onClose={() => { setSelected(null); setMutationError(null); }} onEdit={() => openEdit(selected)} onDelete={removeSelected} />}
    {editor && <CalendarEditor editor={editor} error={mutationError} organizers={organizers} saving={saving} onClose={() => { if (!saving) { setEditor(null); setMutationError(null); } }} onSave={saveEditor} />}
  </section>;
}

function CalendarCreatePicker({ date, onClose, onChoose }) {
  return <div className="calendar-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="calendar-create-choice-title">
    <button type="button" className="calendar-dialog-scrim" onClick={onClose} aria-label="Close add schedule item" />
    <section className="calendar-dialog calendar-create-picker">
      <header><div><span>Company calendar</span><h2 id="calendar-create-choice-title">What would you like to add?</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
      <div className="calendar-create-picker-body">
        <p>Choose the type of company date to create. You can adjust the date and details in the next step.</p>
        <div className="calendar-create-options">
          <button type="button" className="calendar-create-option holiday" onClick={() => onChoose('holiday')}>
            <i aria-hidden="true">✦</i><span><strong>Add a holiday</strong><small>Set a company, regular, or special non-working holiday.</small></span><b aria-hidden="true">→</b>
          </button>
          <button type="button" className="calendar-create-option event" onClick={() => onChoose('event')}>
            <i aria-hidden="true">◷</i><span><strong>Add an event</strong><small>Schedule a meeting, training, celebration, or company event.</small></span><b aria-hidden="true">→</b>
          </button>
        </div>
        <small className="calendar-create-picker-date">Selected date: {displayDate(date, { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</small>
      </div>
      <footer><span /><button type="button" onClick={onClose}>Cancel</button></footer>
    </section>
  </div>;
}

function CalendarDayItems({ date, items, onClose, onSelect }) {
  return <div className="calendar-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="calendar-day-items-title"><button type="button" className="calendar-dialog-scrim" onClick={onClose} aria-label="Close calendar dates"/><section className="calendar-dialog calendar-day-items-dialog"><header><div><span>Company calendar</span><h2 id="calendar-day-items-title">{displayDate(date, { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><div className="calendar-day-items-list">{items.map((item) => <button type="button" className={`calendar-day-items-list-entry ${item.kind}${item.status === 'cancelled' ? ' cancelled' : ''}`} onClick={() => onSelect(item)} key={`${item.kind}-${item.id}-${item.startDate}`}><i aria-hidden="true">{item.kind === 'holiday' ? '✦' : '◷'}</i><span><strong>{item.title}</strong><small>{displayType(item)}{item.kind === 'event' ? ` · ${displayTime(item)}` : ''}</small></span><em>View →</em></button>)}</div><footer><span/><button type="button" onClick={onClose}>Close</button></footer></section></div>;
}

function CalendarDetails({ item, error, canUpdate, canDelete, deleting, onClose, onEdit, onDelete }) {
  const isHoliday = item.kind === 'holiday';
  return <div className="calendar-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title"><button type="button" className="calendar-dialog-scrim" onClick={onClose} aria-label="Close calendar details"/><section className="calendar-dialog calendar-details"><header><div><span>{isHoliday ? 'Company holiday' : 'Company event'}</span><h2 id="calendar-detail-title">{item.title}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{error&&<CalendarModalError error={error}/>}<div className="calendar-detail-type"><i className={item.kind} aria-hidden="true">{isHoliday ? '✦' : '◷'}</i><span><strong>{displayType(item)}</strong><small className={item.status === 'cancelled' ? 'cancelled' : ''}>{item.status === 'cancelled' ? 'Cancelled' : 'Active'}</small></span></div><dl className="calendar-detail-list"><div><dt>Date</dt><dd>{displayDateRange(item)}</dd></div>{!isHoliday && <div><dt>Time</dt><dd>{displayTime(item)}</dd></div>}{!isHoliday && item.location && <div><dt>Location</dt><dd>{item.location}</dd></div>}{!isHoliday && item.organizer && <div><dt>Organizer</dt><dd>{item.organizer}</dd></div>}{!isHoliday && item.attendees?.length > 0 && <div><dt>Attendees</dt><dd>{item.attendees.join(', ')}</dd></div>}<div><dt>Repeats</dt><dd>{item.isRecurring ? 'Every year' : 'Does not repeat'}</dd></div><div><dt>Created by</dt><dd>{item.createdBy || 'System'}</dd></div><div><dt>Last updated</dt><dd>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—'}</dd></div></dl>{item.description && <section className="calendar-detail-description"><span>Description</span><p>{item.description}</p></section>}<footer><button type="button" onClick={onClose}>Close</button><span/>{canDelete && <button type="button" className="calendar-delete-button" disabled={deleting} onClick={onDelete}>{deleting ? 'Deleting…' : 'Delete'}</button>}{canUpdate && <button type="button" className="primary-calendar-action" onClick={onEdit}>Edit {isHoliday ? 'holiday' : 'event'}</button>}</footer></section></div>;
}

function CalendarEditor({ editor, error, organizers, saving, onClose, onSave }) {
  const [form, setForm] = useState(editor.form);
  const isHoliday = editor.kind === 'holiday';
  function update(name, value) { setForm((current) => ({ ...current, [name]:value })); }
  function submit(event) { event.preventDefault(); onSave(form); }
  return <div className="calendar-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="calendar-editor-title"><button type="button" className="calendar-dialog-scrim" onClick={onClose} aria-label="Close calendar editor"/><form className="calendar-dialog calendar-editor" onSubmit={submit}><header><div><span>{editor.mode === 'create' ? 'New company date' : 'Update company date'}</span><h2 id="calendar-editor-title">{editor.mode === 'create' ? `Add ${isHoliday ? 'holiday' : 'event'}` : `Edit ${isHoliday ? 'holiday' : 'event'}`}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close">×</button></header>{error&&<CalendarModalError error={error}/>} {editor.isRecurringSeries&&<p className="calendar-series-note">This is an annual series. Changes apply to the series from its original start date.</p>} {isHoliday ? <HolidayFields form={form} update={update} /> : <EventFields form={form} update={update} organizers={organizers} /> }<footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><span/><button type="submit" className="primary-calendar-action" disabled={saving}>{saving ? 'Saving…' : `Save ${isHoliday ? 'holiday' : 'event'}`}</button></footer></form></div>;
}

function CalendarModalError({ error }) {
  return <p className="calendar-modal-error" role="alert"><strong>{error.message}</strong>{error.requestId && <small>Reference: {error.requestId}</small>}</p>;
}

function HolidayFields({ form, update }) {
  return <div className="calendar-form"><label className="calendar-field-wide"><span>Holiday name <b>*</b></span><input value={form.name} onChange={(event) => update('name', event.target.value)} maxLength="140" required autoFocus /></label><div className="calendar-field-grid"><label><span>Start date <b>*</b></span><input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} required /></label><label><span>End date</span><input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => update('endDate', event.target.value)} /></label><label><span>Holiday type <b>*</b></span><select value={form.holidayType} onChange={(event) => update('holidayType', event.target.value)}><option value="regular">Regular holiday</option><option value="special_non_working">Special non-working holiday</option><option value="company">Company holiday</option><option value="other">Other</option></select></label><label><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label></div><label className="calendar-checkbox"><input type="checkbox" checked={form.isRecurring} onChange={(event) => update('isRecurring', event.target.checked)} /><span><strong>Repeat every year</strong><small>Use this for company holidays that return annually.</small></span></label><label className="calendar-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} maxLength="2000" /></label></div>;
}

function EventFields({ form, update, organizers }) {
  return <div className="calendar-form"><label className="calendar-field-wide"><span>Event title <b>*</b></span><input value={form.title} onChange={(event) => update('title', event.target.value)} maxLength="160" required autoFocus /></label><div className="calendar-field-grid"><label><span>Start date <b>*</b></span><input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} required /></label><label><span>End date</span><input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => update('endDate', event.target.value)} /></label><label><span>Category <b>*</b></span><select value={form.eventType} onChange={(event) => update('eventType', event.target.value)}><option value="company_event">Company event</option><option value="meeting">Meeting</option><option value="training">Training</option><option value="celebration">Celebration</option><option value="other">Other</option></select></label><label><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label></div><label className="calendar-checkbox"><input type="checkbox" checked={form.allDay} onChange={(event) => update('allDay', event.target.checked)} /><span><strong>All-day event</strong><small>Turn this on when no start and end time is needed.</small></span></label>{!form.allDay && <div className="calendar-field-grid"><label><span>Start time <b>*</b></span><input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} required /></label><label><span>End time <b>*</b></span><input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} required /></label></div>}<div className="calendar-field-grid"><label><span>Location</span><input value={form.location} onChange={(event) => update('location', event.target.value)} maxLength="200" /></label><label><span>Organizer</span><select value={form.organizerId} onChange={(event) => update('organizerId', event.target.value)}>{organizers.length ? organizers.map((organizer) => <option value={organizer.id} key={organizer.id}>{organizer.displayName}</option>) : <option value={form.organizerId}>Current user</option>}</select></label></div><label className="calendar-field-wide"><span>Attendees</span><input value={form.attendees} onChange={(event) => update('attendees', event.target.value)} /><small>Optional — separate names with commas; up to 50 names.</small></label><label className="calendar-checkbox"><input type="checkbox" checked={form.isRecurring} onChange={(event) => update('isRecurring', event.target.checked)} /><span><strong>Repeat every year</strong><small>Use this only for annual company events.</small></span></label><label className="calendar-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} maxLength="4000" /></label></div>;
}
