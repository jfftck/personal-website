const { test, expect } = require('@playwright/test');

const PREF_KEY = 'personal-desktop-weather-setup-v1';
let forecastRequests;
let errors;

test.beforeEach(async ({ page }) => {
  forecastRequests = [];
  errors = [];
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
