'use strict';

const PREF_KEY = 'personal-desktop-weather-setup-v1';
const CONDITIONS = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};

export function buildWeather() {
  const root = document.createElement('section');
  root.className = 'utility-app weather-app';
  let prefs = readPrefs();
  let requestToken = 0;
  showSetup();

  function showSetup(message = '') {
    root.innerHTML = `<form class="weather-setup">
      <div><span class="util-muted">A quick local setup</span><h2 style="margin:.15rem 0;font-size:1.35rem">Weather, where you are.</h2><p class="util-muted" style="margin:.25rem 0 0">Choose a place to fetch its current forecast.</p></div>
      <label>Location<input class="weather-location" type="text" required autocomplete="off" placeholder="City or town"></label>
      <label>Temperature units<select class="weather-unit" required><option value="" disabled>Choose a unit</option><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
      <div class="weather-error" role="status" aria-live="polite"></div>
      <button class="util-action" type="submit" style="background:rgba(183,205,118,.19)">Show forecast</button>
    </form>`;
    const form = root.querySelector('form');
    form.querySelector('.weather-location').value = prefs.location || '';
    form.querySelector('.weather-unit').value = prefs.unit || '';
    form.querySelector('.weather-error').textContent = message;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const location = form.querySelector('.weather-location').value.trim();
      const unit = form.querySelector('.weather-unit').value;
      if (!location) return;
      prefs = { location, unit };
      try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
      await loadForecast(location, unit);
    });
    form.querySelector('.weather-location').focus({ preventScroll: true });
  }

  async function loadForecast(location, unit) {
    const token = ++requestToken;
    root.innerHTML = `<div class="weather-loading" role="status" aria-label="Loading forecast">
      <div class="weather-loading-top"><div class="weather-skeleton weather-skeleton-temp"></div><div class="weather-skeleton weather-skeleton-line"></div><div class="weather-skeleton weather-skeleton-meta"></div></div>
      <div class="weather-loading-panel"><div class="weather-skeleton weather-skeleton-line"></div><div class="weather-skeleton weather-skeleton-line"></div><div class="weather-skeleton weather-skeleton-line"></div></div>
      <span class="sr-only">Finding ${escapeHTML(location)} and loading forecast…</span>
    </div>`;
    try {
      const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
      geoUrl.search = new URLSearchParams({ name: location, count: '1', language: 'en', format: 'json' });
      const geoResponse = await fetch(geoUrl);
      if (!geoResponse.ok) throw new Error('network');
      const geo = await geoResponse.json();
      if (token !== requestToken) return;
      if (!Array.isArray(geo.results) || !geo.results.length) { showSetup(`We couldn't find “${location}”. Check the spelling and try again.`); return; }
      const place = geo.results[0];
      const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
      forecastUrl.search = new URLSearchParams({
        latitude: String(place.latitude), longitude: String(place.longitude),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
        temperature_unit: unit, wind_speed_unit: 'kmh', precipitation_unit: 'mm',
        timezone: place.timezone || 'auto', forecast_days: '7',
      });
      const response = await fetch(forecastUrl);
      if (!response.ok) throw new Error('network');
      const data = await response.json();
      if (token !== requestToken) return;
      if (!data.current || !data.hourly?.time?.length || !data.daily?.time?.length) {
        showErrorState('No forecast is available for this place right now.', location, unit); return;
      }
      renderForecast(data, place, unit);
    } catch (error) {
      if (token !== requestToken) return;
      showErrorState(error instanceof TypeError || error.message === 'network' ? 'The weather service could not be reached. Check your connection and try again.' : 'The forecast could not be loaded. Please try again.', location, unit);
    }
  }

  function renderForecast(data, place, unit) {
    const current = data.current;
    const degrees = unit === 'fahrenheit' ? '°F' : '°C';
    const displayName = [place.name, place.admin1, place.country].filter((part, index, arr) => part && arr.indexOf(part) === index).join(', ');
    const unitWind = data.current_units?.wind_speed_10m || 'km/h';
    const condition = CONDITIONS[current.weather_code] || 'Current conditions';
    root.innerHTML = `<header class="weather-top">
      <a class="weather-credit" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo</a>
      <div class="weather-current"></div><div class="weather-place"></div><div class="weather-meta"></div>
    </header><div class="weather-panels">
      <section class="weather-panel"><h3>Hourly outlook</h3><div class="weather-list weather-hourly"></div></section>
      <section class="weather-panel"><h3>Next 7 days</h3><div class="weather-list weather-daily"></div></section>
    </div>`;
    root.querySelector('.weather-current').textContent = `${Math.round(current.temperature_2m)}${degrees}`;
    root.querySelector('.weather-place').textContent = displayName;
    const meta = root.querySelector('.weather-meta');
    [
      condition,
      `Feels like ${Math.round(current.apparent_temperature)}${degrees}`,
      `${Math.round(current.relative_humidity_2m)}% humidity`,
      `${Math.round(current.wind_speed_10m)} ${unitWind} wind`,
      `${current.precipitation} ${data.current_units?.precipitation || 'mm'} precipitation`,
    ].forEach(text => { const span = document.createElement('span'); span.textContent = text; meta.append(span); });
    const hourly = root.querySelector('.weather-hourly');
    let start = data.hourly.time.findIndex(time => time >= current.time);
    if (start < 0) start = 0;
    const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    for (let i = start; i < Math.min(start + 24, data.hourly.time.length); i++) {
      appendRow(hourly, hourFormat.format(parseLocalTimestamp(data.hourly.time[i])), `${Math.round(data.hourly.temperature_2m[i])}${degrees}`, `${CONDITIONS[data.hourly.weather_code[i]] || '—'} · ${data.hourly.precipitation_probability?.[i] ?? '—'}% rain`);
    }
    const daily = root.querySelector('.weather-daily');
    const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    for (let i = 0; i < data.daily.time.length; i++) {
      appendRow(daily, i === 0 ? 'Today' : dayFormat.format(parseLocalTimestamp(`${data.daily.time[i]}T12:00`)), `${Math.round(data.daily.temperature_2m_max[i])}${degrees} / ${Math.round(data.daily.temperature_2m_min[i])}${degrees}`, CONDITIONS[data.daily.weather_code[i]] || '—');
    }
  }

  function showErrorState(message, location, unit) {
    root.innerHTML = `<div class="weather-state"><p class="weather-error"></p><p class="util-muted">Your saved location and unit are still available.</p><div style="display:flex;justify-content:center;gap:.5rem"><button class="util-action weather-retry" type="button">Try again</button><button class="util-action weather-change" type="button">Change setup</button></div></div>`;
    root.querySelector('.weather-error').textContent = message;
    root.querySelector('.weather-retry').addEventListener('click', () => loadForecast(location, unit));
    root.querySelector('.weather-change').addEventListener('click', () => showSetup());
  }
  return root;
}

function appendRow(container, first, second, third) {
  const row = document.createElement('div');
  row.className = 'weather-row';
  [first, second, third].forEach(text => { const span = document.createElement('span'); span.textContent = text; row.append(span); });
  container.append(row);
}

function parseLocalTimestamp(value) {
  const localDateTime = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)?.[0];
  return new Date(`${localDateTime || value}Z`);
}

function readPrefs() {
  try {
    const data = JSON.parse(localStorage.getItem(PREF_KEY));
    if (data && typeof data.location === 'string') return { location: data.location, unit: ['fahrenheit', 'celsius'].includes(data.unit) ? data.unit : '' };
  } catch {}
  return { location: '', unit: '' };
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
