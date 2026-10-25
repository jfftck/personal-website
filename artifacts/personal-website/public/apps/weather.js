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

export function buildWeather(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app weather-app';
  let prefs = readPrefs();
  let requestToken = 0;
  let refreshTimer = null;
  const settingsTitleId = `${id || 'weather'}-settings-title`;
  showSetup();

  function stopRefreshTimer() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function scheduleRefresh() {
    stopRefreshTimer();
    if (!root.querySelector('.weather-panels')) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const selected = prefs.locations.find(item => item.location === prefs.activeLocation);
      if (selected) loadForecast(selected.location, selected.unit, { background: true });
    }, prefs.refreshMinutes * 60_000);
  }

  function showSetup(message = '') {
    stopRefreshTimer();
    requestToken++;
    const hasLocations = prefs.locations.length > 0;
    const selectedLocation = prefs.locations.find(item => item.location === prefs.activeLocation) || prefs.locations[0];
    let addingLocation = !hasLocations;
    root.innerHTML = `<form class="weather-setup">
      <div><span class="util-muted">Saved on this device</span><h2 style="margin:.15rem 0;font-size:1.35rem">Weather, where you are.</h2><p class="util-muted" style="margin:.25rem 0 0">Choose a saved place or add another location.</p></div>
      <div class="weather-saved-row">
        <label class="weather-saved-label">Saved location<select class="weather-saved-location"></select></label>
        <button class="util-action weather-remove" type="button">Remove saved location</button>
      </div>
      <label class="weather-location-label">New location<input class="weather-location" type="text" autocomplete="off" placeholder="City or town"></label>
      <label>Temperature units<select class="weather-unit" required><option value="" disabled>Choose a unit</option><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
      <div class="weather-error" role="status" aria-live="polite"></div>
      <div class="weather-setup-actions">
        <button class="util-action weather-submit" type="submit" style="background:rgba(183,205,118,.19)">Show forecast</button>
        <button class="util-action weather-add" type="button">Add another location</button>
        <button class="util-action weather-back" type="button">Back to saved locations</button>
      </div>
    </form>`;
    const form = root.querySelector('form');
    const savedRow = form.querySelector('.weather-saved-row');
    const savedSelect = form.querySelector('.weather-saved-location');
    const locationLabel = form.querySelector('.weather-location-label');
    const locationInput = form.querySelector('.weather-location');
    const addButton = form.querySelector('.weather-add');
    const backButton = form.querySelector('.weather-back');
    const removeButton = form.querySelector('.weather-remove');
    const unitSelect = form.querySelector('.weather-unit');
    prefs.locations.forEach(item => {
      const option = document.createElement('option');
      option.value = item.location;
      option.textContent = item.location;
      savedSelect.append(option);
    });
    if (selectedLocation) {
      savedSelect.value = selectedLocation.location;
      unitSelect.value = selectedLocation.unit;
    } else {
      unitSelect.value = '';
    }
    function renderLocationMode() {
      savedRow.hidden = addingLocation || !hasLocations;
      locationLabel.hidden = !addingLocation;
      locationInput.required = addingLocation;
      savedSelect.required = !addingLocation && hasLocations;
      addButton.hidden = addingLocation || !hasLocations;
      backButton.hidden = !addingLocation || !hasLocations;
      form.querySelector('.weather-submit').textContent = addingLocation ? 'Add & show forecast' : 'Show forecast';
    }
    function updateUnitForSelection() {
      const item = prefs.locations.find(place => place.location === savedSelect.value);
      unitSelect.value = item?.unit || '';
    }
    savedSelect.addEventListener('change', updateUnitForSelection);
    removeButton.addEventListener('click', () => {
      const location = savedSelect.value;
      const savedLocation = prefs.locations.find(item => item.location === location);
      if (!savedLocation) return;

      const isActive = prefs.activeLocation === savedLocation.location;
      const confirmation = `Remove “${savedLocation.location}” from your saved locations?${isActive ? ' Another saved location will become active.' : ''}`;
      if (!window.confirm(confirmation)) return;

      prefs.locations = prefs.locations.filter(item => item.location !== savedLocation.location);
      if (isActive) prefs.activeLocation = prefs.locations[0]?.location || '';
      savePrefs(prefs);
      showSetup(prefs.locations.length
        ? `Removed ${savedLocation.location} from saved locations.`
        : `Removed ${savedLocation.location}. Add a new location to see its forecast.`);
    });
    addButton.addEventListener('click', () => {
      addingLocation = true;
      locationInput.value = '';
      unitSelect.value = '';
      renderLocationMode();
      locationInput.focus({ preventScroll: true });
    });
    backButton.addEventListener('click', () => {
      addingLocation = false;
      updateUnitForSelection();
      renderLocationMode();
      savedSelect.focus({ preventScroll: true });
    });
    renderLocationMode();
    form.querySelector('.weather-error').textContent = message;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const location = addingLocation ? locationInput.value.trim() : savedSelect.value;
      const unit = unitSelect.value;
      if (!location) return;
      const existing = prefs.locations.find(item => item.location.toLocaleLowerCase() === location.toLocaleLowerCase());
      if (existing) {
        existing.unit = unit;
        prefs.activeLocation = existing.location;
      } else {
        prefs.locations.push({ location, unit });
        prefs.activeLocation = location;
      }
      savePrefs(prefs);
      await loadForecast(location, unit);
    });
    (addingLocation ? locationInput : savedSelect).focus({ preventScroll: true });
  }

  async function loadForecast(location, unit, { background = false } = {}) {
    stopRefreshTimer();
    const token = ++requestToken;
    if (!background) root.innerHTML = `<div class="weather-loading" role="status" aria-label="Loading forecast">
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
      if (!Array.isArray(geo.results) || !geo.results.length) {
        if (background) { setRefreshStatus('The latest weather update could not find this location.'); scheduleRefresh(); }
        else showSetup(`We couldn't find “${location}”. Check the spelling and try again.`);
        return;
      }
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
        if (background) { setRefreshStatus('The latest weather update did not include a forecast.'); scheduleRefresh(); }
        else showErrorState('No forecast is available for this place right now.', location, unit);
        return;
      }
      renderForecast(data, place, unit);
    } catch (error) {
      if (token !== requestToken) return;
      const message = error instanceof TypeError || error.message === 'network' ? 'The weather service could not be reached. Check your connection and try again.' : 'The forecast could not be loaded. Please try again.';
      if (background) { setRefreshStatus(`${message} The last available forecast is still shown.`); scheduleRefresh(); }
      else showErrorState(message, location, unit);
    }
  }

  function renderForecast(data, place, unit) {
    const current = data.current;
    const degrees = unit === 'fahrenheit' ? '°F' : '°C';
    const displayName = [place.name, place.admin1, place.country].filter((part, index, arr) => part && arr.indexOf(part) === index).join(', ');
    const unitWind = data.current_units?.wind_speed_10m || 'km/h';
    const condition = CONDITIONS[current.weather_code] || 'Current conditions';
    root.innerHTML = `<header class="weather-top">
      <div class="weather-top-tools">
        <select class="weather-location-select" aria-label="Weather location"></select>
        <button class="weather-settings-button" type="button" aria-label="Weather settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 4.8a9.2 9.2 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8.2 8.2 0 0 0-1.7-1L16.5 3h-4l-.4 2.7a8.2 8.2 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a9.2 9.2 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8.2 8.2 0 0 0 1.7 1l.4 2.7h4l.4-2.7a8.2 8.2 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"/></svg>
          <span class="sr-only">Settings</span>
        </button>
      </div>
      <a class="weather-credit" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo</a>
      <div class="weather-current"></div><div class="weather-place"></div><div class="weather-meta"></div>
      <div class="weather-refresh-status sr-only" role="status" aria-live="polite"></div>
    </header><div class="weather-panels">
      <section class="weather-panel"><h3>Hourly outlook</h3><div class="weather-list weather-hourly"></div></section>
      <section class="weather-panel"><h3>Next 7 days</h3><div class="weather-list weather-daily"></div></section>
    </div>
    <dialog class="weather-settings-dialog" aria-labelledby="${settingsTitleId}">
      <form class="weather-settings-form">
        <div class="weather-settings-heading"><h2 id="${settingsTitleId}">Weather settings</h2><button class="weather-settings-close" type="button" aria-label="Close settings">×</button></div>
        <label>Temperature units<select class="weather-settings-unit" required><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
        <label>Add a location<input class="weather-settings-location" type="text" autocomplete="off" placeholder="City or town"></label>
        <p class="weather-settings-hint">Leave the location blank to update the selected place.</p>
        <label>Update weather every <span class="weather-interval-field"><input class="weather-refresh-interval" type="number" min="5" max="1440" step="5" required><span>minutes</span></span></label>
        <p class="weather-settings-error" role="status" aria-live="polite"></p>
        <div class="weather-settings-actions"><button class="util-action weather-settings-cancel" type="button">Cancel</button><button class="util-action weather-settings-save" type="submit">Save settings</button></div>
      </form>
    </dialog>`;
    root.querySelector('.weather-current').textContent = `${Math.round(current.temperature_2m)}${degrees}`;
    root.querySelector('.weather-place').textContent = displayName;
    const locationSelect = root.querySelector('.weather-location-select');
    prefs.locations.forEach(item => {
      const option = document.createElement('option');
      option.value = item.location;
      option.textContent = item.location === prefs.activeLocation ? displayName : item.location;
      locationSelect.append(option);
    });
    locationSelect.value = prefs.activeLocation;
    locationSelect.addEventListener('change', () => {
      const selected = prefs.locations.find(item => item.location === locationSelect.value);
      if (!selected) return;
      prefs.activeLocation = selected.location;
      savePrefs(prefs);
      loadForecast(selected.location, selected.unit);
    });
    const dialog = root.querySelector('.weather-settings-dialog');
    root.querySelector('.weather-settings-button').addEventListener('click', () => {
      stopRefreshTimer();
      const selected = prefs.locations.find(item => item.location === prefs.activeLocation);
      dialog.querySelector('.weather-settings-unit').value = selected?.unit || unit;
      dialog.querySelector('.weather-refresh-interval').value = String(prefs.refreshMinutes);
      dialog.querySelector('.weather-settings-location').value = '';
      dialog.querySelector('.weather-settings-error').textContent = '';
      dialog.showModal();
      dialog.querySelector('.weather-settings-unit').focus({ preventScroll: true });
    });
    dialog.querySelector('.weather-settings-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.weather-settings-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', scheduleRefresh);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const nextUnit = dialog.querySelector('.weather-settings-unit').value;
      const nextInterval = Number(dialog.querySelector('.weather-refresh-interval').value);
      const newLocation = dialog.querySelector('.weather-settings-location').value.trim();
      if (!Number.isInteger(nextInterval) || nextInterval < 5 || nextInterval > 1440) {
        dialog.querySelector('.weather-settings-error').textContent = 'Choose an update interval from 5 to 1440 minutes.';
        return;
      }
      let selected = prefs.locations.find(item => item.location === prefs.activeLocation) || prefs.locations[0];
      if (newLocation) {
        selected = prefs.locations.find(item => item.location.toLocaleLowerCase() === newLocation.toLocaleLowerCase());
        if (!selected) {
          selected = { location: newLocation, unit: nextUnit };
          prefs.locations.push(selected);
        }
        prefs.activeLocation = selected.location;
      }
      if (!selected) return;
      selected.unit = nextUnit;
      prefs.refreshMinutes = nextInterval;
      savePrefs(prefs);
      dialog.close();
      loadForecast(selected.location, selected.unit);
    });
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
    scheduleRefresh();
  }

  function setRefreshStatus(message) {
    const status = root.querySelector('.weather-refresh-status');
    if (status) status.textContent = message;
  }

  function showErrorState(message, location, unit) {
    stopRefreshTimer();
    root.innerHTML = `<div class="weather-state"><p class="weather-error"></p><p class="util-muted">Your saved location and unit are still available.</p><div style="display:flex;justify-content:center;gap:.5rem"><button class="util-action weather-retry" type="button">Try again</button><button class="util-action weather-change" type="button">Change setup</button></div></div>`;
    root.querySelector('.weather-error').textContent = message;
    root.querySelector('.weather-retry').addEventListener('click', () => loadForecast(location, unit));
    root.querySelector('.weather-change').addEventListener('click', () => showSetup());
  }
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => { stopRefreshTimer(); requestToken++; } };
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
    const refreshMinutes = Number.isInteger(data?.refreshMinutes) && data.refreshMinutes >= 5 && data.refreshMinutes <= 1440 ? data.refreshMinutes : 60;
    if (Array.isArray(data?.locations)) {
      const locations = data.locations
        .filter(item => item && typeof item.location === 'string' && item.location.trim())
        .map(item => ({ location: item.location.trim(), unit: ['fahrenheit', 'celsius'].includes(item.unit) ? item.unit : '' }))
        .filter((item, index, items) => items.findIndex(other => other.location.toLocaleLowerCase() === item.location.toLocaleLowerCase()) === index);
      const activeLocation = locations.some(item => item.location === data.activeLocation) ? data.activeLocation : locations[0]?.location || '';
      return { locations, activeLocation, refreshMinutes };
    }
    if (data && typeof data.location === 'string' && data.location.trim()) {
      return {
        locations: [{ location: data.location.trim(), unit: ['fahrenheit', 'celsius'].includes(data.unit) ? data.unit : '' }],
        activeLocation: data.location.trim(),
        refreshMinutes,
      };
    }
  } catch {}
  return { locations: [], activeLocation: '', refreshMinutes: 60 };
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
