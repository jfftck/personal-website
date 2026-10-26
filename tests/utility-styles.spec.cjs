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
  const weatherSelect = weather.locator('.weather-unit');
  await expect(weatherSelect).toHaveClass(/standard-select-native/);
  const trigger = weather.getByRole('combobox', { name: 'Temperature units', exact: true });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  const selectStyle = await trigger.evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, border: style.borderTopWidth, transform: style.transform };
  });
  expect(selectStyle.radius).toBe('10.4px');
  expect(selectStyle.border).toBe('1px');
  expect(selectStyle.transform).toBe('none');

  await trigger.click();
  const popupId = await trigger.getAttribute('aria-controls');
  const popup = page.locator(`[id="${popupId}"]`);
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute('role', 'listbox');
  const popupStyles = await popup.evaluate(element => {
    const style = getComputedStyle(element);
    return { blur: style.backdropFilter, background: style.backgroundColor };
  });
  expect(popupStyles.blur).toContain('blur(');
  expect(popupStyles.background).not.toBe('rgba(0, 0, 0, 0)');
  const [triggerBox, popupBox] = await Promise.all([trigger.boundingBox(), popup.boundingBox()]);
  expect(Math.abs(popupBox.x - triggerBox.x)).toBeLessThan(2);
});

test('calculator supports scientific calculations, reusable history, and graphing', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const output = calculator.locator('.calc-value');

  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '3', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('10');
  const historyEntry = calculator.getByRole('button', { name: 'Reuse result 10 from 7+3' });
  await expect(historyEntry).toBeVisible();
  await historyEntry.click();
  await expect(calculator.getByRole('textbox', { name: 'Expression' })).toHaveValue('10');

  await calculator.getByRole('button', { name: 'Scientific' }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('3');

  await calculator.getByRole('button', { name: 'Graph' }).click();
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveAttribute('d', /M/);
  await expect(calculator.locator('.calc-graph-status')).toContainText('Plotted');
  await calculator.getByLabel('Function of x').fill('window.alert(1)');
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('Cannot plot');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(0);
});

test('utility app layouts respond to their own narrow window width', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.evaluate(element => {
    element.style.width = '360px';
    element.style.flex = '0 0 360px';
  });
  await expect.poll(() => calculator.locator('.calc-workspace').evaluate(element => {
    const history = element.querySelector('.calc-history').getBoundingClientRect();
    const main = element.querySelector('.calc-main').getBoundingClientRect();
    return history.top > main.top;
  })).toBe(true);

  const calendar = await openUtility(page, 'calendar');
  await calendar.evaluate(element => {
    element.style.width = '320px';
    element.style.flex = '0 0 320px';
  });
  await calendar.getByRole('button', { name: 'Week', exact: true }).click();
  await calendar.locator('.cal-weekend-control input').check();
  const columns = await calendar.locator('.cal-week-grid').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
});

test('custom dropdown keeps working without Popover or CSS Anchor support', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: undefined });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: undefined });
    Object.defineProperty(CSS, 'supports', { configurable: true, value: () => false });
  });
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const weather = await openUtility(page, 'weather');
  const select = weather.locator('.weather-unit');
  const trigger = weather.getByRole('combobox', { name: 'Temperature units', exact: true });
  const popupId = await select.getAttribute('data-custom-select-popup');
  const popup = page.locator(`[id="${popupId}"]`);

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute('popover');
  expect(await popup.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('data-value', 'fahrenheit');
  await expect(select).toHaveValue('fahrenheit');
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
  await expect(suggestions).toHaveClass(/menu-popover/);
  const panelStyles = await suggestions.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
      border: style.borderColor,
      radius: style.borderRadius,
      shadow: style.boxShadow,
    };
  });
  expect(panelStyles.backdrop).toContain('blur(');
  expect(panelStyles.background).not.toBe('rgba(0, 0, 0, 0)');

  const [inputBox, popupBox] = await Promise.all([search.boundingBox(), suggestions.boundingBox()]);
  expect(Math.abs(popupBox.x - inputBox.x)).toBeLessThan(2);
  expect(popupBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(390);
});

test('sticky notes expose accessible color choices that adapt to the system theme', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('desktop-theme'));
  await page.emulateMedia({ colorScheme: 'light' });
  const notes = await openUtility(page, 'sticky-notes');
  await notes.locator('.note-create').click();

  const editor = notes.locator('.note-editor');
  const picker = editor.locator('.note-color-picker');
  const radios = picker.getByRole('radio');
  await expect(picker.locator('legend')).toHaveText('Background color');
  await expect(radios).toHaveCount(6);
  const yellow = picker.getByRole('radio', { name: 'Yellow note background' });
  await expect(yellow).toBeChecked();
  await yellow.focus();
  await page.keyboard.press('ArrowRight');
  await expect(picker.getByRole('radio', { name: 'Orange note background' })).toBeChecked();
  await notes.locator('.note-color-choice[data-note-color="purple"]').click();
  await expect(picker.getByRole('radio', { name: 'Purple note background' })).toBeChecked();
  await expect(editor).toHaveAttribute('data-note-color', 'purple');

  await notes.getByRole('textbox', { name: 'Note title' }).fill('Theme note');
  await notes.locator('.note-desktop-toggle input').check();
  const widget = page.locator('.desktop-note-widget');
  await expect(widget).toHaveAttribute('data-note-color', 'purple');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('personal-desktop-sticky-notes-v1') || '[]');
    return saved[0]?.color;
  })).toBe('purple');

  const lightColors = await editor.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  const lightWidgetBackground = await widget.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => editor.evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(lightColors.background);
  await expect.poll(() => widget.evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(lightWidgetBackground);
  const darkColors = await editor.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  expect(darkColors.text).not.toBe(lightColors.text);
  await expect(notes.locator('.note-select.active')).toHaveAttribute('aria-pressed', 'true');
});
