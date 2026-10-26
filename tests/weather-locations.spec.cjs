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
  return page.evaluate(key => {
    const prefs = JSON.parse(localStorage.getItem(key));
    if (prefs) delete prefs.details;
    return prefs;
  }, PREF_KEY);
}

async function rawWeatherPrefs(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY);
}

async function selectWeatherLocation(weather, location) {
  const menu = weather.locator('.weather-location-menu');
  if (await menu.isHidden()) await weather.locator('.weather-location-button').click();
  await weather.locator('.weather-location-option').filter({ hasText: location }).click();
}

async function chooseSelectValue(page, select, value) {
  const triggerId = await select.getAttribute('data-custom-select-trigger');
  const popupId = await select.getAttribute('data-custom-select-popup');
  const trigger = page.locator(`[id="${triggerId}"]`);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await page.locator(`[id="${popupId}"] [role="option"][data-value="${value}"]`).click();
}

async function addWeatherLocation(page, settings, location, unit) {
  await settings.locator('.weather-settings-location').fill(location);
  await chooseSelectValue(page, settings.locator('.weather-settings-new-unit'), unit);
  await settings.locator('.weather-settings-add-location').click();
  await expect(settings.locator('.weather-settings-add-status')).toContainText(`${location} added`);
}

async function waitForSavedForecast(weather) {
  const submit = weather.locator('.weather-submit');
  if (await submit.isVisible().catch(() => false)) await submit.click();
  await expect(weather.locator('.weather-current')).toBeVisible();
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
  await chooseSelectValue(page, weather.locator('.weather-unit'), 'fahrenheit');

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
  const locationSelectStyle = await weather.locator('.weather-location-button').evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(locationSelectStyle.radius).toBe('10.4px');
  expect(locationSelectStyle.border).toBe('1px');
  expect(locationSelectStyle.background).not.toBe('rgba(0, 0, 0, 0)');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await setWeatherStorageFailure(page, true);
  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-save-status'))
    .toHaveText('Your location change was not saved. Browser storage is unavailable; try again.');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toMatchObject({ activeLocation: 'Seattle' });

  await setWeatherStorageFailure(page, false);
  await selectWeatherLocation(weather, 'Oslo');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  delayedForecastLatitude = '47.6062';
  await page.clock.fastForward(5 * 60 * 1000);
  await delayedForecastStarted;
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');

  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Oslo');
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

  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Oslo');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  delayedForecastLatitude = '47.6062';
  await page.clock.fastForward(5 * 60 * 1000);
  await delayedForecastStarted;
  delayedForecastShouldFail = true;

  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Oslo');
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

  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Oslo');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-hourly')).toContainText('72°F');

  incompleteNextForecast = true;
  await page.clock.fastForward(5 * 60 * 1000);

  await expect(weather.locator('.weather-refresh-status'))
    .toHaveText('The latest weather update did not include a forecast.');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('22°C');

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  await chooseSelectValue(page, settings.locator('.weather-settings-unit'), 'fahrenheit');
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
  await weather.locator('.weather-settings-button').click();
  await settings.getByRole('button', { name: 'Remove Seattle' }).click();
  await expect(settings.locator('.weather-settings-error'))
    .toHaveText('Your location change was not saved. Browser storage is unavailable; try again.');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
  });

  await setWeatherStorageFailure(page, false);
  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Remove Seattle' }).click();
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
  await expect(weather.locator('.weather-panels')).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-setup')).toHaveCount(0);
  await expect.poll(() => forecastRequests.map(request => request.temperatureUnit))
    .toEqual(['fahrenheit']);
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Legacy City', unit: 'fahrenheit' }],
    activeLocation: 'Legacy City',
    refreshMinutes: 30,
  });
});

