const { test, expect } = require('@playwright/test');

const PREF_KEY = 'personal-desktop-weather-setup-v1';
let forecastRequests;
let errors;
let forecastFailure;
let incompleteNextForecast;
let delayedForecastLatitude;
let delayedForecastShouldFail;
let releaseDelayedForecast;
let delayedForecastStarted;
let resolveDelayedForecastStarted;

test.beforeEach(async ({ page }) => {
  forecastRequests = [];
  errors = [];
  forecastFailure = false;
  incompleteNextForecast = false;
  delayedForecastLatitude = null;
  delayedForecastShouldFail = false;
  releaseDelayedForecast = null;
  delayedForecastStarted = new Promise(resolve => { resolveDelayedForecastStarted = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', async route => {
    const url = new URL(route.request().url());
    const name = url.searchParams.get('name');
    const latitudeByLocation = { Seattle: 47.6062, Oslo: 59.9139 };
    await route.fulfill({
      json: {
        results: [{
          name,
          latitude: latitudeByLocation[name] || 40,
          longitude: -70,
          timezone: 'UTC',
          admin1: 'Test Region',
          country: 'Test Country',
        }],
      },
    });
  });
  await page.route('https://api.open-meteo.com/v1/forecast**', async route => {
    const url = new URL(route.request().url());
    const unit = url.searchParams.get('temperature_unit');
    forecastRequests.push({
      latitude: url.searchParams.get('latitude'),
      temperatureUnit: unit,
    });
    if (url.searchParams.get('latitude') === delayedForecastLatitude) {
      resolveDelayedForecastStarted();
      await new Promise(resolve => {
        releaseDelayedForecast = resolve;
      });
      if (delayedForecastShouldFail) {
        await route.fulfill({ status: 503, body: 'Forecast unavailable' });
        return;
      }
    }
    if (forecastFailure) {
      await route.fulfill({ status: 503, body: 'Forecast unavailable' });
      return;
    }
    if (incompleteNextForecast) {
      incompleteNextForecast = false;
      await route.fulfill({ json: { current: {} } });
      return;
    }
    const temperature = unit === 'fahrenheit' ? 72 : 22;
    const hourlyTimes = Array.from({ length: 24 }, (_, index) => {
      const time = new Date(Date.UTC(2026, 9, 25, 12 + index));
      return time.toISOString().slice(0, 16);
    });
    const hourlyTime = hourlyTimes[0];
    await route.fulfill({
      json: {
        current: {
          time: hourlyTime,
          temperature_2m: temperature,
          relative_humidity_2m: 45,
          apparent_temperature: temperature,
          is_day: 1,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 10,
        },
        current_units: { wind_speed_10m: 'km/h', precipitation: 'mm' },
        hourly: {
          time: hourlyTimes,
          temperature_2m: Array(24).fill(temperature),
          precipitation_probability: Array(24).fill(0),
          weather_code: Array(24).fill(0),
        },
        daily: {
          time: ['2026-10-25'],
          weather_code: [0],
          temperature_2m_max: [temperature + 2],
          temperature_2m_min: [temperature - 2],
          sunrise: ['2026-10-25T06:00'],
          sunset: ['2026-10-25T18:00'],
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});

test.afterEach(() => expect(errors).toEqual([]));

async function openWeather(page) {
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="weather"]').click();
  return page.locator('.app-window[data-type="weather"]').last();
}

async function savedPrefs(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY);
}

async function setWeatherStorageFailure(page, shouldFail) {
  await page.evaluate(shouldFail => {
    if (!window.__weatherOriginalSetItem) {
      window.__weatherOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'personal-desktop-weather-setup-v1' && window.__weatherStorageShouldFail) {
          throw new DOMException('Storage unavailable', 'QuotaExceededError');
        }
        return window.__weatherOriginalSetItem.call(this, key, value);
      };
    }
    window.__weatherStorageShouldFail = shouldFail;
  }, shouldFail);
}

test('warns when a new location cannot be saved and accepts it after storage recovers', async ({ page }) => {
  const weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await weather.locator('.weather-unit').selectOption('fahrenheit');

  await setWeatherStorageFailure(page, true);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-error'))
    .toHaveText('Your location change was not saved. Browser storage is unavailable; try again.');
  await expect(weather.locator('.weather-location-label')).toBeVisible();
  expect(await savedPrefs(page)).toBeNull();
  await expect.poll(() => forecastRequests).toHaveLength(0);

  await setWeatherStorageFailure(page, false);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 60,
  });
});

