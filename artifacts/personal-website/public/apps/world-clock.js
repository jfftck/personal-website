'use strict';

const KEY = 'personal-desktop-world-clock-v1';
const DEFAULT_ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

let nextClockId = 1;

export function buildWorldClock(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app clock-app';
  let prefs = readPrefs();
  let interval;
  const listId = `clock-zones-${nextClockId++}`;
  root.innerHTML = `<div class="clock-controls">
    <input class="clock-zone-input" aria-label="Time zone" placeholder="Add a time zone (e.g. Europe/Paris)">
    <datalist><option value="UTC"><option value="America/New_York"><option value="Europe/London"><option value="Europe/Paris"><option value="Asia/Tokyo"><option value="Australia/Sydney"><option value="Pacific/Honolulu"></datalist>
    <button type="button" class="util-action clock-add">Add zone</button>
    <span class="util-muted" style="margin-left:auto">View</span>
    <button type="button" class="util-action clock-layout" aria-label="Change clock layout"></button>
    <button type="button" class="util-action clock-face-mode" aria-label="Change clock face"></button>
  </div><div class="clock-list"></div>`;
  const list = root.querySelector('.clock-list');
  root.querySelector('datalist').id = listId;
  root.querySelector('.clock-zone-input').setAttribute('list', listId);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const render = () => {
    root.querySelector('.clock-layout').textContent = prefs.layout === 'grid' ? 'Grid' : 'List';
    root.querySelector('.clock-face-mode').textContent = prefs.face === 'analog' ? 'Analog' : 'Digital';
    list.classList.toggle('grid', prefs.layout === 'grid');
    list.replaceChildren();
    prefs.zones.forEach(zone => {
      const item = document.createElement('article');
      item.className = 'clock-item';
      item.dataset.zone = zone;
      const label = zone === 'UTC' ? 'UTC' : zone.split('/').pop().replaceAll('_', ' ');
      item.innerHTML = `<div><strong></strong><span class="util-muted clock-date"></span></div><div class="clock-face" aria-hidden="true" hidden></div><time></time><button class="clock-remove" type="button" aria-label="Remove time zone">×</button>`;
      item.querySelector('strong').textContent = label;
      item.querySelector('time').dateTime = new Date().toISOString();
      item.querySelector('.clock-remove').setAttribute('aria-label', `Remove ${label} clock`);
      item.querySelector('.clock-face').hidden = prefs.face !== 'analog';
      item.querySelector('time').classList.toggle('sr-only', prefs.face === 'analog');
      const draw = () => {
        const date = new Date();
        const fmt = opts => new Intl.DateTimeFormat(undefined, { ...opts, timeZone: zone }).format(date);
        item.querySelector('time').textContent = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
        item.querySelector('.clock-date').textContent = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
        if (prefs.face === 'analog') {
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date);
          const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
          const hour = Number(values.hour) % 12, minute = Number(values.minute);
          item.querySelector('.clock-face').style.setProperty('--hour', `${hour * 30 + minute / 2}deg`);
          item.querySelector('.clock-face').style.setProperty('--minute', `${minute * 6}deg`);
        }
      };
      draw();
      item.querySelector('.clock-remove').addEventListener('click', () => {
        prefs.zones = prefs.zones.filter(value => value !== zone);
        persist(); render();
      });
      list.append(item);
    });
    if (!prefs.zones.length) {
      const empty = document.createElement('p');
      empty.className = 'clock-empty util-muted';
      empty.textContent = 'Add a time zone to start tracking its local time.';
      list.append(empty);
    }
    clearInterval(interval);
    interval = setInterval(() => {
      list.querySelectorAll('.clock-item').forEach(item => {
        const zone = item.dataset.zone;
        const date = new Date();
        item.querySelector('time').textContent = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
        item.querySelector('.clock-date').textContent = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date).map(part => [part.type, part.value]));
        const face = item.querySelector('.clock-face');
        face.style.setProperty('--hour', `${(Number(parts.hour) % 12) * 30 + Number(parts.minute) / 2}deg`);
        face.style.setProperty('--minute', `${Number(parts.minute) * 6}deg`);
      });
    }, 1000);
  };
  root.querySelector('.clock-add').addEventListener('click', () => {
    const input = root.querySelector('.clock-zone-input');
    const zone = input.value.trim();
    try { new Intl.DateTimeFormat(undefined, { timeZone: zone }); }
    catch { input.setCustomValidity('Enter a valid IANA time zone, such as Europe/Paris.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    if (!prefs.zones.includes(zone)) prefs.zones.push(zone);
    input.value = ''; persist(); render();
  });
  root.querySelector('.clock-zone-input').addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('.clock-add').click(); });
  root.querySelector('.clock-layout').addEventListener('click', () => { prefs.layout = prefs.layout === 'grid' ? 'list' : 'grid'; persist(); render(); });
  root.querySelector('.clock-face-mode').addEventListener('click', () => { prefs.face = prefs.face === 'analog' ? 'digital' : 'analog'; persist(); render(); });
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => clearInterval(interval) };
  render();
  return root;
}

function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.zones)) return { zones: saved.zones.filter(zone => { try { new Intl.DateTimeFormat(undefined, { timeZone: zone }); return true; } catch { return false; } }), layout: saved.layout === 'grid' ? 'grid' : 'list', face: saved.face === 'analog' ? 'analog' : 'digital' };
  } catch {}
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_ZONES[0];
  return { zones: [...new Set([localZone, ...DEFAULT_ZONES])], layout: 'list', face: 'digital' };
}
