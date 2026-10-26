'use strict';

const KEY = 'personal-desktop-world-clock-v1';
const DEFAULT_ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
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

export function createCityLookup(options) {
  const lookup = new Map();
  for (const option of options) {
    for (const name of [option.city, ...(option.aliases || [])]) {
      const key = normalizeCity(name);
      const existing = lookup.get(key);
      if (existing && existing.zone !== option.zone) {
        throw new Error(
          `Conflicting time zones for normalized city name "${key}": ${existing.zone} and ${option.zone}`,
        );
      }
      if (!existing) lookup.set(key, option);
    }
  }
  return lookup;
}

const CITY_LOOKUP = createCityLookup(CITY_OPTIONS);

export function resolveCity(value) {
  return CITY_LOOKUP.get(normalizeCity(value));
}

export function findCitySuggestions(value, options = CITY_OPTIONS, limit = 5) {
  const query = normalizeCity(value);
  if (query.length < 4 || query.length > 40) return [];

  const lookup = createCityLookup(options);
  if (lookup.has(query)) return [];

  const suggestions = [];
  for (const city of options) {
    const names = [city.city, ...(city.aliases || [])].map(normalizeCity);
    const maxDistance = Math.max(query.length, ...names.map(name => name.length)) >= 9 ? 2 : 1;
    const distance = Math.min(...names.map(name => cityNameDistance(query, name)));
    if (distance > maxDistance) continue;
    suggestions.push({ city, distance });
  }

  return suggestions
    .sort((a, b) => a.distance - b.distance || a.city.city.localeCompare(b.city.city))
    .slice(0, limit)
    .map(({ city }) => city);
}

function cityNameDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1));
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + substitutionCost,
      );
      if (
        i > 1 && j > 1
        && left[i - 1] === right[j - 2]
        && left[i - 2] === right[j - 1]
      ) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

let nextClockId = 1;

