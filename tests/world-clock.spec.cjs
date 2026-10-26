const { test, expect } = require('@playwright/test');

const PREF_KEY = 'personal-desktop-world-clock-v1';
let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ results: [] }),
  }));
  await page.goto('/');
  await page.evaluate(key => localStorage.removeItem(key), PREF_KEY);
  await page.locator('#welcome-win-close').click();
});

test.afterEach(() => expect(errors).toEqual([]));

async function openWorldClock(page) {
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="world-clock"]').click();
  return page.locator('.app-window[data-type="world-clock"]').last();
}

async function getWorldClock(page) {
  const existing = page.locator('.app-window[data-type="world-clock"]');
  if (await existing.count()) return existing.last();
  return openWorldClock(page);
}

test('resolves a curated city to its IANA zone and displays the matching city and local time', async ({ page }) => {
  const clock = await openWorldClock(page);
  await clock.getByLabel('City or time zone').fill('Bengaluru');
  await clock.getByRole('button', { name: 'Add clock' }).click();

  const cityClock = clock.locator('.clock-item[data-zone="Asia/Kolkata"]');
  await expect(cityClock.locator('strong')).toHaveText('Bengaluru');
  await expect.poll(() => page.evaluate(zone => {
    const displayed = document.querySelector(`.clock-item[data-zone="${zone}"] time`)?.textContent || '';
    const displayedWithoutSeconds = displayed.replace(/:\d{2}(?=\s|$)/, '');
    const use24HourTime = localStorage.getItem('desktop-time-24h') === 'true';
    const expected = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: use24HourTime ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !use24HourTime,
    }).format(new Date());
    return displayedWithoutSeconds === expected;
  }, 'Asia/Kolkata')).toBe(true);

  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({ cityLabels: { 'Asia/Kolkata': 'Bengaluru' } });
});

test('adds a city entered with spacing and punctuation variants using its catalog name', async ({ page }) => {
  const clock = await openWorldClock(page);
  await clock.getByLabel('City or time zone').fill('Ho-Chi  Minh City');
  await clock.getByRole('button', { name: 'Add clock' }).click();

  const cityClock = clock.locator('.clock-item[data-zone="Asia/Ho_Chi_Minh"]');
  await expect(cityClock.locator('strong')).toHaveText('Ho Chi Minh City');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({ cityLabels: { 'Asia/Ho_Chi_Minh': 'Ho Chi Minh City' } });
});

test('offers clear typo matches without adding a city until the user chooses one', async ({ page }) => {
  const clock = await openWorldClock(page);
  const cityInput = clock.getByLabel('City or time zone');

  await cityInput.fill('Pariss');
  const suggestions = clock.getByRole('listbox', { name: 'Place suggestions' });
  await expect(suggestions).toBeVisible();
  await expect(suggestions.getByRole('option')).toHaveCount(1);
  await expect(suggestions.getByRole('option').first()).toContainText('Paris');
  await expect(suggestions.getByRole('option').first()).toContainText('France');
  await expect(suggestions.getByRole('option').first()).toContainText('Europe/Paris');
  await expect(clock.locator('.clock-item[data-zone="Europe/Paris"]')).toHaveCount(0);

  await suggestions.getByRole('option').first().click();
  await expect(clock.locator('.clock-item[data-zone="Europe/Paris"] strong')).toHaveText('Paris');
  await expect(cityInput).toHaveValue('');
  await expect(suggestions).toBeHidden();
});

test('the unified search includes country and alternate-name matches', async ({ page }) => {
  const clock = await openWorldClock(page);
  const search = clock.getByLabel('City or time zone');
  const suggestions = clock.getByRole('listbox', { name: 'Place suggestions' });

  await search.fill('India');
  await expect(suggestions).toBeVisible();
  await expect.poll(() => suggestions.locator('[role="option"]').evaluateAll(options =>
    options.some(option => option.textContent.includes('India'))
  )).toBe(true);

  await search.fill('Saigon');
  await expect(suggestions.getByRole('option').first()).toContainText('Ho Chi Minh City');
  await expect(suggestions.getByRole('option').first()).toContainText('Asia/Ho_Chi_Minh');
  await suggestions.getByRole('option').first().click();
  await expect(clock.locator('.clock-item[data-zone="Asia/Ho_Chi_Minh"] strong'))
    .toHaveText('Ho Chi Minh City');
});

test('every curated city uses a time zone accepted by the browser runtime', async ({ page }) => {
  const invalidCities = await page.evaluate(async () => {
    const { CITY_OPTIONS } = await import(new URL('apps/world-clock.js', document.baseURI).href);
    return CITY_OPTIONS.filter(({ zone }) => {
      if (typeof zone !== 'string' || zone.length === 0) return true;
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return false;
      } catch {
        return true;
      }
    }).map(({ city, country, zone }) => ({ city, country, zone }));
  });

  expect(
    invalidCities,
    `Invalid IANA time zone(s): ${invalidCities.map(({ city, country, zone }) => `${city} · ${country}: ${zone}`).join('; ')}`,
  ).toEqual([]);
});