test('keeps the current forecast when a location switch cannot be saved, then recovers', async ({ page }) => {
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [
        { location: 'Seattle', unit: 'fahrenheit' },
        { location: 'Oslo', unit: 'celsius' },
      ],
      activeLocation: 'Seattle',
      refreshMinutes: 60,
    },
  });
  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await setWeatherStorageFailure(page, true);
  await weather.locator('.weather-location-select').selectOption('Oslo');
  await expect(weather.locator('.weather-save-status'))
    .toHaveText('Your location change was not saved. Browser storage is unavailable; try again.');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toMatchObject({ activeLocation: 'Seattle' });

  await setWeatherStorageFailure(page, false);
  await weather.locator('.weather-location-select').selectOption('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => savedPrefs(page)).toMatchObject({ activeLocation: 'Oslo' });
});

test('ignores a delayed forecast for the previous city after switching locations', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [
        { location: 'Seattle', unit: 'fahrenheit' },
        { location: 'Oslo', unit: 'celsius' },
      ],
      activeLocation: 'Seattle',
      refreshMinutes: 5,
    },
  });
  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  delayedForecastLatitude = '47.6062';
  await page.clock.fastForward(5 * 60 * 1000);
  await delayedForecastStarted;
  await expect(weather.locator('.weather-location-select')).toHaveValue('Seattle');

  await weather.locator('.weather-location-select').selectOption('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Oslo');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });

  const delayedResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.hostname === 'api.open-meteo.com'
      && url.pathname === '/v1/forecast'
      && url.searchParams.get('latitude') === '47.6062';
  });
  releaseDelayedForecast();
  await (await delayedResponse).finished();
  await page.waitForTimeout(100);

  await expect(weather.locator('.weather-location-select')).toHaveValue('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-hourly')).toContainText('22°C');
});

test('keeps the newer city and unit when an older background refresh fails', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [
        { location: 'Seattle', unit: 'fahrenheit' },
        { location: 'Oslo', unit: 'celsius' },
      ],
      activeLocation: 'Seattle',
      refreshMinutes: 5,
    },
  });
  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  delayedForecastLatitude = '47.6062';
  await page.clock.fastForward(5 * 60 * 1000);
  await delayedForecastStarted;
  delayedForecastShouldFail = true;

  await weather.locator('.weather-location-select').selectOption('Oslo');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });

  const delayedResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.hostname === 'api.open-meteo.com'
      && url.pathname === '/v1/forecast'
      && url.searchParams.get('latitude') === '47.6062';
  });
  releaseDelayedForecast();
  const failedResponse = await delayedResponse;
  expect(failedResponse.status()).toBe(503);
  await failedResponse.finished();
  await page.waitForTimeout(100);

  await expect(weather.locator('.weather-location-select')).toHaveValue('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-error')).toHaveText('');
  await expect(weather.locator('.weather-refresh-status')).toHaveText('');
  await expect(weather.locator('.weather-retry')).toHaveCount(0);
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    activeLocation: 'Oslo',
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
  });
});

test('keeps the last forecast and unit visible when a background refresh omits forecast data', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
      activeLocation: 'Seattle',
      refreshMinutes: 5,
    },
  });
  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-hourly')).toContainText('72°F');

  incompleteNextForecast = true;
  await page.clock.fastForward(5 * 60 * 1000);

  await expect(weather.locator('.weather-refresh-status'))
    .toHaveText('The latest weather update did not include a forecast.');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-hourly')).toContainText('72°F');
  await expect(weather.locator('.weather-daily')).toContainText('°F');
});

test('keeps settings and saved locations unchanged after failed writes, then saves them on retry', async ({ page }) => {
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [{ location: 'Seattle', unit: 'celsius' }],
      activeLocation: 'Seattle',
      refreshMinutes: 60,
    },
  });
  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  await settings.locator('.weather-settings-unit').selectOption('fahrenheit');
  await setWeatherStorageFailure(page, true);
  await settings.locator('.weather-settings-save').click();
  await expect(settings.locator('.weather-settings-error'))
    .toHaveText('Your Weather settings were not saved. Browser storage is unavailable; try again.');
  await expect(settings).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [{ location: 'Seattle', unit: 'celsius' }],
    activeLocation: 'Seattle',
  });

  await setWeatherStorageFailure(page, false);
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
  });

  await setWeatherStorageFailure(page, true);
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove-current').click();
  await expect(weather.locator('.weather-save-status'))
    .toHaveText('Your location change was not saved. Browser storage is unavailable; try again.');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
  });

  await setWeatherStorageFailure(page, false);
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove-current').click();
  await expect(weather.locator('.weather-location-label')).toBeVisible();
  await expect(weather.locator('.weather-error')).toContainText('Removed Seattle');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [],
    activeLocation: '',
  });
});

