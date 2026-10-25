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
    await route.fulfill({
      json: {
        results: [{
          name,
          latitude: 40,
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