export function buildWorldClock(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app clock-app';
  let prefs = readPrefs();
  let interval;
  let searchTimer = null;
  let searchController = null;
  let searchRequest = 0;
  let activeSuggestion = -1;
  const listId = `clock-places-${nextClockId++}`;
  root.innerHTML = `<div class="clock-controls">
    <div class="clock-search">
      <input class="clock-zone-input util-field" type="text" role="combobox" aria-label="City or time zone"
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}"
        placeholder="Search any city, country, or time zone" autocomplete="off">
      <div class="clock-place-suggestions menu-popover" id="${listId}" role="listbox" aria-label="Place suggestions" hidden></div>
    </div>
    <button type="button" class="util-action clock-add">Add clock</button>
    <span class="util-muted clock-search-status" role="status" aria-live="polite"></span>
    <span class="util-muted" style="margin-left:auto">View</span>
    <button type="button" class="util-action clock-layout" aria-label="Change clock layout"></button>
    <button type="button" class="util-action clock-face-mode" aria-label="Change clock face"></button>
  </div><div class="clock-list"></div>`;
  const list = root.querySelector('.clock-list');
  const addInput = root.querySelector('.clock-zone-input');
  const placeSuggestions = root.querySelector('.clock-place-suggestions');
  const searchStatus = root.querySelector('.clock-search-status');
  let currentPlaces = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const closeSuggestions = () => {
    placeSuggestions.hidden = true;
    addInput.setAttribute('aria-expanded', 'false');
    addInput.removeAttribute('aria-activedescendant');
    activeSuggestion = -1;
  };
  const setActiveSuggestion = index => {
    const options = [...placeSuggestions.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    activeSuggestion = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      const active = optionIndex === activeSuggestion;
      option.setAttribute('aria-selected', String(active));
      if (active) {
        addInput.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  };
  const formatPlaceDetail = place => [place.admin1, place.country, place.zone]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(' · ');
  const localPlaceMatches = query => {
    const normalizedQuery = normalizeCity(query);
    if (normalizedQuery.length < 2) return [];
    const matches = CITY_OPTIONS.map(city => {
      const names = [city.city, ...(city.aliases || [])];
      const exact = names.some(name => normalizeCity(name) === normalizedQuery);
      const nameMatch = names.some(name => normalizeCity(name).includes(normalizedQuery));
      const countryMatch = normalizeCity(city.country).includes(normalizedQuery);
      if (!exact && !nameMatch && !countryMatch) return null;
      return {
        city: city.city,
        country: city.country,
        zone: city.zone,
        admin1: '',
        rank: exact ? 0 : nameMatch ? 1 : 2,
      };
    }).filter(Boolean);
    if (!matches.length) {
      return findCitySuggestions(query).map(city => ({
        city: city.city, country: city.country, zone: city.zone, admin1: '', rank: 3,
      }));
    }
    return matches.sort((a, b) => a.rank - b.rank || a.city.localeCompare(b.city)).slice(0, 8);
  };
  const mergePlaces = (local, remote) => {
    const results = [];
    const seen = new Set();
    for (const place of [...local, ...remote]) {
      if (!place?.city || !place?.zone) continue;
      const key = `${normalizeCity(place.city)}|${normalizeCity(place.country || '')}|${place.zone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(place);
    }
    return results.slice(0, 10);
  };
  const renderPlaceSuggestions = places => {
    currentPlaces = places;
    activeSuggestion = -1;
    placeSuggestions.replaceChildren();
    places.forEach((place, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `${listId}-option-${index}`;
      option.className = 'clock-place-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const name = document.createElement('span');
      name.className = 'clock-place-name';
      name.textContent = place.city;
      const detail = document.createElement('span');
      detail.className = 'clock-place-detail';
      detail.textContent = formatPlaceDetail(place);
      option.append(name, detail);
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => {
        addClock(place);
        addInput.value = '';
        closeSuggestions();
        searchStatus.textContent = '';
        addInput.focus({ preventScroll: true });
      });
      placeSuggestions.append(option);
    });
    placeSuggestions.hidden = places.length === 0;
    addInput.setAttribute('aria-expanded', String(places.length > 0));
    addInput.removeAttribute('aria-activedescendant');
  };
  const searchPlaces = async query => {
    const request = ++searchRequest;
    searchController?.abort();
    searchController = new AbortController();
    const localMatches = localPlaceMatches(query);
    renderPlaceSuggestions(localMatches);
    searchStatus.textContent = localMatches.length ? 'Searching more places…' : 'Searching places…';

    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: query, count: '10', language: 'en', format: 'json' });
    try {
      const response = await fetch(url, { signal: searchController.signal });
      if (!response.ok) throw new Error('Place search is unavailable.');
      const data = await response.json();
      if (request !== searchRequest) return;
      const remoteMatches = (Array.isArray(data.results) ? data.results : [])
        .filter(place => typeof place.timezone === 'string' && place.timezone)
        .map(place => ({
          city: place.name,
          country: place.country || '',
          admin1: place.admin1 || '',
          zone: place.timezone,
        }));
      const places = mergePlaces(localMatches, remoteMatches);
      renderPlaceSuggestions(places);
      searchStatus.textContent = places.length
        ? `${places.length} place${places.length === 1 ? '' : 's'} found.`
        : 'No places found. You can enter a valid IANA time zone.';
    } catch (error) {
      if (error.name === 'AbortError' || request !== searchRequest) return;
      renderPlaceSuggestions(localMatches);
      searchStatus.textContent = localMatches.length
        ? 'Online place lookup is unavailable; showing matching known places.'
        : 'Place lookup is unavailable. You can still enter a valid IANA time zone.';
    }
  };
  const schedulePlaceSearch = () => {
    clearTimeout(searchTimer);
    searchController?.abort();
    searchRequest++;
    const query = addInput.value.trim();
    const normalizedQuery = normalizeCity(query);
    if (normalizedQuery.length < 2) {
      closeSuggestions();
      searchStatus.textContent = '';
      return;
    }
    const exactCity = resolveCity(query);
    if (exactCity && normalizeCity(exactCity.city) === normalizedQuery) {
      renderPlaceSuggestions([{
        city: exactCity.city, country: exactCity.country, zone: exactCity.zone, admin1: '',
      }]);
      searchStatus.textContent = 'Press Enter or choose the place to add its clock.';
      return;
    }
    searchStatus.textContent = 'Searching places…';
    searchTimer = setTimeout(() => searchPlaces(query), 240);
  };
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
    catch {
      input.setCustomValidity('Choose a place from the suggestions or enter a valid IANA time zone.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    clearTimeout(searchTimer);
    searchController?.abort();
    searchRequest++;
    if (!prefs.zones.includes(zone)) prefs.zones.push(zone);
    if (city?.city) prefs.cityLabels[zone] = city.city;
    input.value = '';
    closeSuggestions();
    searchStatus.textContent = '';
    persist(); render();
  };
  root.querySelector('.clock-add').addEventListener('click', () => {
    addClock(root.querySelector('.clock-zone-input').value);
  });
  addInput.addEventListener('input', () => {
    addInput.setCustomValidity('');
    schedulePlaceSearch();
  });
  addInput.addEventListener('focus', () => {
    if (addInput.value.trim().length >= 2) schedulePlaceSearch();
  });
  addInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !placeSuggestions.hidden) {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion + 1);
    } else if (event.key === 'ArrowUp' && !placeSuggestions.hidden) {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion < 0 ? currentPlaces.length - 1 : activeSuggestion - 1);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeSuggestion >= 0 && currentPlaces[activeSuggestion]) {
        addClock(currentPlaces[activeSuggestion]);
        closeSuggestions();
        searchStatus.textContent = '';
      } else {
        root.querySelector('.clock-add').click();
      }
    }
  });
  const closeOnOutsidePointer = event => {
    if (!root.contains(event.target)) closeSuggestions();
  };
  document.addEventListener('pointerdown', closeOnOutsidePointer);
  root.querySelector('.clock-layout').addEventListener('click', () => { prefs.layout = prefs.layout === 'grid' ? 'list' : 'grid'; persist(); render(); });
  root.querySelector('.clock-face-mode').addEventListener('click', () => { prefs.face = prefs.face === 'analog' ? 'digital' : 'analog'; persist(); render(); });
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => {
    clearInterval(interval);
    clearTimeout(searchTimer);
    searchController?.abort();
    document.removeEventListener('pointerdown', closeOnOutsidePointer);
  } };
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