test('shows today’s high and low beside the current temperature and saves optional details', async ({ page }) => {
  await page.evaluate(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), {
    key: PREF_KEY,
    prefs: {
      locations: [
        { location: 'Seattle', unit: 'fahrenheit' },
        { location: 'Oslo', unit: 'celsius' },
      ],
      activeLocation: 'Oslo',
      refreshMinutes: 60,
    },
  });

  let weather = await openWeather(page);
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-place')).toContainText('Oslo');
  await expect(weather.locator('.weather-high-value')).toHaveText('24°C');
  await expect(weather.locator('.weather-low-value')).toHaveText('20°C');
  await expect(weather.locator('.weather-high .weather-extreme-label')).toHaveText('H');
  await expect(weather.locator('.weather-low .weather-extreme-label')).toHaveText('L');
  const temperatureLayout = await weather.evaluate(root => {
    const current = root.querySelector('.weather-current');
    const extremes = root.querySelector('.weather-high-low');
    const currentBox = current.getBoundingClientRect();
    const extremesBox = extremes.getBoundingClientRect();
    return {
      currentSize: parseFloat(getComputedStyle(current).fontSize),
      extremesSize: parseFloat(getComputedStyle(extremes).fontSize),
      currentWeight: getComputedStyle(current).fontWeight,
      extremesWeight: getComputedStyle(extremes).fontWeight,
      currentRight: currentBox.right,
      extremesLeft: extremesBox.left,
    };
  });
  expect(temperatureLayout.extremesLeft).toBeGreaterThan(temperatureLayout.currentRight);
  expect(temperatureLayout.extremesSize / temperatureLayout.currentSize).toBeCloseTo(0.45, 2);
  expect(temperatureLayout.extremesWeight).toBe(temperatureLayout.currentWeight);
  const locationButton = weather.locator('.weather-location-button');
  await expect(locationButton).toHaveAttribute('aria-haspopup', 'menu');
  await expect(locationButton).not.toContainText('Oslo');
  await expect(locationButton).not.toContainText('°C');
  await locationButton.hover();
  expect(await locationButton.evaluate(element => getComputedStyle(element).transform)).toBe('none');
  await locationButton.click();
  await expect(locationButton).toHaveAttribute('aria-expanded', 'true');
  const options = weather.locator('.weather-location-option');
  await expect(options).toHaveCount(2);
  await expect(weather.locator('.weather-location-menu')).toHaveAttribute('role', 'menu');
  await expect(options.first()).toHaveAttribute('role', 'menuitemradio');
  await expect(weather.locator('.weather-location-option[aria-checked="true"]')).toHaveCount(1);
  await expect(options.locator('.weather-location-option-unit')).toHaveCount(0);
  const menuStyles = await page.evaluate(() => {
    const menu = document.querySelector('.weather-location-menu');
    const reference = document.createElement('div');
    reference.className = 'win-menu-dropdown menu-popover';
    document.body.append(reference);
    const styleOf = element => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        backdrop: style.backdropFilter,
        border: style.borderColor,
        radius: style.borderRadius,
        shadow: style.boxShadow,
      };
    };
    const result = { weather: styleOf(menu), topbar: styleOf(reference) };
    reference.remove();
    return result;
  });
  expect(menuStyles.weather).toEqual(menuStyles.topbar);
  expect(menuStyles.weather.backdrop).toContain('blur(');
  expect(menuStyles.weather.background).not.toBe('rgba(0, 0, 0, 0)');
  const popupLayers = await page.evaluate(() => {
    const menu = document.querySelector('.weather-location-menu');
    const credit = document.querySelector('.weather-credit');
    const menuRect = menu.getBoundingClientRect();
    const creditRect = credit.getBoundingClientRect();
    const left = Math.max(menuRect.left, creditRect.left);
    const right = Math.min(menuRect.right, creditRect.right);
    const top = Math.max(menuRect.top, creditRect.top);
    const bottom = Math.min(menuRect.bottom, creditRect.bottom);
    if (left >= right || top >= bottom) return { overlaps: false, menuOnTop: false };
    const topElement = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return { overlaps: true, menuOnTop: menu.contains(topElement) };
  });
  expect(popupLayers).toEqual({ overlaps: true, menuOnTop: true });
  await locationButton.press('ArrowDown');
  await expect(options.nth(0)).toBeFocused();
  await options.nth(0).press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await options.nth(1).press('Escape');
  await expect(weather.locator('.weather-location-menu')).toBeHidden();
  await expect(locationButton).toBeFocused();

  await selectWeatherLocation(weather, 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-high-value')).toHaveText('74°F');
  await expect(weather.locator('.weather-low-value')).toHaveText('70°F');
  await expect(weather.locator('.weather-location-button')).not.toContainText('°F');
  await expect(weather.locator('.weather-location-menu')).toBeHidden();

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  for (const label of ['Feels-like temperature', 'Humidity', 'Wind speed', 'Precipitation', 'Hourly rain chance']) {
    await settings.getByLabel(label).uncheck();
  }
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-meta span')).toHaveText(['Clear sky']);
  await expect(weather.locator('.weather-hourly .weather-row').first().locator('span').last()).toHaveText('Clear sky');
  await expect.poll(() => rawWeatherPrefs(page)).toMatchObject({
    activeLocation: 'Seattle',
    details: {
      feelsLike: false,
      humidity: false,
      wind: false,
      precipitation: false,
      rainChance: false,
    },
  });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  weather = await openWeather(page);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect(weather.locator('.weather-location-button')).not.toContainText('°F');
  await expect(weather.locator('.weather-meta span')).toHaveText(['Clear sky']);
});