test('migrates the previous single-location preference when its forecast is opened', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    location: 'Legacy City',
    unit: 'fahrenheit',
    refreshMinutes: 30,
  })), PREF_KEY);
  await page.reload();
  await page.locator('#welcome-win-close').click();

  const weather = await openWeather(page);
  const locationSelect = weather.locator('.weather-saved-location');
  const unitSelect = weather.locator('.weather-unit');
  await expect(locationSelect.locator('option')).toHaveText(['Legacy City']);
  await expect(locationSelect).toHaveValue('Legacy City');
  await expect(unitSelect).toHaveValue('fahrenheit');

  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-panels')).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.map(request => request.temperatureUnit))
    .toEqual(['fahrenheit']);
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Legacy City', unit: 'fahrenheit' }],
    activeLocation: 'Legacy City',
    refreshMinutes: 30,
  });
});

test('keeps each saved city paired with its unit after selection and opening a new Weather window', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await weather.locator('.weather-unit').selectOption('fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  await settings.locator('.weather-settings-location').fill('Oslo');
  await settings.locator('.weather-settings-unit').selectOption('celsius');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Oslo');

  const locationSelect = weather.locator('.weather-location-select');
  await locationSelect.selectOption('Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
  await weather.locator('.weather-settings-button').click();
  await expect(settings.locator('.weather-settings-unit')).toHaveValue('fahrenheit');
  await settings.locator('.weather-settings-close').click();

  await locationSelect.selectOption('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('celsius');
  await weather.locator('.weather-settings-button').click();
  await expect(settings.locator('.weather-settings-unit')).toHaveValue('celsius');
  await settings.locator('.weather-settings-close').click();

  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Oslo',
    refreshMinutes: 60,
  });

  await page.locator('#close-btn').click();
  await expect(page.locator('.app-window[data-type="weather"]')).toHaveCount(0);
  weather = await openWeather(page);
  const savedLocationSelect = weather.locator('.weather-saved-location');
  const savedUnitSelect = weather.locator('.weather-unit');
  await expect(savedLocationSelect.locator('option')).toHaveText(['Seattle', 'Oslo']);
  await expect(savedLocationSelect).toHaveValue('Oslo');
  await expect(savedUnitSelect).toHaveValue('celsius');

  await savedLocationSelect.selectOption('Seattle');
  await expect(savedUnitSelect).toHaveValue('fahrenheit');
  await savedLocationSelect.selectOption('Oslo');
  await expect(savedUnitSelect).toHaveValue('celsius');
  await savedLocationSelect.selectOption('Seattle');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
});

test('changing a saved city unit preserves the other city after switching and reopening Weather', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await weather.locator('.weather-unit').selectOption('fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  const settings = weather.locator('.weather-settings-dialog');
  await weather.locator('.weather-settings-button').click();
  await settings.locator('.weather-settings-location').fill('Oslo');
  await settings.locator('.weather-settings-unit').selectOption('celsius');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Oslo',
    refreshMinutes: 60,
  });

  await weather.locator('.weather-location-select').selectOption('Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '47.6062',
    temperatureUnit: 'fahrenheit',
  });

  await weather.locator('.weather-settings-button').click();
  await expect(settings.locator('.weather-settings-unit')).toHaveValue('fahrenheit');
  await settings.locator('.weather-settings-unit').selectOption('celsius');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '47.6062',
    temperatureUnit: 'celsius',
  });
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [
      { location: 'Seattle', unit: 'celsius' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Seattle',
    refreshMinutes: 60,
  });

  await weather.locator('.weather-location-select').selectOption('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [
      { location: 'Seattle', unit: 'celsius' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Oslo',
    refreshMinutes: 60,
  });

  await page.locator('#close-btn').click();
  weather = await openWeather(page);
  const savedLocationSelect = weather.locator('.weather-saved-location');
  const savedUnitSelect = weather.locator('.weather-unit');
  await expect(savedLocationSelect.locator('option')).toHaveText(['Seattle', 'Oslo']);
  await expect(savedLocationSelect).toHaveValue('Oslo');
  await expect(savedUnitSelect).toHaveValue('celsius');
  await savedLocationSelect.selectOption('Seattle');
  await expect(savedUnitSelect).toHaveValue('celsius');
  await savedLocationSelect.selectOption('Oslo');
  await expect(savedUnitSelect).toHaveValue('celsius');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
  const reopenedLocationSelect = weather.locator('.weather-location-select');
  await reopenedLocationSelect.selectOption('Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '47.6062',
    temperatureUnit: 'celsius',
  });
  await reopenedLocationSelect.selectOption('Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
});

