const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});

async function openUtility(page, type) {
  await page.locator('#app-menu-btn').click();
  await page.locator(`#app-list .app-launcher[data-type="${type}"]`).click();
  return page.locator(`.app-window[data-type="${type}"]`).last();
}

test('calculator, calendar, and weather controls follow shared theme tokens', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const calculatorColors = {};
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    calculatorColors[theme] = await calculator.locator('.calc').evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      keyRadius: getComputedStyle(element.querySelector('.calc-key')).borderRadius,
    }));
  }
  expect(calculatorColors.dark.background).not.toBe(calculatorColors.light.background);
  expect(calculatorColors.dark.color).not.toBe(calculatorColors.light.color);
  expect(calculatorColors.dark.keyRadius).toBe(calculatorColors.light.keyRadius);

  const calendar = await openUtility(page, 'calendar');
  const calendarStyle = await calendar.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    buttonRadius: getComputedStyle(element.querySelector('.cal-nav-button')).borderRadius,
    viewButtonHeight: element.querySelector('.cal-view-button').getBoundingClientRect().height,
  }));
  expect(calendarStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(calendarStyle.buttonRadius).toBe('10.4px');
  expect(calendarStyle.viewButtonHeight).toBeGreaterThanOrEqual(38);

  const weather = await openUtility(page, 'weather');
  const fields = weather.locator('.weather-setup .util-field');
  await expect(fields).toHaveCount(2);
  const weatherFieldStyle = await fields.first().evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(weatherFieldStyle.radius).toBe('10.4px');
  expect(weatherFieldStyle.border).toBe('1px');
  expect(weatherFieldStyle.background).not.toBe('rgba(0, 0, 0, 0)');
});

test('top-bar menu and view toggles share the same active appearance', async ({ page }) => {
  const activeStyles = await page.evaluate(() => {
    const states = [
      ['app-menu-btn', 'aria-expanded'],
      ['win-menu-btn', 'aria-expanded'],
      ['show-desktop-btn', 'aria-pressed'],
      ['overview-btn', 'aria-pressed'],
    ];
    return states.map(([id, attribute]) => {
      const button = document.getElementById(id);
      button.setAttribute(attribute, 'true');
      const style = getComputedStyle(button);
      return { background: style.backgroundColor, color: style.color };
    });
  });
  expect(new Set(activeStyles.map(style => style.background)).size).toBe(1);
  expect(new Set(activeStyles.map(style => style.color)).size).toBe(1);
  expect(activeStyles[0].color).toBe('rgb(255, 255, 255)');
});

test('World Clock search suggestions remain attached and fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      results: [{
        name: 'Springfield',
        admin1: 'Illinois',
        country: 'United States',
        timezone: 'America/Chicago',
      }],
    }),
  }));
  const clock = await openUtility(page, 'world-clock');
  const search = clock.getByLabel('City or time zone');
  const suggestions = clock.getByRole('listbox', { name: 'Place suggestions' });
  await search.fill('Springfield');
  await expect(suggestions.getByRole('option')).toHaveCount(1);

  const [inputBox, popupBox] = await Promise.all([search.boundingBox(), suggestions.boundingBox()]);
  expect(Math.abs(popupBox.x - inputBox.x)).toBeLessThan(2);
  expect(popupBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(390);
});