test('keeps each saved city paired with its unit after selection and opening a new Weather window', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await chooseSelectValue(page, weather.locator('.weather-unit'), 'fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  await addWeatherLocation(page, settings, 'Oslo', 'celsius');
  await expect(settings).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');

  await selectWeatherLocation(weather, 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
  await weather.locator('.weather-settings-button').click();
  await expect(settings.locator('.weather-settings-unit')).toHaveValue('fahrenheit');
  await settings.locator('.weather-settings-close').click();

  await selectWeatherLocation(weather, 'Oslo');
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
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Oslo');
  await selectWeatherLocation(weather, 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
});

test('lets users add multiple locations without closing Weather settings', async ({ page }) => {
  const weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await chooseSelectValue(page, weather.locator('.weather-unit'), 'fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  const settings = weather.locator('.weather-settings-dialog');
  await weather.locator('.weather-settings-button').click();
  await addWeatherLocation(page, settings, 'Oslo', 'celsius');
  await expect(settings).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await addWeatherLocation(page, settings, 'Lisbon', 'fahrenheit');
  await expect(settings.getByRole('button', { name: 'Remove Oslo' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Remove Lisbon' })).toBeVisible();

  await settings.locator('.weather-settings-save').click();
  await expect(settings).toBeHidden();
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Oslo', unit: 'celsius' },
      { location: 'Lisbon', unit: 'fahrenheit' },
    ],
    activeLocation: 'Seattle',
  });

  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await selectWeatherLocation(weather, 'Lisbon');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
});

test('changing a saved city unit preserves the other city after switching and reopening Weather', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await chooseSelectValue(page, weather.locator('.weather-unit'), 'fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  const settings = weather.locator('.weather-settings-dialog');
  await weather.locator('.weather-settings-button').click();
  await addWeatherLocation(page, settings, 'Oslo', 'celsius');
  await expect(settings).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await selectWeatherLocation(weather, 'Oslo');
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

  await selectWeatherLocation(weather, 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '47.6062',
    temperatureUnit: 'fahrenheit',
  });

  await weather.locator('.weather-settings-button').click();
  await expect(settings.locator('.weather-settings-unit')).toHaveValue('fahrenheit');
  await chooseSelectValue(page, settings.locator('.weather-settings-unit'), 'celsius');
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

  await selectWeatherLocation(weather, 'Oslo');
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
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
  const reopenedLocationSelect = weather.locator('.weather-location-button');
  await selectWeatherLocation(weather, 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '47.6062',
    temperatureUnit: 'celsius',
  });
  await selectWeatherLocation(weather, 'Oslo');
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await expect.poll(() => forecastRequests.at(-1)).toEqual({
    latitude: '59.9139',
    temperatureUnit: 'celsius',
  });
});

test('keeps saved locations and units available after a forecast failure and reopening Weather', async ({ page }) => {
  let weather = await openWeather(page);
  await weather.locator('.weather-location').fill('Seattle');
  await chooseSelectValue(page, weather.locator('.weather-unit'), 'fahrenheit');
  await weather.locator('.weather-submit').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  const settings = weather.locator('.weather-settings-dialog');
  await weather.locator('.weather-settings-button').click();
  await addWeatherLocation(page, settings, 'Oslo', 'celsius');
  await expect(settings).toBeVisible();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await settings.locator('.weather-settings-save').click();
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await selectWeatherLocation(weather, 'Oslo');
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
  await selectWeatherLocation(weather, 'Seattle');
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
  await expect(weather.locator('.weather-location')).toBeVisible();
  await expect(weather.locator('.weather-unit')).toBeVisible();
  await expect(weather.locator('.weather-saved-location')).toHaveCount(0);
  await expect(weather.locator('.weather-remove')).toHaveCount(0);
  await expect.poll(() => savedPrefs(page)).toMatchObject({
    locations: savedLocations,
    activeLocation: 'Seattle',
  });

  await page.locator('#close-btn').click();
  await expect(page.locator('.app-window[data-type="weather"]')).toHaveCount(0);
  forecastFailure = false;
  weather = await openWeather(page);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await weather.locator('.weather-settings-button').click();
  await expect(settings.getByRole('button', { name: 'Remove Seattle' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Remove Oslo' })).toBeVisible();
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-remove-current')).toHaveCount(0);
  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect.poll(() => savedPrefs(page)).toEqual(initialPrefs);
  await expect(settings.getByRole('button', { name: 'Remove Oslo' })).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 45,
  });
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
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
  await waitForSavedForecast(weather);
  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  const remainingPrefs = {
    locations: [
      { location: 'Seattle', unit: 'fahrenheit' },
      { location: 'Lisbon', unit: 'fahrenheit' },
    ],
    activeLocation: 'Seattle',
    refreshMinutes: 35,
  };
  await expect.poll(() => savedPrefs(page)).toEqual(remainingPrefs);
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  await page.reload();
  const welcomeClose = page.locator('#welcome-win-close');
  if (await welcomeClose.isVisible()) await welcomeClose.click();
  weather = await openWeather(page);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await weather.locator('.weather-location-button').click();
  const locationOptions = weather.locator('.weather-location-option');
  await expect(locationOptions).toHaveCount(2);
  await expect(locationOptions.nth(0)).toContainText('Seattle, Test Region, Test Country');
  await expect(locationOptions.locator('.weather-location-option-unit')).toHaveCount(0);
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
  await waitForSavedForecast(weather);
  await weather.locator('.weather-settings-button').click();
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-settings-dialog').getByRole('button', { name: 'Remove Tokyo' }).click();

  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [],
    activeLocation: '',
    refreshMinutes: 90,
  });
  await expect(weather.locator('.weather-location-label')).toBeVisible();
  await expect(weather.locator('.weather-location')).toBeVisible();
  await expect(weather.locator('.weather-location')).toHaveAttribute('required', '');
  await expect(weather.locator('.weather-saved-row')).toHaveCount(0);
  await expect(weather.locator('.weather-saved-location')).toHaveCount(0);
  await expect(weather.locator('.weather-remove')).toHaveCount(0);
  await expect(weather.locator('.weather-submit')).toHaveText('Show forecast');
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-current')).toHaveText('22°C');
  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  let confirmationMessage = '';
  page.once('dialog', async dialog => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();

  await expect(weather.locator('.weather-current')).toHaveText('72°F');
  await expect(weather.locator('.weather-location-button')).toHaveAttribute('data-location', 'Seattle');
  await expect.poll(() => forecastRequests.at(-1)?.temperatureUnit).toBe('fahrenheit');
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [{ location: 'Seattle', unit: 'fahrenheit' }],
    activeLocation: 'Seattle',
    refreshMinutes: 50,
  });
  expect(confirmationMessage).toContain('Another saved location will become active.');
});