test('keeps saved locations and units available after a forecast failure and reopening Weather', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await weather.locator('.weather-unit').selectOption('fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  const settings = weather.locator('.weather-settings-dialog');
  await weather.locator('.weather-settings-button').click();
  await settings.locator('.weather-settings-location').fill('Oslo');
  await settings.locator('.weather-settings-unit').selectOption('celsius');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');

  const savedLocations = [
    { location: 'Seattle', unit: 'fahrenheit' },
    { location: 'Oslo', unit: 'celsius' },
  ];
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: savedLocations,
    activeLocation: 'Oslo',
    refreshMinutes: 60,
  });

  forecastFailure = true;
  await weather.locator('.weather-location-select').selectOption('Seattle');
  await expect(weather.locator('.weather-error'))
    .toContainText('The weather service could not be reached');
  await expect(weather.locator('.weather-retry')).toBeVisible();
  await expect(weather.locator('.weather-change')).toBeVisible();
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: savedLocations,
    activeLocation: 'Seattle',
    refreshMinutes: 60,
  });

  await weather.locator('.weather-change').click();
  const setupLocations = weather.locator('.weather-saved-location');
  const setupUnit = weather.locator('.weather-unit');
  await expect(setupLocations.locator('option')).toHaveText(['Seattle', 'Oslo']);
  await expect(setupLocations).toHaveValue('Seattle');
  await expect(setupUnit).toHaveValue('fahrenheit');
  await setupLocations.selectOption('Oslo');
  await expect(setupUnit).toHaveValue('celsius');
  await setupLocations.selectOption('Seattle');
  await expect(setupUnit).toHaveValue('fahrenheit');

  await page.locator('#close-btn').click();
  await expect(page.locator('.app-window[data-type="weather"]')).toHaveCount(0);
  weather = await openWeather(page);
  const reopenedLocations = weather.locator('.weather-saved-location');
  const reopenedUnit = weather.locator('.weather-unit');
  await expect(reopenedLocations.locator('option')).toHaveText(['Seattle', 'Oslo']);
  await expect(reopenedLocations).toHaveValue('Seattle');
  await expect(reopenedUnit).toHaveValue('fahrenheit');
  await reopenedLocations.selectOption('Oslo');
  await expect(reopenedUnit).toHaveValue('celsius');
  await reopenedLocations.selectOption('Seattle');
  await expect(reopenedUnit).toHaveValue('fahrenheit');
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: savedLocations,
    activeLocation: 'Seattle',
    refreshMinutes: 60,
  });
});

test('canceling removal changes nothing, and removing an inactive place keeps the active place', async ({ page }) => {
  const initialPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Seattle',
    refreshMinutes: 45,
  };
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: initialPrefs,
  });

  const weather = await openWeather(page);
  const locationSelect = weather.locator('.weather-saved-location');
  const unitSelect = weather.locator('.weather-unit');
  await locationSelect.selectOption('Oslo');
  await expect(unitSelect).toHaveValue('celsius');

  page.once('dialog', dialog => dialog.dismiss());
  await weather.locator('.weather-remove').click();
  await expect.poll(() => savedPrefs(page)).toEqual(initialPrefs);
  await expect(locationSelect.locator('option')).toHaveText(['Seattle', 'Oslo']);
  await expect(locationSelect).toHaveValue('Oslo');
  await expect(unitSelect).toHaveValue('celsius');

  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove').click();
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 45,
  });
  await expect(weather.locator('.weather-saved-location')).toHaveValue('Seattle');
  await expect(weather.locator('.weather-unit')).toHaveValue('fahrenheit');
});

