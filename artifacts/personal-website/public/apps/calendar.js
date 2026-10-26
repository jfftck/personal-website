'use strict';

const PREFS_KEY = 'personal-desktop-calendar-view-v1';
const VIEW_NAMES = ['month', 'week', 'agenda'];
const WEEKDAYS = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index));

export function buildCalendar(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app cal-card';
  root.innerHTML = `
    <header class="cal-toolbar">
      <div class="cal-toolbar-nav">
        <button type="button" class="cal-nav-button cal-prev" aria-label="Previous period">‹</button>
        <button type="button" class="cal-today-button">Today</button>
        <button type="button" class="cal-nav-button cal-next" aria-label="Next period">›</button>
      </div>
      <div class="cal-view-switch" role="group" aria-label="Calendar view">
        <button type="button" class="cal-view-button" data-view="month" aria-pressed="false">Month</button>
        <button type="button" class="cal-view-button" data-view="week" aria-pressed="false">Week</button>
        <button type="button" class="cal-view-button" data-view="agenda" aria-pressed="false">Agenda</button>
      </div>
      <label class="cal-weekend-control" hidden>
        <input type="checkbox" aria-label="Include weekend">
        <span>Weekend</span>
      </label>
    </header>
    <h2 class="cal-period" aria-live="polite"></h2>
    <div class="cal-content"></div>`;

  const period = root.querySelector('.cal-period');
  const content = root.querySelector('.cal-content');
  const viewButtons = [...root.querySelectorAll('.cal-view-button')];
  const weekendControl = root.querySelector('.cal-weekend-control');
  const weekendToggle = weekendControl.querySelector('input');
  const restored = loadPreferences();
  let view = VIEW_NAMES.includes(restored.view) ? restored.view : 'month';
  let selectedDate = parseDate(restored.selectedDate) || dateOnly(new Date());
  let includeWeekend = restored.includeWeekend === true;

  const persist = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        view,
        selectedDate: dateKey(selectedDate),
        includeWeekend,
      }));
    } catch { /* Calendar remains usable when storage is unavailable. */ }
  };

  const setSelectedDate = date => {
    selectedDate = dateOnly(date);
    persist();
    render();
  };

  const format = (date, options) => new Intl.DateTimeFormat(undefined, options).format(date);
  const startOfWeek = date => {
    const start = dateOnly(date);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    return start;
  };

  function render() {
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    weekendControl.hidden = view !== 'week';
    weekendToggle.checked = includeWeekend;
    root.dataset.view = view;

    if (view === 'month') renderMonth();
    else if (view === 'week') renderWeek();
    else renderAgenda();
  }

  function renderMonth() {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    period.textContent = format(selectedDate, { month: 'long', year: 'numeric' });
    content.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'cal-month-grid';
    for (const day of WEEKDAYS) {
      const label = document.createElement('span');
      label.className = 'cal-weekday-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = format(day, { weekday: 'short' });
      grid.append(label);
    }

    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysThisMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((offset + daysThisMonth) / 7) * 7;
    const today = dateOnly(new Date());

    for (let index = 0; index < cellCount; index++) {
      const date = new Date(year, month, index - offset + 1);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-date-cell';
      if (date.getMonth() !== month) button.classList.add('outside-month');
      if (sameDate(date, today)) button.classList.add('today');
      if (sameDate(date, selectedDate)) button.classList.add('selected');
      button.setAttribute('aria-label', format(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
      if (sameDate(date, selectedDate)) button.setAttribute('aria-current', 'date');
      button.textContent = String(date.getDate());
      button.addEventListener('click', () => setSelectedDate(date));
      grid.append(button);
    }
    content.append(grid);
  }

  function renderWeek() {
    const start = startOfWeek(selectedDate);
    const visibleDays = includeWeekend ? 7 : 5;
    const end = new Date(start);
    end.setDate(start.getDate() + visibleDays - 1);
    period.textContent = `${format(start, { month: 'short', day: 'numeric' })} – ${format(end, {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`;
    content.replaceChildren();

    const grid = document.createElement('div');
    grid.className = `cal-week-grid${includeWeekend ? ' includes-weekend' : ''}`;
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', `Week of ${format(start, { month: 'long', day: 'numeric', year: 'numeric' })}`);
    const today = dateOnly(new Date());

    for (let index = 0; index < visibleDays; index++) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-week-day';
      if (sameDate(date, today)) button.classList.add('today');
      if (sameDate(date, selectedDate)) button.classList.add('selected');
      button.setAttribute('aria-label', format(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
      if (sameDate(date, selectedDate)) button.setAttribute('aria-current', 'date');
      const weekday = document.createElement('span');
      weekday.className = 'cal-week-day-name';
      weekday.textContent = format(date, { weekday: 'short' });
      const number = document.createElement('strong');
      number.textContent = String(date.getDate());
      button.append(weekday, number);
      button.addEventListener('click', () => setSelectedDate(date));
      grid.append(button);
    }
    content.append(grid);
  }

  function renderAgenda() {
    const finalDate = new Date(selectedDate);
    finalDate.setDate(finalDate.getDate() + 13);
    period.textContent = `${format(selectedDate, { month: 'short', day: 'numeric' })} – ${format(finalDate, {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`;
    content.replaceChildren();

    const agenda = document.createElement('div');
    agenda.className = 'cal-agenda';
    agenda.setAttribute('aria-label', 'Upcoming dates');
    const today = dateOnly(new Date());
    for (let index = 0; index < 14; index++) {
      const date = new Date(selectedDate);
      date.setDate(selectedDate.getDate() + index);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cal-agenda-item';
      if (sameDate(date, today)) item.classList.add('today');
      if (sameDate(date, selectedDate)) item.classList.add('selected');
      item.setAttribute('aria-label', format(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
      const weekday = document.createElement('span');
      weekday.className = 'cal-agenda-weekday';
      weekday.textContent = format(date, { weekday: 'long' });
      const dateLabel = document.createElement('strong');
      dateLabel.textContent = format(date, { month: 'short', day: 'numeric' });
      const empty = document.createElement('span');
      empty.className = 'cal-agenda-empty';
      empty.textContent = 'No events';
      item.append(weekday, dateLabel, empty);
      item.addEventListener('click', () => setSelectedDate(date));
      agenda.append(item);
    }
    content.append(agenda);
  }

  root.querySelector('.cal-prev').addEventListener('click', () => navigate(-1));
  root.querySelector('.cal-next').addEventListener('click', () => navigate(1));
  root.querySelector('.cal-today-button').addEventListener('click', () => setSelectedDate(new Date()));
  viewButtons.forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view;
    persist();
    render();
  }));
  weekendToggle.addEventListener('change', () => {
    includeWeekend = weekendToggle.checked;
    persist();
    render();
  });

  function navigate(direction) {
    const nextDate = new Date(selectedDate);
    if (view === 'month') {
      const targetMonth = nextDate.getMonth() + direction;
      const target = new Date(nextDate.getFullYear(), targetMonth, 1);
      target.setDate(Math.min(selectedDate.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
      setSelectedDate(target);
      return;
    }
    nextDate.setDate(nextDate.getDate() + direction * (view === 'week' ? 7 : 14));
    setSelectedDate(nextDate);
  }

  render();
  const timer = setInterval(render, 60_000);
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => clearInterval(timer) };
  return root;
}

function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : null;
}

function dateOnly(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