test('search suggestions stay attached to the field and support keyboard selection of remote places', async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      results: [
        { name: 'Springfield', admin1: 'Illinois', country: 'United States', timezone: 'America/Chicago' },
        { name: 'Springfield', admin1: 'Massachusetts', country: 'United States', timezone: 'America/New_York' },
      ],
    }),
  }));
  const clock = await openWorldClock(page);
  const search = clock.getByLabel('City or time zone');
  const suggestions = clock.getByRole('listbox', { name: 'Place suggestions' });
  await search.fill('Springfield');
  await expect(suggestions.getByRole('option')).toHaveCount(2);
  await expect(suggestions.getByRole('option').nth(0)).toContainText('Illinois');
  await expect(suggestions.getByRole('option').nth(1)).toContainText('Massachusetts');
  const inputBox = await search.boundingBox();
  const popupBox = await suggestions.boundingBox();
  expect(popupBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
  expect(Math.abs(popupBox.x - inputBox.x)).toBeLessThan(2);

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /option-0$/);
  await search.press('Enter');
  await expect(clock.locator('.clock-item[data-zone="America/Chicago"] strong')).toHaveText('Springfield');
});

test('updates the displayed city for a shared time zone and keeps both clocks after reload', async ({ page }) => {
  let clock = await openWorldClock(page);
  const search = clock.getByLabel('City or time zone');

  await search.fill('Dallas');
  await clock.getByRole('button', { name: 'Add clock' }).click();
  await expect(clock.locator('.clock-item[data-zone="America/Chicago"] strong')).toHaveText('Dallas');

  await search.fill('Chicago');
  await clock.getByRole('button', { name: 'Add clock' }).click();
  const chicagoZoneClocks = clock.locator('.clock-item[data-zone="America/Chicago"]');
  await expect(chicagoZoneClocks).toHaveCount(1);
  await expect(chicagoZoneClocks.locator('strong')).toHaveText('Chicago');

  await search.fill('Sydney');
  await clock.getByRole('button', { name: 'Add clock' }).click();
  await expect(clock.locator('.clock-item[data-zone="Australia/Sydney"] strong')).toHaveText('Sydney');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({
      zones: expect.arrayContaining(['America/Chicago', 'Australia/Sydney']),
      cityLabels: { 'America/Chicago': 'Chicago', 'Australia/Sydney': 'Sydney' },
    });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  clock = await getWorldClock(page);
  await expect(clock.locator('.clock-item[data-zone="America/Chicago"] strong')).toHaveText('Chicago');
  await expect(clock.locator('.clock-item[data-zone="Australia/Sydney"] strong')).toHaveText('Sydney');
  await expect(clock.locator('.clock-item[data-zone="America/Chicago"]')).toHaveCount(1);
});

test('keeps the selected city name when its existing time zone is added directly', async ({ page }) => {
  let clock = await openWorldClock(page);
  await clock.getByLabel('City or time zone').fill('Bengaluru');
  await clock.getByRole('button', { name: 'Add clock' }).click();

  const bengaluru = clock.locator('.clock-item[data-zone="Asia/Kolkata"]');
  await expect(bengaluru.locator('strong')).toHaveText('Bengaluru');
  const savedZones = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).zones, PREF_KEY);

  await clock.getByLabel('City or time zone').fill('Asia/Kolkata');
  await clock.getByRole('button', { name: 'Add clock' }).click();

  await expect(clock.locator('.clock-item[data-zone="Asia/Kolkata"]')).toHaveCount(1);
  await expect(bengaluru.locator('strong')).toHaveText('Bengaluru');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({
      cityLabels: { 'Asia/Kolkata': 'Bengaluru' },
    });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).zones, PREF_KEY))
    .toEqual(savedZones);

  await page.reload();
  await page.locator('#welcome-win-close').click();
  clock = await getWorldClock(page);

  const restoredBengaluru = clock.locator('.clock-item[data-zone="Asia/Kolkata"]');
  await expect(restoredBengaluru).toHaveCount(1);
  await expect(restoredBengaluru.locator('strong')).toHaveText('Bengaluru');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({
      zones: savedZones,
      cityLabels: { 'Asia/Kolkata': 'Bengaluru' },
    });
});

test('accepts a direct IANA zone and restores saved zones and city names after reload', async ({ page }) => {
  let clock = await openWorldClock(page);
  await clock.getByLabel('City or time zone').fill('America/Argentina/Buenos_Aires');
  await clock.getByRole('button', { name: 'Add clock' }).click();

  const buenosAires = clock.locator('.clock-item[data-zone="America/Argentina/Buenos_Aires"]');
  await expect(buenosAires.locator('strong')).toHaveText('Buenos Aires');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({ zones: expect.arrayContaining(['America/Argentina/Buenos_Aires']) });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  clock = await getWorldClock(page);
  await expect(clock.locator('.clock-item[data-zone="America/Argentina/Buenos_Aires"] strong'))
    .toHaveText('Buenos Aires');
});

test('switches between list and grid and analog and digital clock faces', async ({ page }) => {
  const clock = await openWorldClock(page);
  const layout = clock.getByRole('button', { name: 'Change clock layout' });
  const faceMode = clock.getByRole('button', { name: 'Change clock face' });
  const list = clock.locator('.clock-list');
  const face = clock.locator('.clock-item .clock-face').first();
  const time = clock.locator('.clock-item time').first();

  await expect(layout).toHaveText('List');
  await expect(faceMode).toHaveText('Digital');
  await expect(list).not.toHaveClass(/grid/);
  await expect(face).toBeHidden();
  await expect(time).not.toHaveClass(/sr-only/);

  await layout.click();
  await faceMode.click();
  await expect(layout).toHaveText('Grid');
  await expect(faceMode).toHaveText('Analog');
  await expect(list).toHaveClass(/grid/);
  await expect(face).toBeVisible();
  await expect(time).toHaveClass(/sr-only/);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({ layout: 'grid', face: 'analog' });

  await faceMode.click();
  await expect(faceMode).toHaveText('Digital');
  await expect(face).toBeHidden();
  await expect(time).not.toHaveClass(/sr-only/);
});