test('removing the active place selects another saved place and preserves preferences after reload', async ({ page }) => {
  const initialPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
      { location: 'Lisbon', unit: 'fahrenheit' },
    ],
    activeLocation: 'Oslo',
    refreshMinutes: 35,
  };
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: initialPrefs,
  });

  let weather = await openWeather(page);
  await expect(weather.locator('.weather-saved-location')).toHaveValue('Oslo');
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove').click();
  const remainingPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Lisbon', unit: 'fahrenheit' },
    ],
    activeLocation: 'Seattle',
    refreshMinutes: 35,
  };
  await expect.poll(() => savedPrefs(page)).toEqual(remainingPrefs);
  await expect(weather.locator('.weather-saved-location')).toHaveValue('Seattle');
  await expect(weather.locator('.weather-unit')).toHaveValue('fahrenheit');

  await page.reload();
  const welcomeClose = page.locator('#welcome-win-close');
  if (await welcomeClose.isVisible()) await welcomeClose.click();
  weather = await openWeather(page);
  const savedLocationSelect = weather.locator('.weather-saved-location');
  const savedUnitSelect = weather.locator('.weather-unit');
  await expect(savedLocationSelect.locator('option')).toHaveText(['Seattle', 'Lisbon']);
  await expect(savedLocationSelect).toHaveValue('Seattle');
  await expect(savedUnitSelect).toHaveValue('fahrenheit');
  await savedLocationSelect.selectOption('Lisbon');
  await expect(savedUnitSelect).toHaveValue('fahrenheit');
  await expect.poll(() => savedPrefs(page)).toEqual(remainingPrefs);
});

test('removing the last saved place shows the new-location form and keeps refresh settings', async ({ page }) => {
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [{ location: 'Tokyo', unit: 'celsius' }],
      activeLocation: 'Tokyo',
      refreshMinutes: 90,
    },
  });

  const weather = await openWeather(page);
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove').click();

  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [],
    activeLocation: '',
    refreshMinutes: 90,
  });
  await expect(weather.locator('.weather-location-label')).toBeVisible();
  await expect(weather.locator('.weather-location')).toBeVisible();
  await expect(weather.locator('.weather-location')).toHaveAttribute('required', '');
  await expect(weather.locator('.weather-saved-row')).toBeHidden();
  await expect(weather.locator('.weather-submit')).toHaveText('Add & show forecast');
  await expect(weather.locator('.weather-error')).toContainText('Add a new location');
});

test('removing the active forecast location loads the next saved place with its saved unit', async ({ page }) => {
  const initialPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Oslo',
    refreshMinutes: 50,
  };
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: initialPrefs,
  });

  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  let confirmationMessage = '';
  page.once('dialog', async dialog => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  await weather.locator('.weather-remove-current').click();

  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-location-select')).toHaveValue('Seattle');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 50,
  });
  expect(confirmationMessage).toContain('Another saved location will become active.');
});

test('canceling forecast removal changes nothing and settings can remove an inactive place', async ({ page }) => {
  const initialPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
    ],
    activeLocation: 'Seattle',
    refreshMinutes: 40,
  };
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: initialPrefs,
  });

  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect.poll(() => forecastRequests.length).toBe(1);
  const activeRequests = forecastRequests.length;
  page.once('dialog', dialog => dialog.dismiss());
  await weather.locator('.weather-remove-current').click();
  await expect.poll(() => savedPrefs(page)).toEqual(initialPrefs);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect(settings.locator('.weather-settings-locations')).not.toContainText('Oslo');
  await expect(weather.locator('.weather-location-select option'))
    .toHaveText(['Seattle, Test Region, Test Country']);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.length).toBe(activeRequests);
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 40,
  });
});

test('removing the last place from the forecast returns to the new-location form', async ({ page }) => {
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [{ location: 'Tokyo', unit: 'celsius' }],
      activeLocation: 'Tokyo',
      refreshMinutes: 75,
    },
  });

  const weather = await openWeather(page);
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-panels')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-remove-current').click();

  await expect(weather.locator('.weather-location-label')).toBeVisible();
  await expect(weather.locator('.weather-location')).toHaveAttribute('required', '');
  await expect(weather.locator('.weather-saved-row')).toBeHidden();
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [],
    activeLocation: '',
    refreshMinutes: 75,
  });
});