test('the main forecast has no remove button and settings can remove an inactive place', async ({ page }) => {
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
  await waitForSavedForecast(weather);
  await expect.poll(() => forecastRequests.length).toBe(1);
  const activeRequests = forecastRequests.length;
  await expect(weather.locator('.weather-remove-current')).toHaveCount(0);
  await expect(weather.locator('.weather-top-tools')).not.toContainText('Remove');
  await weather.locator('.weather-settings-button').click();
  const settings = weather.locator('.weather-settings-dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect.poll(() => savedPrefs(page)).toEqual(initialPrefs);
  await expect(weather.locator('.weather-current')).toHaveText('72°F');

  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect(settings.locator('.weather-settings-locations')).not.toContainText('Oslo');
  await expect(weather.locator('.weather-location-option')).toHaveCount(1);
  await expect(weather.locator('.weather-location-option-unit')).toHaveCount(0);
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
  await waitForSavedForecast(weather);
  await expect(weather.locator('.weather-panels')).toBeVisible();
  await weather.locator('.weather-settings-button').click();
  page.once('dialog', dialog => dialog.accept());
  await weather.locator('.weather-settings-dialog').getByRole('button', { name: 'Remove Tokyo' }).click();

  await expect(weather.locator('.weather-location-label')).toBeVisible();
  await expect(weather.locator('.weather-location')).toHaveAttribute('required', '');
  await expect(weather.locator('.weather-saved-row')).toHaveCount(0);
  await expect.poll(() => savedPrefs(page)).toEqual({
    locations: [],
    activeLocation: '',
    refreshMinutes: 75,
  });
});
