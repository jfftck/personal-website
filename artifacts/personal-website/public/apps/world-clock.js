'use strict';

const KEY = 'personal-desktop-world-clock-v1';
const DEFAULT_ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
const ZONE_SUGGESTIONS = ['UTC', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Honolulu'];
export const CITY_OPTIONS = [
  { city: 'Abidjan', country: 'Côte d’Ivoire', zone: 'Africa/Abidjan' },
  { city: 'Accra', country: 'Ghana', zone: 'Africa/Accra' },
  { city: 'Anchorage', country: 'United States', zone: 'America/Anchorage' },
  { city: 'Addis Ababa', country: 'Ethiopia', zone: 'Africa/Addis_Ababa' },
  { city: 'Adelaide', country: 'Australia', zone: 'Australia/Adelaide' },
  { city: 'Algiers', country: 'Algeria', zone: 'Africa/Algiers' },
  { city: 'Almaty', country: 'Kazakhstan', zone: 'Asia/Almaty', aliases: ['Alma-Ata'] },
  { city: 'Amsterdam', country: 'Netherlands', zone: 'Europe/Amsterdam' },
  { city: 'Amman', country: 'Jordan', zone: 'Asia/Amman' },
  { city: 'Asunción', country: 'Paraguay', zone: 'America/Asuncion' },
  { city: 'Athens', country: 'Greece', zone: 'Europe/Athens', aliases: ['Athína'] },
  { city: 'Auckland', country: 'New Zealand', zone: 'Pacific/Auckland' },
  { city: 'Baku', country: 'Azerbaijan', zone: 'Asia/Baku' },
  { city: 'Baghdad', country: 'Iraq', zone: 'Asia/Baghdad' },
  { city: 'Bangkok', country: 'Thailand', zone: 'Asia/Bangkok' },
  { city: 'Beijing', country: 'China', zone: 'Asia/Shanghai', aliases: ['Peking'] },
  { city: 'Beirut', country: 'Lebanon', zone: 'Asia/Beirut' },
  { city: 'Belgrade', country: 'Serbia', zone: 'Europe/Belgrade' },
  { city: 'Bengaluru', country: 'India', zone: 'Asia/Kolkata', aliases: ['Bangalore'] },
  { city: 'Bishkek', country: 'Kyrgyzstan', zone: 'Asia/Bishkek' },
  { city: 'Bogotá', country: 'Colombia', zone: 'America/Bogota', aliases: ['Bogota'] },
  { city: 'Brisbane', country: 'Australia', zone: 'Australia/Brisbane' },
  { city: 'Brussels', country: 'Belgium', zone: 'Europe/Brussels' },
  { city: 'Bucharest', country: 'Romania', zone: 'Europe/Bucharest', aliases: ['București'] },
  { city: 'Budapest', country: 'Hungary', zone: 'Europe/Budapest' },
  { city: 'Buenos Aires', country: 'Argentina', zone: 'America/Argentina/Buenos_Aires' },
  { city: 'Cairo', country: 'Egypt', zone: 'Africa/Cairo' },
  { city: 'Cape Town', country: 'South Africa', zone: 'Africa/Johannesburg' },
  { city: 'Casablanca', country: 'Morocco', zone: 'Africa/Casablanca' },
  { city: 'Caracas', country: 'Venezuela', zone: 'America/Caracas' },
  { city: 'Chennai', country: 'India', zone: 'Asia/Kolkata', aliases: ['Madras'] },
  { city: 'Chicago', country: 'United States', zone: 'America/Chicago' },
  { city: 'Colombo', country: 'Sri Lanka', zone: 'Asia/Colombo' },
  { city: 'Copenhagen', country: 'Denmark', zone: 'Europe/Copenhagen' },
  { city: 'Dakar', country: 'Senegal', zone: 'Africa/Dakar' },
  { city: 'Dallas', country: 'United States', zone: 'America/Chicago' },
  { city: 'Denver', country: 'United States', zone: 'America/Denver' },
  { city: 'Dar es Salaam', country: 'Tanzania', zone: 'Africa/Dar_es_Salaam' },
  { city: 'Dhaka', country: 'Bangladesh', zone: 'Asia/Dhaka' },
  { city: 'Dushanbe', country: 'Tajikistan', zone: 'Asia/Dushanbe' },
  { city: 'Dubai', country: 'United Arab Emirates', zone: 'Asia/Dubai' },
  { city: 'Dublin', country: 'Ireland', zone: 'Europe/Dublin' },
  { city: 'Georgetown', country: 'Guyana', zone: 'America/Guyana' },
  { city: 'Guatemala City', country: 'Guatemala', zone: 'America/Guatemala' },
  { city: 'Harare', country: 'Zimbabwe', zone: 'Africa/Harare' },
  { city: 'Havana', country: 'Cuba', zone: 'America/Havana' },
  { city: 'Hanoi', country: 'Vietnam', zone: 'Asia/Ho_Chi_Minh', aliases: ['Hà Nội'] },
  { city: 'Ho Chi Minh City', country: 'Vietnam', zone: 'Asia/Ho_Chi_Minh', aliases: ['Saigon', 'Sài Gòn'] },
  { city: 'Helsinki', country: 'Finland', zone: 'Europe/Helsinki' },
  { city: 'Hong Kong', country: 'China', zone: 'Asia/Hong_Kong' },
  { city: 'Honolulu', country: 'United States', zone: 'Pacific/Honolulu' },
  { city: 'Islamabad', country: 'Pakistan', zone: 'Asia/Karachi' },
  { city: 'Istanbul', country: 'Türkiye', zone: 'Europe/Istanbul' },
  { city: 'Jakarta', country: 'Indonesia', zone: 'Asia/Jakarta' },
  { city: 'Johannesburg', country: 'South Africa', zone: 'Africa/Johannesburg' },
  { city: 'Kampala', country: 'Uganda', zone: 'Africa/Kampala' },
  { city: 'Karachi', country: 'Pakistan', zone: 'Asia/Karachi' },
  { city: 'Kathmandu', country: 'Nepal', zone: 'Asia/Kathmandu' },
  { city: 'Khartoum', country: 'Sudan', zone: 'Africa/Khartoum' },
  { city: 'Kinshasa', country: 'Democratic Republic of the Congo', zone: 'Africa/Kinshasa' },
  { city: 'Kolkata', country: 'India', zone: 'Asia/Kolkata', aliases: ['Calcutta'] },
  { city: 'Kuwait City', country: 'Kuwait', zone: 'Asia/Kuwait' },
  { city: 'Kuala Lumpur', country: 'Malaysia', zone: 'Asia/Kuala_Lumpur' },
  { city: 'Kyiv', country: 'Ukraine', zone: 'Europe/Kyiv', aliases: ['Kiev'] },
  { city: 'La Paz', country: 'Bolivia', zone: 'America/La_Paz' },
  { city: 'Lagos', country: 'Nigeria', zone: 'Africa/Lagos' },
  { city: 'Lima', country: 'Peru', zone: 'America/Lima' },
  { city: 'Lisbon', country: 'Portugal', zone: 'Europe/Lisbon', aliases: ['Lisboa'] },
  { city: 'Luanda', country: 'Angola', zone: 'Africa/Luanda' },
  { city: 'London', country: 'United Kingdom', zone: 'Europe/London' },
  { city: 'Los Angeles', country: 'United States', zone: 'America/Los_Angeles' },
  { city: 'Lusaka', country: 'Zambia', zone: 'Africa/Lusaka' },
  { city: 'Managua', country: 'Nicaragua', zone: 'America/Managua' },
  { city: 'Madrid', country: 'Spain', zone: 'Europe/Madrid' },
  { city: 'Manila', country: 'Philippines', zone: 'Asia/Manila' },
  { city: 'Maputo', country: 'Mozambique', zone: 'Africa/Maputo' },
  { city: 'Melbourne', country: 'Australia', zone: 'Australia/Melbourne' },
  { city: 'Mexico City', country: 'Mexico', zone: 'America/Mexico_City' },
  { city: 'Miami', country: 'United States', zone: 'America/New_York' },
  { city: 'Milan', country: 'Italy', zone: 'Europe/Rome', aliases: ['Milano'] },
  { city: 'Mogadishu', country: 'Somalia', zone: 'Africa/Mogadishu' },
  { city: 'Monrovia', country: 'Liberia', zone: 'Africa/Monrovia' },
  { city: 'Montevideo', country: 'Uruguay', zone: 'America/Montevideo' },
  { city: 'Montreal', country: 'Canada', zone: 'America/Toronto' },
  { city: 'Moscow', country: 'Russia', zone: 'Europe/Moscow', aliases: ['Moskva'] },
  { city: 'Mumbai', country: 'India', zone: 'Asia/Kolkata', aliases: ['Bombay'] },
  { city: 'Munich', country: 'Germany', zone: 'Europe/Berlin', aliases: ['München'] },
  { city: 'Muscat', country: 'Oman', zone: 'Asia/Muscat' },
  { city: 'Nairobi', country: 'Kenya', zone: 'Africa/Nairobi' },
  { city: 'New Delhi', country: 'India', zone: 'Asia/Kolkata', aliases: ['Delhi', 'Dilli'] },
  { city: 'New York', country: 'United States', zone: 'America/New_York' },
  { city: 'Osaka', country: 'Japan', zone: 'Asia/Tokyo' },
  { city: 'Oslo', country: 'Norway', zone: 'Europe/Oslo' },
  { city: 'Panama City', country: 'Panama', zone: 'America/Panama' },
  { city: 'Paris', country: 'France', zone: 'Europe/Paris' },
  { city: 'Perth', country: 'Australia', zone: 'Australia/Perth' },
  { city: 'Phnom Penh', country: 'Cambodia', zone: 'Asia/Phnom_Penh' },
  { city: 'Prague', country: 'Czechia', zone: 'Europe/Prague', aliases: ['Praha'] },
  { city: 'Quito', country: 'Ecuador', zone: 'America/Guayaquil' },
  { city: 'Reykjavík', country: 'Iceland', zone: 'Atlantic/Reykjavik' },
  { city: 'Rio de Janeiro', country: 'Brazil', zone: 'America/Sao_Paulo' },
  { city: 'Riyadh', country: 'Saudi Arabia', zone: 'Asia/Riyadh' },
  { city: 'Rome', country: 'Italy', zone: 'Europe/Rome', aliases: ['Roma'] },
  { city: 'San José', country: 'Costa Rica', zone: 'America/Costa_Rica', aliases: ['San Jose'] },
  { city: 'San Salvador', country: 'El Salvador', zone: 'America/El_Salvador' },
  { city: 'San Francisco', country: 'United States', zone: 'America/Los_Angeles' },
  { city: 'Santiago', country: 'Chile', zone: 'America/Santiago' },
  { city: 'São Paulo', country: 'Brazil', zone: 'America/Sao_Paulo', aliases: ['Sao Paulo'] },
  { city: 'Seoul', country: 'South Korea', zone: 'Asia/Seoul' },
  { city: 'Shanghai', country: 'China', zone: 'Asia/Shanghai' },
  { city: 'Singapore', country: 'Singapore', zone: 'Asia/Singapore' },
  { city: 'Sapporo', country: 'Japan', zone: 'Asia/Tokyo' },
  { city: 'Stockholm', country: 'Sweden', zone: 'Europe/Stockholm' },
  { city: 'Sydney', country: 'Australia', zone: 'Australia/Sydney' },
  { city: 'Taipei', country: 'Taiwan', zone: 'Asia/Taipei' },
  { city: 'Tashkent', country: 'Uzbekistan', zone: 'Asia/Tashkent' },
  { city: 'Tbilisi', country: 'Georgia', zone: 'Asia/Tbilisi' },
  { city: 'Tehran', country: 'Iran', zone: 'Asia/Tehran' },
  { city: 'Tel Aviv', country: 'Israel', zone: 'Asia/Tel_Aviv' },
  { city: 'Tokyo', country: 'Japan', zone: 'Asia/Tokyo' },
  { city: 'Toronto', country: 'Canada', zone: 'America/Toronto' },
  { city: 'Tunis', country: 'Tunisia', zone: 'Africa/Tunis' },
  { city: 'Ulaanbaatar', country: 'Mongolia', zone: 'Asia/Ulaanbaatar' },
  { city: 'Vancouver', country: 'Canada', zone: 'America/Vancouver' },
  { city: 'Vienna', country: 'Austria', zone: 'Europe/Vienna', aliases: ['Wien'] },
  { city: 'Vientiane', country: 'Laos', zone: 'Asia/Vientiane' },
  { city: 'Warsaw', country: 'Poland', zone: 'Europe/Warsaw', aliases: ['Warszawa'] },
  { city: 'Windhoek', country: 'Namibia', zone: 'Africa/Windhoek' },
  { city: 'Yangon', country: 'Myanmar', zone: 'Asia/Yangon', aliases: ['Rangoon'] },
  { city: 'Yerevan', country: 'Armenia', zone: 'Asia/Yerevan' },
  { city: 'Zürich', country: 'Switzerland', zone: 'Europe/Zurich', aliases: ['Zurich'] },
  { city: 'Benghazi', country: 'Libya', zone: 'Africa/Tripoli' },
  { city: 'Kigali', country: 'Rwanda', zone: 'Africa/Kigali' },
  { city: 'Tripoli', country: 'Libya', zone: 'Africa/Tripoli' },
  { city: 'Zagreb', country: 'Croatia', zone: 'Europe/Zagreb' },
];

const CITY_LOOKUP = new Map();
for (const option of CITY_OPTIONS) {
  for (const name of [option.city, ...(option.aliases || [])]) {
    const key = normalizeCity(name);
    const existing = CITY_LOOKUP.get(key);
    if (existing && existing.zone !== option.zone) {
      throw new Error(
        `Conflicting time zones for normalized city name "${key}": ${existing.zone} and ${option.zone}`,
      );
    }
    if (!existing) CITY_LOOKUP.set(key, option);
  }
}

export function resolveCity(value) {
  return CITY_LOOKUP.get(normalizeCity(value));
}

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
    <select class="clock-city-browser" aria-label="Browse cities by region">
      <option value="">Browse cities by region…</option>
    </select>
    <span class="util-muted" style="margin-left:auto">View</span>
    <button type="button" class="util-action clock-layout" aria-label="Change clock layout"></button>
    <button type="button" class="util-action clock-face-mode" aria-label="Change clock face"></button>
  </div><div class="clock-list"></div>`;
  const list = root.querySelector('.clock-list');
  const suggestions = root.querySelector('datalist');
  suggestions.id = listId;
  const addInput = root.querySelector('.clock-zone-input');
  addInput.setAttribute('list', listId);
  const cityBrowser = root.querySelector('.clock-city-browser');
  const citiesByRegion = new Map();
  for (const city of CITY_OPTIONS) {
    const region = getCityRegion(city.zone);
    if (!citiesByRegion.has(region)) citiesByRegion.set(region, []);
    citiesByRegion.get(region).push(city);
  }
  for (const [region, cities] of [...citiesByRegion].sort(([a], [b]) => a.localeCompare(b))) {
    const group = document.createElement('optgroup');
    group.label = region;
    for (const { index, city } of cities
      .map(city => ({ city, index: CITY_OPTIONS.indexOf(city) }))
      .sort((a, b) => a.city.city.localeCompare(b.city.city))) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${city.city} · ${city.country}`;
      group.append(option);
    }
    cityBrowser.append(group);
  }
  const zoneOptions = new Set(CITY_OPTIONS.map(option => option.zone));
  for (const zone of ZONE_SUGGESTIONS) {
    if (zoneOptions.has(zone)) continue;
    const option = document.createElement('option');
    option.value = zone;
    option.label = zone === 'UTC' ? 'Coordinated Universal Time' : 'Time zone';
    suggestions.append(option);
  }
  for (const { city, country, zone, aliases = [] } of [...CITY_OPTIONS].sort((a, b) => a.city.localeCompare(b.city))) {
    const suggestedNames = new Set();
    for (const name of [city, ...aliases]) {
      const suggestionKey = name.trim().toLocaleLowerCase();
      if (suggestedNames.has(suggestionKey)) continue;
      suggestedNames.add(suggestionKey);
      const option = document.createElement('option');
      option.value = name;
      option.label = name === city
        ? `${country} · ${zone}`
        : `Also known as ${city} · ${country} · ${zone}`;
      suggestions.append(option);
    }
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const formatDigitalTime = (date, zone) => {
    const use24HourTime = Boolean(ctx?.is24HourTime?.());
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: use24HourTime ? '2-digit' : 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: !use24HourTime,
    }).format(date);
  };
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
        item.querySelector('time').textContent = formatDigitalTime(date, zone);
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
        item.querySelector('time').textContent = formatDigitalTime(date, zone);
        item.querySelector('.clock-date').textContent = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date).map(part => [part.type, part.value]));
        const face = item.querySelector('.clock-face');
        face.style.setProperty('--hour', `${(Number(parts.hour) % 12) * 30 + Number(parts.minute) / 2}deg`);
        face.style.setProperty('--minute', `${Number(parts.minute) * 6}deg`);
      });
    }, 1000);
  };
  const addClock = value => {
    const input = root.querySelector('.clock-zone-input');
    const entry = typeof value === 'string' ? value.trim() : value;
    const city = typeof entry === 'string' ? resolveCity(entry) : entry;
    const zone = city?.zone || entry;
    try { new Intl.DateTimeFormat(undefined, { timeZone: zone }); }
    catch { input.setCustomValidity('Choose a city from the suggestions or enter a valid IANA time zone.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    if (!prefs.zones.includes(zone)) prefs.zones.push(zone);
    if (city) prefs.cityLabels[zone] = city.city;
    if (typeof entry === 'string') input.value = '';
    persist(); render();
  };
  root.querySelector('.clock-add').addEventListener('click', () => {
    addClock(root.querySelector('.clock-zone-input').value);
  });
  cityBrowser.addEventListener('change', () => {
    const city = CITY_OPTIONS[Number(cityBrowser.value)];
    if (city) addClock(city);
    cityBrowser.value = '';
  });
  addInput.addEventListener('input', () => addInput.setCustomValidity(''));
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('.clock-add').click(); });
  root.querySelector('.clock-layout').addEventListener('click', () => { prefs.layout = prefs.layout === 'grid' ? 'list' : 'grid'; persist(); render(); });
  root.querySelector('.clock-face-mode').addEventListener('click', () => { prefs.face = prefs.face === 'analog' ? 'digital' : 'analog'; persist(); render(); });
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => clearInterval(interval) };
  render();
  return root;
}

export function normalizeCity(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, '');
}

function getCityRegion(zone) {
  if (zone.startsWith('America/')) return 'Americas';
  if (zone.startsWith('Africa/')) return 'Africa';
  if (zone.startsWith('Asia/')) return 'Asia';
  if (zone.startsWith('Europe/') || zone.startsWith('Atlantic/')) return 'Europe';
  if (zone.startsWith('Australia/') || zone.startsWith('Pacific/')) return 'Oceania';
  return 'Other';
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
