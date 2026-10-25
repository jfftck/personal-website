const { test, expect } = require('@playwright/test');

const PREF_KEY = 'personal-desktop-world-clock-v1';
let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
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

test('groups cities by their IANA region and adds the selected city time zone', async ({ page }) => {
  const clock = await openWorldClock(page);
  const browser = clock.getByLabel('Browse cities by region');

  const groups = await browser.locator('optgroup').evaluateAll(elements =>
    elements.map(element => element.label).sort()
  );
  expect(groups).toEqual(['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']);

  const representativeCities = {
    Africa: 'Accra · Ghana',
    Americas: 'Bogotá · Colombia',
    Asia: 'Tokyo · Japan',
    Europe: 'London · United Kingdom',
    Oceania: 'Sydney · Australia',
  };
  for (const [region, city] of Object.entries(representativeCities)) {
    await expect(browser.locator(`optgroup[label="${region}"] option`, { hasText: city })).toHaveCount(1);
  }
  await expect(browser.locator('optgroup[label="Europe"] option', { hasText: 'Reykjavík · Iceland' }))
    .toHaveCount(1);

  await browser.selectOption({ label: 'Tokyo · Japan' });

  const tokyo = clock.locator('.clock-item[data-zone="Asia/Tokyo"]');
  await expect(tokyo.locator('strong')).toHaveText('Tokyo');
  await browser.selectOption({ label: 'Reykjavík · Iceland' });

  const reykjavik = clock.locator('.clock-item[data-zone="Atlantic/Reykjavik"]');
  await expect(reykjavik.locator('strong')).toHaveText('Reykjavík');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREF_KEY))
    .toMatchObject({
      zones: expect.arrayContaining(['Asia/Tokyo', 'Atlantic/Reykjavik']),
      cityLabels: { 'Asia/Tokyo': 'Tokyo', 'Atlantic/Reykjavik': 'Reykjavík' },
    });
  await expect(browser).toHaveValue('');
});

test('updates the displayed city for a shared time zone and keeps both clocks after reload', async ({ page }) => {
  let clock = await openWorldClock(page);
  const browser = clock.getByLabel('Browse cities by region');

  await browser.selectOption({ label: 'Dallas · United States' });
  await expect(clock.locator('.clock-item[data-zone="America/Chicago"] strong')).toHaveText('Dallas');

  await browser.selectOption({ label: 'Chicago · United States' });
  const chicagoZoneClocks = clock.locator('.clock-item[data-zone="America/Chicago"]');
  await expect(chicagoZoneClocks).toHaveCount(1);
  await expect(chicagoZoneClocks.locator('strong')).toHaveText('Chicago');

  await browser.selectOption({ label: 'Sydney · Australia' });
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
