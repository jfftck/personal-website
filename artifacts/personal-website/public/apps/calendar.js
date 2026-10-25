'use strict';

export function buildCalendar(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app cal-card';
  root.innerHTML = `<div class="cal-month"></div><div class="cal-day"></div><div class="cal-weekday"></div>`;
  const month = root.querySelector('.cal-month');
  const day = root.querySelector('.cal-day');
  const weekday = root.querySelector('.cal-weekday');
  const render = () => {
    const now = new Date();
    month.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(now);
    day.textContent = String(now.getDate()).padStart(2, '0');
    weekday.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  };
  render();
  const timer = setInterval(render, 60_000);
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => clearInterval(timer) };
  return root;
}
