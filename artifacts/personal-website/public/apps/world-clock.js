'use strict';

const KEY = 'personal-desktop-world-clock-v1';
const DEFAULT_ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
const ZONE_SUGGESTIONS = ['UTC', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Honolulu'];
const CITY_OPTIONS = [
  { city: 'Anchorage', country: 'United States', zone: 'America/Anchorage' },
  { city: 'Addis Ababa', country: 'Ethiopia', zone: 'Africa/Addis_Ababa' },
  { city: 'Adelaide', country: 'Australia', zone: 'Australia/Adelaide' },
  { city: 'Amsterdam', country: 'Netherlands', zone: 'Europe/Amsterdam' },
  { city: 'Athens', country: 'Greece', zone: 'Europe/Athens' },
  { city: 'Auckland', country: 'New Zealand', zone: 'Pacific/Auckland' },
  { city: 'Baghdad', country: 'Iraq', zone: 'Asia/Baghdad' },
  { city: 'Bangkok', country: 'Thailand', zone: 'Asia/Bangkok' },
  { city: 'Beijing', country: 'China', zone: 'Asia/Shanghai' },
  { city: 'Beirut', country: 'Lebanon', zone: 'Asia/Beirut' },
  { city: 'Bogota', country: 'Colombia', zone: 'America/Bogota' },
  { city: 'Brisbane', country: 'Australia', zone: 'Australia/Brisbane' },
  { city: 'Brussels', country: 'Belgium', zone: 'Europe/Brussels' },
  { city: 'Buenos Aires', country: 'Argentina', zone: 'America/Argentina/Buenos_Aires' },
  { city: 'Cairo', country: 'Egypt', zone: 'Africa/Cairo' },
  { city: 'Cape Town', country: 'South Africa', zone: 'Africa/Johannesburg' },
  { city: 'Casablanca', country: 'Morocco', zone: 'Africa/Casablanca' },
  { city: 'Chicago', country: 'United States', zone: 'America/Chicago' },
  { city: 'Copenhagen', country: 'Denmark', zone: 'Europe/Copenhagen' },
  { city: 'Dakar', country: 'Senegal', zone: 'Africa/Dakar' },
  { city: 'Dallas', country: 'United States', zone: 'America/Chicago' },
  { city: 'Denver', country: 'United States', zone: 'America/Denver' },
  { city: 'Dhaka', country: 'Bangladesh', zone: 'Asia/Dhaka' },
  { city: 'Dubai', country: 'United Arab Emirates', zone: 'Asia/Dubai' },
  { city: 'Dublin', country: 'Ireland', zone: 'Europe/Dublin' },
  { city: 'Hanoi', country: 'Vietnam', zone: 'Asia/Ho_Chi_Minh' },
  { city: 'Helsinki', country: 'Finland', zone: 'Europe/Helsinki' },
  { city: 'Hong Kong', country: 'China', zone: 'Asia/Hong_Kong' },
  { city: 'Honolulu', country: 'United States', zone: 'Pacific/Honolulu' },
  { city: 'Istanbul', country: 'Türkiye', zone: 'Europe/Istanbul' },
  { city: 'Jakarta', country: 'Indonesia', zone: 'Asia/Jakarta' },
  { city: 'Johannesburg', country: 'South Africa', zone: 'Africa/Johannesburg' },
  { city: 'Karachi', country: 'Pakistan', zone: 'Asia/Karachi' },
  { city: 'Kathmandu', country: 'Nepal', zone: 'Asia/Kathmandu' },
  { city: 'Kuala Lumpur', country: 'Malaysia', zone: 'Asia/Kuala_Lumpur' },
  { city: 'Kyiv', country: 'Ukraine', zone: 'Europe/Kyiv' },
  { city: 'Lagos', country: 'Nigeria', zone: 'Africa/Lagos' },
  { city: 'Lima', country: 'Peru', zone: 'America/Lima' },
  { city: 'Lisbon', country: 'Portugal', zone: 'Europe/Lisbon' },
  { city: 'London', country: 'United Kingdom', zone: 'Europe/London' },
  { city: 'Los Angeles', country: 'United States', zone: 'America/Los_Angeles' },
  { city: 'Madrid', country: 'Spain', zone: 'Europe/Madrid' },
  { city: 'Manila', country: 'Philippines', zone: 'Asia/Manila' },
  { city: 'Melbourne', country: 'Australia', zone: 'Australia/Melbourne' },
  { city: 'Mexico City', country: 'Mexico', zone: 'America/Mexico_City' },
  { city: 'Miami', country: 'United States', zone: 'America/New_York' },
  { city: 'Milan', country: 'Italy', zone: 'Europe/Rome' },
  { city: 'Montreal', country: 'Canada', zone: 'America/Toronto' },
  { city: 'Moscow', country: 'Russia', zone: 'Europe/Moscow' },
  { city: 'Mumbai', country: 'India', zone: 'Asia/Kolkata' },
  { city: 'Nairobi', country: 'Kenya', zone: 'Africa/Nairobi' },
  { city: 'New Delhi', country: 'India', zone: 'Asia/Kolkata' },
  { city: 'New York', country: 'United States', zone: 'America/New_York' },
  { city: 'Oslo', country: 'Norway', zone: 'Europe/Oslo' },
  { city: 'Paris', country: 'France', zone: 'Europe/Paris' },
  { city: 'Perth', country: 'Australia', zone: 'Australia/Perth' },
  { city: 'Prague', country: 'Czechia', zone: 'Europe/Prague' },
  { city: 'Reykjavik', country: 'Iceland', zone: 'Atlantic/Reykjavik' },
  { city: 'Rio de Janeiro', country: 'Brazil', zone: 'America/Sao_Paulo' },
  { city: 'Riyadh', country: 'Saudi Arabia', zone: 'Asia/Riyadh' },
  { city: 'Rome', country: 'Italy', zone: 'Europe/Rome' },
  { city: 'San Francisco', country: 'United States', zone: 'America/Los_Angeles' },
  { city: 'Santiago', country: 'Chile', zone: 'America/Santiago' },
  { city: 'Sao Paulo', country: 'Brazil', zone: 'America/Sao_Paulo' },
  { city: 'Seoul', country: 'South Korea', zone: 'Asia/Seoul' },
  { city: 'Shanghai', country: 'China', zone: 'Asia/Shanghai' },
  { city: 'Singapore', country: 'Singapore', zone: 'Asia/Singapore' },
  { city: 'Stockholm', country: 'Sweden', zone: 'Europe/Stockholm' },
  { city: 'Sydney', country: 'Australia', zone: 'Australia/Sydney' },
  { city: 'Taipei', country: 'Taiwan', zone: 'Asia/Taipei' },
  { city: 'Tokyo', country: 'Japan', zone: 'Asia/Tokyo' },
  { city: 'Toronto', country: 'Canada', zone: 'America/Toronto' },
  { city: 'Vancouver', country: 'Canada', zone: 'America/Vancouver' },
  { city: 'Vienna', country: 'Austria', zone: 'Europe/Vienna' },
  { city: 'Warsaw', country: 'Poland', zone: 'Europe/Warsaw' },
  { city: 'Zurich', country: 'Switzerland', zone: 'Europe/Zurich' },
];

let nextClockId = 1;

export function buildWorldClock(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app clock-app';
  let prefs = readPrefs();
  let interval;
  const listId = `clock-zones-${nextClockId++}`;
  root.innerHTML = `<div class="clock-controls">
    <input class="clock-zone-input" aria-label="City or time zone" placeholder="Search a city (e.g. Paris)">
    <datalist></datalist>
    <button type="button" class="util-action clock-add">Add clock</button>
    <span class="util-muted" style="margin-left:auto">View</span>
    <button type="button" class="util-action clock-layout" aria-label="Change clock layout"></button>
    <button type="button" class="util-action clock-face-mode" aria-label="Change clock face"></button>
  </div><div class="clock-list"></div>`;
  const list = root.querySelector('.clock-list');
  const suggestions = root.querySelector('datalist');
  suggestions.id = listId;
  const addInput = root.querySelector('.clock-zone-input');
  addInput.setAttribute('list', listId);
  const zoneOptions = new Set(CITY_OPTIONS.map(option => option.zone));
  for (const zone of ZONE_SUGGESTIONS) {
    if (zoneOptions.has(zone)) continue;
    const option = document.createElement('option');
    option.value = zone;
    option.label = zone === 'UTC' ? 'Coordinated Universal Time' : 'Time zone';
    suggestions.append(option);
  }
  for (const { city, country, zone } of [...CITY_OPTIONS].sort((a, b) => a.city.localeCompare(b.city))) {
    const option = document.createElement('option');
    option.value = city;
    option.label = `${country} · ${zone}`;
    suggestions.append(option);
  }
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
      const label = prefs.cityLabels[zone] || (zone === 'UTC' ? 'UTC' : zone.split('/').pop().replaceAll('_', ' '));
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
        delete prefs.cityLabels[zone];
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
    const value = input.value.trim();
    const city = CITY_OPTIONS.find(option => normalizeCity(option.city) === normalizeCity(value));
    const zone = city?.zone || value;
    try { new Intl.DateTimeFormat(undefined, { timeZone: zone }); }
    catch { input.setCustomValidity('Choose a city from the suggestions or enter a valid IANA time zone.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    if (!prefs.zones.includes(zone)) prefs.zones.push(zone);
    if (city && !prefs.cityLabels[zone]) prefs.cityLabels[zone] = city.city;
    input.value = ''; persist(); render();
  });
  addInput.addEventListener('input', () => addInput.setCustomValidity(''));
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('.clock-add').click(); });
  root.querySelector('.clock-layout').addEventListener('click', () => { prefs.layout = prefs.layout === 'grid' ? 'list' : 'grid'; persist(); render(); });
  root.querySelector('.clock-face-mode').addEventListener('click', () => { prefs.face = prefs.face === 'analog' ? 'digital' : 'analog'; persist(); render(); });
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => clearInterval(interval) };
  render();
  return root;
}

function normalizeCity(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase();
}

function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.zones)) return {
      zones: saved.zones.filter(zone => { try { new Intl.DateTimeFormat(undefined, { timeZone: zone }); return true; } catch { return false; } }),
      cityLabels: saved.cityLabels && typeof saved.cityLabels === 'object' && !Array.isArray(saved.cityLabels)
        ? Object.fromEntries(Object.entries(saved.cityLabels).filter(([, city]) => typeof city === 'string'))
        : {},
      layout: saved.layout === 'grid' ? 'grid' : 'list',
      face: saved.face === 'analog' ? 'analog' : 'digital',
    };
  } catch {}
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_ZONES[0];
  return { zones: [...new Set([localZone, ...DEFAULT_ZONES])], cityLabels: {}, layout: 'list', face: 'digital' };
}
