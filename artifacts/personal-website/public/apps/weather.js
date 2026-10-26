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
const WEATHER_DETAIL_OPTIONS = [
  { key: 'feelsLike', label: 'Feels-like temperature' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'wind', label: 'Wind speed' },
  { key: 'precipitation', label: 'Precipitation' },
  { key: 'rainChance', label: 'Hourly rain chance' },
];

function readWeatherDetails(source) {
  return Object.fromEntries(WEATHER_DETAIL_OPTIONS.map(({ key }) => [
    key,
    typeof source?.[key] === 'boolean' ? source[key] : true,
  ]));
}

export function buildWeather(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app weather-app';
  let prefs = readPrefs();
  let requestToken = 0;
  let refreshTimer = null;
  let locationMenu = null;
  let locationButton = null;
  const settingsTitleId = `${id || 'weather'}-settings-title`;
  function setLocationMenuOpen(open, focusIndex = null) {
    if (!locationMenu || !locationButton) return;
    locationMenu.hidden = !open;
    locationButton.setAttribute('aria-expanded', String(open));
    if (open && focusIndex !== null) {
      const options = locationMenu.querySelectorAll('.weather-location-option');
      options[Math.max(0, Math.min(focusIndex, options.length - 1))]?.focus({ preventScroll: true });
    }
  }
  const dismissLocationMenu = event => {
    if (locationMenu && !root.contains(event.target)) setLocationMenuOpen(false);
  };
  document.addEventListener('pointerdown', dismissLocationMenu, true);
  const initialLocation = prefs.locations.find(item => item.location === prefs.activeLocation)
    || prefs.locations[0];
  if (initialLocation && ['celsius', 'fahrenheit'].includes(initialLocation.unit)) {
    savePrefs(prefs);
    loadForecast(initialLocation.location, initialLocation.unit);
  } else {
    showSetup();
  }

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

  function removeSavedLocation(location) {
    const savedLocation = prefs.locations.find(item => item.location === location);
    if (!savedLocation) return null;

    const wasActive = prefs.activeLocation === savedLocation.location;
    const confirmation = `Remove “${savedLocation.location}” from your saved locations?${wasActive
      ? prefs.locations.length > 1
        ? ' Another saved location will become active.'
        : ' Weather will return to setup.'
      : ''}`;
    if (!window.confirm(confirmation)) return null;

    const nextPrefs = {
      ...prefs,
      locations: prefs.locations.filter(item => item.location !== savedLocation.location),
    };
    if (wasActive) nextPrefs.activeLocation = nextPrefs.locations[0]?.location || '';
    if (!savePrefs(nextPrefs)) return { failed: true };
    prefs = nextPrefs;
    return { location: savedLocation.location, wasActive };
  }

  function showSetup(message = '') {
    stopRefreshTimer();
    setLocationMenuOpen(false);
    locationMenu = null;
    locationButton = null;
    requestToken++;
    root.innerHTML = `<form class="weather-setup">
      <div><h2 style="margin:.15rem 0;font-size:1.35rem">Weather, where you are.</h2><p class="util-muted" style="margin:.25rem 0 0">Add a location and choose its temperature unit.</p></div>
      <label class="weather-location-label">Location<input class="weather-location util-field" type="text" autocomplete="off" placeholder="City or town" required></label>
      <label>Temperature units<select class="weather-unit util-field" required><option value="" disabled>Choose a unit</option><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
      <div class="weather-error" role="status" aria-live="polite"></div>
      <div class="weather-setup-actions">
        <button class="util-action weather-submit" type="submit">Show forecast</button>
      </div>
    </form>`;
    const form = root.querySelector('form');
    const locationInput = form.querySelector('.weather-location');
    const unitSelect = form.querySelector('.weather-unit');
    form.querySelector('.weather-error').textContent = message;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const location = locationInput.value.trim();
      const unit = unitSelect.value;
      if (!location) return;
      const nextPrefs = {
        ...prefs,
        locations: prefs.locations.map(item => ({ ...item })),
      };
      const existing = nextPrefs.locations.find(item => item.location.toLocaleLowerCase() === location.toLocaleLowerCase());
      if (existing) {
        existing.unit = unit;
        nextPrefs.activeLocation = existing.location;
      } else {
        nextPrefs.locations.push({ location, unit });
        nextPrefs.activeLocation = location;
      }
      if (!savePrefs(nextPrefs)) {
        form.querySelector('.weather-error').textContent = 'Your location change was not saved. Browser storage is unavailable; try again.';
        return;
      }
      prefs = nextPrefs;
      await loadForecast(location, unit);
    });
    locationInput.focus({ preventScroll: true });
  }

  async function loadForecast(location, unit, { background = false } = {}) {
    stopRefreshTimer();
    setLocationMenuOpen(false);
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
        <div class="weather-location-picker">
          <button class="weather-location-button util-action" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${id || 'weather'}-location-menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-7.2 8-13a8 8 0 1 0-16 0c0 5.8 8 13 8 13Zm0-10.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>
            <span class="weather-location-current"></span><span class="weather-location-unit"></span>
            <svg class="weather-location-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="weather-location-menu" id="${id || 'weather'}-location-menu" role="menu" aria-label="Saved weather locations" hidden></div>
        </div>
        <button class="weather-settings-button" type="button" aria-label="Weather settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 4.8a9.2 9.2 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8.2 8.2 0 0 0-1.7-1L16.5 3h-4l-.4 2.7a8.2 8.2 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a9.2 9.2 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8.2 8.2 0 0 0 1.7 1l.4 2.7h4l.4-2.7a8.2 8.2 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"/></svg>
          <span class="sr-only">Settings</span>
        </button>
      </div>
      <a class="weather-credit" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo</a>
      <p class="weather-save-status weather-error" role="status" aria-live="polite"></p>
      <div class="weather-current"></div><div class="weather-place"></div><div class="weather-high-low" aria-label="Today's high and low"></div><div class="weather-meta"></div>
      <div class="weather-refresh-status sr-only" role="status" aria-live="polite"></div>
    </header><div class="weather-panels">
      <section class="weather-panel"><h3>Hourly outlook</h3><div class="weather-list weather-hourly"></div></section>
      <section class="weather-panel"><h3>Next 7 days</h3><div class="weather-list weather-daily"></div></section>
    </div>
    <dialog class="weather-settings-dialog" aria-labelledby="${settingsTitleId}">
      <form class="weather-settings-form">
        <div class="weather-settings-heading"><h2 id="${settingsTitleId}">Weather settings</h2><button class="weather-settings-close" type="button" aria-label="Close settings">×</button></div>
        <label>Temperature units<select class="weather-settings-unit util-field" required><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
        <label>Add a location<input class="weather-settings-location util-field" type="text" autocomplete="off" placeholder="City or town"></label>
        <p class="weather-settings-hint">Leave the location blank to update the selected place.</p>
        <fieldset class="weather-detail-settings"><legend>Additional weather details</legend>
          ${WEATHER_DETAIL_OPTIONS.map(({ key, label }) => `<label><input class="weather-detail-toggle" type="checkbox" data-weather-detail="${key}"> ${label}</label>`).join('')}
        </fieldset>
        <section class="weather-settings-saved" aria-label="Saved locations">
          <h3>Saved locations</h3>
          <div class="weather-settings-locations"></div>
        </section>
        <label>Update weather every <span class="weather-interval-field"><input class="weather-refresh-interval util-field" type="number" min="5" max="1440" step="5" required><span>minutes</span></span></label>
        <p class="weather-settings-error" role="status" aria-live="polite"></p>
        <div class="weather-settings-actions"><button class="util-action weather-settings-cancel" type="button">Cancel</button><button class="util-action weather-settings-save" type="submit">Save settings</button></div>
      </form>
    </dialog>`;
    root.querySelector('.weather-current').textContent = `${Math.round(current.temperature_2m)}${degrees}`;
    root.querySelector('.weather-place').textContent = displayName;
    const todayHigh = data.daily.temperature_2m_max?.[0];
    const todayLow = data.daily.temperature_2m_min?.[0];
    if (Number.isFinite(todayHigh) && Number.isFinite(todayLow)) {
      root.querySelector('.weather-high-low').textContent = `High ${Math.round(todayHigh)}${degrees} · Low ${Math.round(todayLow)}${degrees}`;
    } else {
      root.querySelector('.weather-high-low').hidden = true;
    }
    locationButton = root.querySelector('.weather-location-button');
    locationMenu = root.querySelector('.weather-location-menu');
    locationButton.dataset.location = prefs.activeLocation;
    locationButton.setAttribute('aria-label', `Switch weather location; currently ${displayName}, ${degrees}`);
    locationButton.title = `${displayName} · ${degrees}`;
    locationButton.querySelector('.weather-location-current').textContent = displayName;
    locationButton.querySelector('.weather-location-unit').textContent = degrees;
    const savedLocations = root.querySelector('.weather-settings-locations');
    function updateSavedLocationControls() {
      locationMenu.replaceChildren();
      savedLocations.replaceChildren();
      prefs.locations.forEach(item => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'weather-location-option';
        option.setAttribute('role', 'menuitemradio');
        option.setAttribute('aria-checked', String(item.location === prefs.activeLocation));
        option.dataset.location = item.location;
        const optionName = document.createElement('span');
        optionName.className = 'weather-location-option-name';
        optionName.textContent = item.location === prefs.activeLocation ? displayName : item.location;
        const optionUnit = document.createElement('span');
        optionUnit.className = 'weather-location-option-unit';
        optionUnit.textContent = item.unit === 'fahrenheit' ? '°F' : '°C';
        option.append(optionName, optionUnit);
        locationMenu.append(option);

        const row = document.createElement('div');
        row.className = 'weather-settings-location-row';
        const name = document.createElement('span');
        name.textContent = `${item.location} · ${item.unit === 'fahrenheit' ? '°F' : '°C'}`;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'util-action weather-remove weather-settings-remove';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${item.location}`);
        removeButton.addEventListener('click', () => removeFromForecast(item.location));
        row.append(name, removeButton);
        savedLocations.append(row);
      });
    }
    updateSavedLocationControls();
    function chooseWeatherLocation(location) {
      const selected = prefs.locations.find(item => item.location === location);
      if (!selected) return;
      const previousLocation = prefs.activeLocation;
      const nextPrefs = { ...prefs, activeLocation: selected.location };
      if (!savePrefs(nextPrefs)) {
        setSaveStatus('Your location change was not saved. Browser storage is unavailable; try again.');
        return;
      }
      prefs = nextPrefs;
      setSaveStatus('');
      setLocationMenuOpen(false);
      loadForecast(selected.location, selected.unit);
    }
    locationButton.addEventListener('click', () => setLocationMenuOpen(locationMenu.hidden));
    locationButton.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setLocationMenuOpen(true, 0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setLocationMenuOpen(true, locationMenu.querySelectorAll('.weather-location-option').length - 1);
      } else if (event.key === 'Escape') {
        setLocationMenuOpen(false);
      }
    });
    locationMenu.addEventListener('click', event => {
      const option = event.target.closest('.weather-location-option');
      if (option && locationMenu.contains(option)) chooseWeatherLocation(option.dataset.location);
    });
    locationMenu.addEventListener('keydown', event => {
      const options = [...locationMenu.querySelectorAll('.weather-location-option')];
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        setLocationMenuOpen(false);
        locationButton.focus({ preventScroll: true });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? options.length - 1
            : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[nextIndex]?.focus({ preventScroll: true });
      }
    });
    function removeFromForecast(location) {
      const removed = removeSavedLocation(location);
      if (!removed) return;
      if (removed.failed) {
        if (dialog.open) dialog.querySelector('.weather-settings-error').textContent = 'Your location change was not saved. Browser storage is unavailable; try again.';
        else setSaveStatus('Your location change was not saved. Browser storage is unavailable; try again.');
        return;
      }
      setSaveStatus('');
      dialog.querySelector('.weather-settings-error').textContent = '';
      if (removed.wasActive) {
        if (prefs.locations.length) {
          const nextLocation = prefs.locations.find(item => item.location === prefs.activeLocation);
          if (nextLocation) loadForecast(nextLocation.location, nextLocation.unit);
        } else {
          showSetup(`Removed ${removed.location}. Add a new location to see its forecast.`);
        }
        return;
      }
      updateSavedLocationControls();
    }
    const dialog = root.querySelector('.weather-settings-dialog');
    root.querySelector('.weather-settings-button').addEventListener('click', () => {
      setLocationMenuOpen(false);
      stopRefreshTimer();
      const selected = prefs.locations.find(item => item.location === prefs.activeLocation);
      dialog.querySelector('.weather-settings-unit').value = selected?.unit || unit;
      dialog.querySelectorAll('[data-weather-detail]').forEach(input => {
        input.checked = prefs.details[input.dataset.weatherDetail] !== false;
      });
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
      const nextPrefs = {
        ...prefs,
        details: Object.fromEntries([...dialog.querySelectorAll('[data-weather-detail]')]
          .map(input => [input.dataset.weatherDetail, input.checked])),
        locations: prefs.locations.map(item => ({ ...item })),
      };
      let selected = nextPrefs.locations.find(item => item.location === nextPrefs.activeLocation) || nextPrefs.locations[0];
      if (newLocation) {
        selected = nextPrefs.locations.find(item => item.location.toLocaleLowerCase() === newLocation.toLocaleLowerCase());
        if (!selected) {
          selected = { location: newLocation, unit: nextUnit };
          nextPrefs.locations.push(selected);
        }
        nextPrefs.activeLocation = selected.location;
      }
      if (!selected) return;
      selected.unit = nextUnit;
      nextPrefs.refreshMinutes = nextInterval;
      if (!savePrefs(nextPrefs)) {
        dialog.querySelector('.weather-settings-error').textContent = 'Your Weather settings were not saved. Browser storage is unavailable; try again.';
        return;
      }
      prefs = nextPrefs;
      dialog.close();
      loadForecast(selected.location, selected.unit);
    });
    const meta = root.querySelector('.weather-meta');
    const metaDetails = [condition];
    if (prefs.details.feelsLike) metaDetails.push(`Feels like ${Math.round(current.apparent_temperature)}${degrees}`);
    if (prefs.details.humidity) metaDetails.push(`${Math.round(current.relative_humidity_2m)}% humidity`);
    if (prefs.details.wind) metaDetails.push(`${Math.round(current.wind_speed_10m)} ${unitWind} wind`);
    if (prefs.details.precipitation) metaDetails.push(`${current.precipitation} ${data.current_units?.precipitation || 'mm'} precipitation`);
    metaDetails.forEach(text => { const span = document.createElement('span'); span.textContent = text; meta.append(span); });
    const hourly = root.querySelector('.weather-hourly');
    let start = data.hourly.time.findIndex(time => time >= current.time);
    if (start < 0) start = 0;
    const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    for (let i = start; i < Math.min(start + 24, data.hourly.time.length); i++) {
      const hourlyDetails = [CONDITIONS[data.hourly.weather_code[i]] || '—'];
      if (prefs.details.rainChance) hourlyDetails.push(`${data.hourly.precipitation_probability?.[i] ?? '—'}% rain`);
      appendRow(hourly, hourFormat.format(parseLocalTimestamp(data.hourly.time[i])), `${Math.round(data.hourly.temperature_2m[i])}${degrees}`, hourlyDetails.join(' · '));
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

  function setSaveStatus(message) {
    const status = root.querySelector('.weather-save-status');
    if (status) status.textContent = message;
  }

  function showErrorState(message, location, unit) {
    stopRefreshTimer();
    setLocationMenuOpen(false);
    locationMenu = null;
    locationButton = null;
    root.innerHTML = `<div class="weather-state"><p class="weather-error"></p><p class="util-muted">Your saved location and unit are still available.</p><div style="display:flex;justify-content:center;gap:.5rem"><button class="util-action weather-retry" type="button">Try again</button><button class="util-action weather-change" type="button">Change setup</button></div></div>`;
    root.querySelector('.weather-error').textContent = message;
    root.querySelector('.weather-retry').addEventListener('click', () => loadForecast(location, unit));
    root.querySelector('.weather-change').addEventListener('click', () => showSetup());
  }
  if (ctx?.appApis && id) ctx.appApis[id] = {
    destroy: () => {
      stopRefreshTimer();
      requestToken++;
      document.removeEventListener('pointerdown', dismissLocationMenu, true);
    },
  };
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
    const details = readWeatherDetails(data?.details);
    if (Array.isArray(data?.locations)) {
      const locations = data.locations
        .filter(item => item && typeof item.location === 'string' && item.location.trim())
        .map(item => ({ location: item.location.trim(), unit: ['fahrenheit', 'celsius'].includes(item.unit) ? item.unit : '' }))
        .filter((item, index, items) => items.findIndex(other => other.location.toLocaleLowerCase() === item.location.toLocaleLowerCase()) === index);
      const activeLocation = locations.some(item => item.location === data.activeLocation) ? data.activeLocation : locations[0]?.location || '';
      return { locations, activeLocation, refreshMinutes, details };
    }
    if (data && typeof data.location === 'string' && data.location.trim()) {
      return {
        locations: [{ location: data.location.trim(), unit: ['fahrenheit', 'celsius'].includes(data.unit) ? data.unit : '' }],
        activeLocation: data.location.trim(),
        refreshMinutes,
        details,
      };
    }
  } catch {}
  return { locations: [], activeLocation: '', refreshMinutes: 60, details: readWeatherDetails() };
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
