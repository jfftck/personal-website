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
  await expect(calculator.getByText('DESK / 04')).toHaveCount(0);
  const calculatorColors = {};
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    calculatorColors[theme] = await calculator.locator('.calc').evaluate(element => ({
      color: getComputedStyle(element).color,
      keyRadius: getComputedStyle(element.querySelector('.calc-key')).borderRadius,
    }));
  }
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

  await expect(calculator.locator('.calc-header h2')).toHaveCount(0);
  await expect(calculator.locator('.calc-header .calc-memory')).toBeVisible();
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
  await expect(calculator.locator('.calc-header .calc-memory')).toBeHidden();
  await expect(calculator.locator('.calc-header-graph-actions')).toBeVisible();
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Edit functions' })).toHaveCount(0);
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Graph settings' })).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveAttribute('d', /M/);
  await expect(calculator.locator('.calc-graph-status')).toContainText('Plotted');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await calculator.getByLabel('Function expression').fill('window.alert(1)');
  await calculator.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-editor-error')).toContainText('Unknown function or name');
  await calculator.getByRole('button', { name: 'Close function editor' }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator supports selectable bases, memory, constants, backspace, and compact scientific keys', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const expression = calculator.getByRole('textbox', { name: 'Expression' });
  const output = calculator.locator('.calc-value');

  const basicLayout = await calculator.locator('.calc-keypad-columns').evaluate(element => {
    const keypad = element.querySelector('.calc-keys').getBoundingClientRect();
    const columns = element.getBoundingClientRect();
    const wrapper = element.closest('.calc-wrap');
    return {
      keypadWidth: keypad.width,
      columnsWidth: columns.width,
      supportDisplay: getComputedStyle(element.querySelector('.calc-keypad-support')).display,
      padding: getComputedStyle(wrapper).padding,
    };
  });
  expect(Math.abs(basicLayout.keypadWidth - basicLayout.columnsWidth)).toBeLessThanOrEqual(2);
  expect(basicLayout.supportDisplay).toBe('none');
  expect(basicLayout.padding.split(' ').some(value => Number.parseFloat(value) > 0)).toBe(true);
  const displayGeometry = await calculator.locator('.calc-display').evaluate(element => {
    const panel = element.getBoundingClientRect();
    const button = element.querySelector('.calc-backspace').getBoundingClientRect();
    const label = element.querySelector('.calc-expression-label').getBoundingClientRect();
    return { panel, button, label };
  });
  expect(displayGeometry.panel.right - displayGeometry.button.right).toBeLessThan(20);
  expect(displayGeometry.button.top - displayGeometry.panel.top).toBeLessThan(20);
  expect(displayGeometry.button.left).toBeGreaterThan(displayGeometry.label.right);

  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeHidden();
  await calculator.getByRole('button', { name: 'Scientific' }).click();
  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeVisible();
  await expression.fill('7+3');
  await calculator.getByRole('button', { name: 'Base 2' }).click();
  await expect(expression).toHaveValue('0b111+0b11');
  await expect(output).toHaveText('0b1010');
  await calculator.getByRole('button', { name: 'Base 8' }).click();
  await expect(expression).toHaveValue('0o7+0o3');
  await expect(output).toHaveText('0o12');
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  await expect(expression).toHaveValue('0x7+0x3');
  await expect(output).toHaveText('0xa');

  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await expression.press('F');
  await expect(expression).toHaveValue('0xF');
  await expect(output).toHaveText('0xf');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Hex digit A' }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '1', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('0xb');

  await expression.fill('123');
  await expression.evaluate(element => element.setSelectionRange(2, 2));
  await calculator.getByRole('button', { name: 'Backspace' }).click();
  await expect(expression).toHaveValue('13');
  await expect(output).toHaveText('0x13');

  await calculator.getByRole('button', { name: 'Base 10' }).click();
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  await calculator.getByRole('button', { name: 'Basic' }).click();
  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeHidden();
  await expect(expression).toHaveValue('19');
  await expect(output).toHaveText('19');
  await expression.fill('12');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('12');
  await calculator.getByRole('button', { name: 'Add to memory' }).click();
  await expression.fill('3');
  await calculator.getByRole('button', { name: 'Subtract from memory' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('21');

  await calculator.getByRole('button', { name: 'Scientific' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Pi' }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: 'Euler’s number' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('5.85987448205');

  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '960px';
    appWindow.style.height = '680px';
  });
  const keypadColumns = calculator.locator('.calc-keypad-columns');
  const wideColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(wideColumns).toBe(2);
  const widePlacement = await keypadColumns.evaluate(element => {
    const keys = element.querySelector('.calc-keys').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { keysRight: keys.right, supportLeft: support.left, supportWidth: support.width };
  });
  expect(widePlacement.supportLeft).toBeGreaterThanOrEqual(widePlacement.keysRight);
  expect(widePlacement.supportWidth).toBeGreaterThan(180);
  expect(await calculator.locator('.calc-keys').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-keypad-support').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-memory').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-base-control').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-scientific').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  expect(await calculator.locator('.calc-hex-keys').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '480px';
    appWindow.style.height = '760px';
  });
  const narrowColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(narrowColumns).toBe(2);
  const mediumPlacement = await keypadColumns.evaluate(element => {
    const keys = element.querySelector('.calc-keys').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { keysRight: keys.right, supportLeft: support.left };
  });
  expect(mediumPlacement.supportLeft).toBeGreaterThanOrEqual(mediumPlacement.keysRight);
  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '360px';
    appWindow.style.height = '760px';
  });
  const compactColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(compactColumns).toBe(1);
  const order = await keypadColumns.evaluate(element => {
    const extra = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    const number = element.querySelector('.calc-keys').getBoundingClientRect();
    const keypad = element.querySelector('.calc-keys');
    const keypadBox = keypad.getBoundingClientRect();
    const lastKeyBox = keypad.lastElementChild.getBoundingClientRect();
    const columnsBox = element.getBoundingClientRect();
    return {
      supportTop: extra.top,
      numberTop: number.top,
      keypadHeight: keypadBox.height,
      lastKeyBottom: lastKeyBox.bottom,
      keypadBottom: keypadBox.bottom,
      keypadWidth: keypadBox.width,
      columnsWidth: columnsBox.width,
    };
  });
  expect(order.supportTop).toBeLessThan(order.numberTop);
  expect(order.keypadHeight).toBeGreaterThan(0);
  expect(Math.abs(order.lastKeyBottom - order.keypadBottom), JSON.stringify(order)).toBeLessThanOrEqual(2);
  expect(Math.abs(order.keypadWidth - order.columnsWidth)).toBeLessThanOrEqual(2);
  expect(await calculator.locator('.calc').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-main').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const surfaces = await calculator.locator('.calc').evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderTopWidth,
    shadow: getComputedStyle(element).boxShadow,
    displayBackground: getComputedStyle(element.querySelector('.calc-display')).backgroundColor,
    historyBackground: getComputedStyle(element.querySelector('.calc-history')).backgroundColor,
    sidebarBackground: getComputedStyle(element).getPropertyValue('--sidebar-bg').trim(),
  }));
  expect(surfaces.background).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.border).toBe('0px');
  expect(surfaces.shadow).toBe('none');
  expect(surfaces.displayBackground).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.historyBackground).toBe(surfaces.sidebarBackground);
});

test('calculator graph edits multiple functions in an accessible keypad dialog', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('radio')).toHaveCount(6);
  await expect(editor.getByRole('button', { name: 'sin(', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Add function' }).click();
  const functionExpression = editor.getByRole('textbox', { name: 'Function expression' });
  await functionExpression.fill('');
  await editor.getByRole('button', { name: 'cos(', exact: true }).click();
  await editor.getByRole('button', { name: '2', exact: true }).click();
  await editor.getByRole('button', { name: '×', exact: true }).click();
  await editor.getByRole('button', { name: 'x', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(functionExpression).toHaveValue('cos(2*x)');
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await expect(editor.getByRole('radio', { name: 'Orange line color' })).toBeChecked();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(2);
  const colors = await calculator.locator('.calc-graph-line').evaluateAll(lines => lines.map(line => line.style.getPropertyValue('--function-color')));
  expect(new Set(colors).size).toBe(2);
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator allows an empty graph and adding functions afterward', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await calculator.locator('.calc-function-item').getByRole('button', { name: /^Remove function/ }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await expect(calculator.locator('.calc-function-empty')).toHaveText('No functions yet');
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(0);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-empty')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Add function' }).click();
  await expect(editor.locator('.calc-editor-empty')).toBeHidden();
  await expect(editor.getByLabel('Function expression')).toHaveValue('sin(x)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(1);
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator graph settings keep modes and plot ranges independent', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await expect(settings.getByLabel('Minimum theta')).toBeVisible();
  await settings.getByLabel('Maximum theta').fill('6.28');
  await settings.getByLabel('Minimum r').fill('0');
  await settings.getByLabel('Maximum r').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('polar');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await graphMode.click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await expect(settings.getByLabel('Minimum t')).toBeVisible();
  await settings.getByLabel('Maximum t').fill('6.28');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await expect(editor.getByLabel('x(t)')).toBeVisible();
  await expect(editor.getByLabel('y(t)')).toBeVisible();
  await editor.getByLabel('x(t)').fill('cos(t)');
  await editor.getByLabel('y(t)').fill('sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('parametric');
});

test('calculator fits visible curves in every graph mode without changing configured ranges', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  const view = async () => calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('4*x+3');
  await editor.getByRole('button', { name: 'Add function' }).click();
  await editor.getByLabel('Function expression').fill('100*x');
  await editor.getByLabel('Show function 2').uncheck();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Fit curves' }).click();
  let fitted = await view();
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMin).toBeLessThan(-13);
  expect(fitted.yMax).toBeGreaterThan(19);
  await expect(calculator.locator('.calc-graph-status')).toContainText('1 visible curve');
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await settings.getByRole('button', { name: 'Close graph settings' }).click();
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual({ xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
  await calculator.locator('.calc-function-item').last().getByRole('button', { name: /^Remove function/ }).click();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('1');
  await settings.getByLabel('Maximum theta').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Fit curves' }).click();
  fitted = await view();
  expect(fitted.thetaMin).toBe(1);
  expect(fitted.thetaMax).toBe(5);
  expect(fitted.rMin).toBeLessThanOrEqual(1);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('5');
  await expect(settings.getByLabel('Minimum r')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum r')).toHaveValue('10');
  await settings.getByRole('button', { name: 'Close graph settings' }).click();
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('-2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Fit curves' }).click();
  fitted = await view();
  expect(fitted.rMin).toBe(0);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('x(t)').fill('2*cos(t)');
  await editor.getByLabel('y(t)').fill('3*sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Fit curves' }).click();
  fitted = await view();
  expect(fitted.tMin).toBe(0);
  expect(fitted.tMax).toBe(6.283);
  expect(fitted.xMin).toBeLessThanOrEqual(-2);
  expect(fitted.xMax).toBeGreaterThanOrEqual(2);
  expect(fitted.xMin).toBeGreaterThan(-10);
  expect(fitted.xMax).toBeLessThan(10);
  expect(fitted.yMin).toBeLessThanOrEqual(-3);
  expect(fitted.yMax).toBeGreaterThanOrEqual(3);
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('PARAMETRIC');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum t')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum t')).toHaveValue('6.283');
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await settings.getByRole('button', { name: 'Close graph settings' }).click();
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual({ tMin: 0, tMax: 6.283, xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
});

test('calculator Fit curves includes a narrow peak between rendered samples', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('100/(1000000*(x-0.008)^2+1)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Fit curves' }).click();

  const fitted = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMax).toBeGreaterThan(50);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
});

test('calculator graph functions, colors, visibility, mode, and ranges persist across reopen and refresh', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('-1');
  await settings.getByLabel('Maximum theta').fill('7');
  await settings.getByLabel('Minimum r').fill('-2');
  await settings.getByLabel('Maximum r').fill('6');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await editor.getByRole('button', { name: 'Add function' }).click();
  await editor.getByLabel('Function expression').fill('cos(2*theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -1 to 7/);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect.poll(() => calculator.locator('.calc-function-swatch').first().evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('-1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('7');
  await expect(settings.getByLabel('Minimum r')).toHaveValue('-2');
  await expect(settings.getByLabel('Maximum r')).toHaveValue('6');
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Cartesian/ }).click();
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await settings.getByRole('button', { name: 'Close graph settings' }).click();

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect.poll(() => calculator.locator('.calc-function-swatch').first().evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('-1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('7');
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Cartesian/ }).click();
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
});

test('open calculator windows stay in sync when graph settings change', async ({ page }) => {
  const firstCalculator = await openUtility(page, 'calculator');
  const secondCalculator = await openUtility(page, 'calculator');
  await expect(page.locator('.app-window[data-type="calculator"]')).toHaveCount(2);
  await firstCalculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await secondCalculator.getByRole('button', { name: 'Graph', exact: true }).click();

  await firstCalculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = firstCalculator.getByRole('dialog', { name: 'Graph settings' });
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('-2');
  await settings.getByLabel('Maximum theta').fill('8');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(secondCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(secondCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);

  await firstCalculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = firstCalculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await editor.getByRole('button', { name: 'Add function' }).click();
  await editor.getByLabel('Function expression').fill('cos(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect(secondCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(secondCalculator.locator('.calc-function-summary').first()).toContainText('sin(theta)');
  await expect.poll(() => secondCalculator.locator('.calc-function-swatch').first()
    .evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await firstCalculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(secondCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);

  await secondCalculator.locator('.calc-graph-toolbar').click();
  await page.locator('#close-btn').click();
  const reopenedCalculator = await openUtility(page, 'calculator');
  await reopenedCalculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(reopenedCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(reopenedCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(reopenedCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect(reopenedCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);
});

test('calculator safely resets malformed or outdated saved graph settings', async ({ page }) => {
  for (const saved of ['{broken', JSON.stringify({ version: 0, graphMode: 'cartesian' })]) {
    await page.evaluate(value => localStorage.setItem('personal-desktop-calculator-graph-v1', value), saved);
    const calculator = await openUtility(page, 'calculator');
    await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
    const recovery = calculator.locator('.calc-storage-recovery');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Defaults are active.');
    await recovery.getByRole('button', { name: 'Reset saved graph' }).click();
    await expect(recovery).toBeHidden();
    await expect(calculator.locator('.calc-function-item')).toHaveCount(1);
    await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('personal-desktop-calculator-graph-v1'))).toBeNull();
    await page.locator('#close-btn').click();
  }
});

test('calculator keeps graph storage warnings visible until settings save successfully', async ({ page }) => {
  await page.evaluate(() => {
    window.__graphStorageAccess = { readBlocked: true, writeBlocked: false };
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'personal-desktop-calculator-graph-v1' && window.__graphStorageAccess.readBlocked) {
        throw new DOMException('Storage access is blocked', 'SecurityError');
      }
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'personal-desktop-calculator-graph-v1' && window.__graphStorageAccess.writeBlocked) {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  const warning = calculator.locator('.calc-storage-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('could not read saved graph settings');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await calculator.getByRole('button', { name: 'Apply settings' }).click();
  await expect(warning).toBeHidden();

  await page.evaluate(() => {
    window.__graphStorageAccess.readBlocked = false;
    window.__graphStorageAccess.writeBlocked = true;
  });
  await calculator.getByRole('button', { name: 'Zoom in' }).click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('could not be saved');
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(warning).toBeVisible();

  await page.evaluate(() => { window.__graphStorageAccess.writeBlocked = false; });
  await calculator.getByRole('button', { name: 'Zoom in' }).click();
  await expect(warning).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || 'null')?.version
  )).toBe(1);
});

test('calculator graph zoom and pan work in every mode without changing configured ranges', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  const plot = calculator.locator('.calc-plot-area');
  const view = async () => plot.evaluate(element => JSON.parse(element.dataset.view));
  await expect(plot).toHaveAttribute('aria-valuetext', 'x -10 to 10, y -10 to 10');
  await expect(plot.locator('.calc-graph-grid').first()).toBeVisible();
  await expect(plot.locator('.calc-graph-label').first()).toBeVisible();
  const cartesianInitial = await view();
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => {
    const current = await view();
    return current.xMax - current.xMin;
  }).toBeLessThan(cartesianInitial.xMax - cartesianInitial.xMin);

  const beforeDrag = await view();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2 + 18);
  await page.mouse.up();
  await expect.poll(async () => (await view()).xMin).not.toBe(beforeDrag.xMin);

  await plot.focus();
  const beforeKeyboardPan = await view();
  const expression = await calculator.locator('.calc-expression').inputValue();
  await plot.press('ArrowRight');
  await expect.poll(async () => (await view()).xMin).not.toBe(beforeKeyboardPan.xMin);
  const beforeKeyboardZoom = await view();
  await plot.press('Shift+=');
  await expect.poll(async () => (await view()).xMax - (await view()).xMin)
    .toBeLessThan(beforeKeyboardZoom.xMax - beforeKeyboardZoom.xMin);
  await expect(calculator.locator('.calc-expression')).toHaveValue(expression);
  await plot.press('Home');
  await expect.poll(view).toEqual(cartesianInitial);

  await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const fire = (type, id, x, y) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', button: 0,
      clientX: rect.left + x / 640 * rect.width, clientY: rect.top + y / 400 * rect.height,
    }));
    fire('pointerdown', 41, 260, 200);
    fire('pointerdown', 42, 380, 200);
    fire('pointermove', 42, 420, 200);
    fire('pointerup', 41, 260, 200);
    fire('pointerup', 42, 420, 200);
  });
  await expect.poll(async () => (await view()).xMax - (await view()).xMin)
    .toBeLessThan(cartesianInitial.xMax - cartesianInitial.xMin);
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual(cartesianInitial);
  await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const fire = (type, x) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 43, pointerType: 'touch', button: 0,
      clientX: rect.left + x / 640 * rect.width, clientY: rect.top + rect.height / 2,
    }));
    fire('pointerdown', 300);
    fire('pointermove', 340);
    fire('pointerup', 340);
  });
  await expect.poll(async () => (await view()).xMin).not.toBe(cartesianInitial.xMin);
  await calculator.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(view).toEqual(cartesianInitial);

  for (const [mode, label, xMin, xMax, yMin, yMax] of [
    ['polar', /Polar/, 'Minimum theta', 'Maximum theta', 'Minimum r', 'Maximum r'],
    ['parametric', /Parametric/, 'Minimum t', 'Maximum t', 'Minimum x', 'Maximum x'],
  ]) {
    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await settings.getByRole('combobox', { name: 'Graph mode' }).click();
    await settings.getByRole('option', { name: label }).click();
    await settings.getByRole('button', { name: 'Apply settings' }).click();
    const configured = await view();
    await calculator.getByRole('button', { name: 'Zoom in' }).click();
    const zoomed = await view();
    expect(JSON.stringify(zoomed)).not.toBe(JSON.stringify(configured));
    await calculator.getByRole('button', { name: 'Reset view' }).click();
    await expect.poll(view).toEqual(configured);
    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const rangeDialog = calculator.getByRole('dialog', { name: 'Graph settings' });
    await expect(rangeDialog.getByLabel(xMin)).toHaveValue('0');
    await expect(rangeDialog.getByLabel(xMax)).toHaveValue('6.283');
    if (mode === 'polar') {
      await expect(rangeDialog.getByLabel(yMin)).toHaveValue('0');
      await expect(rangeDialog.getByLabel(yMax)).toHaveValue('10');
    } else {
      await expect(rangeDialog.getByLabel(yMin)).toHaveValue('-10');
      await expect(rangeDialog.getByLabel(yMax)).toHaveValue('10');
    }
    await rangeDialog.getByRole('button', { name: 'Close graph settings' }).click();
  }
});

test('calculator shows and copies the current view ranges in every graph mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  const plot = calculator.locator('.calc-plot-area');
  const rangesReadout = calculator.locator('.calc-view-ranges-values');
  const copyButton = calculator.getByRole('button', { name: 'Copy ranges' });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedGraphRanges = text; } },
    });
  });

  const modes = [
    { name: 'Cartesian', keys: ['xMin', 'xMax', 'yMin', 'yMax'], mins: ['Minimum x', 'Minimum y'], maxes: ['Maximum x', 'Maximum y'] },
    { name: 'Polar', keys: ['thetaMin', 'thetaMax', 'rMin', 'rMax'], mins: ['Minimum theta', 'Minimum r'], maxes: ['Maximum theta', 'Maximum r'] },
    { name: 'Parametric', keys: ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'], mins: ['Minimum t', 'Minimum x', 'Minimum y'], maxes: ['Maximum t', 'Maximum x', 'Maximum y'] },
  ];

  for (const [index, mode] of modes.entries()) {
    if (index > 0) {
      const settings = calculator.getByRole('button', { name: 'Graph settings' });
      await settings.click();
      const dialog = calculator.getByRole('dialog', { name: 'Graph settings' });
      await dialog.getByRole('combobox', { name: 'Graph mode' }).click();
      await dialog.getByRole('option', { name: new RegExp(mode.name) }).click();
      await dialog.getByRole('button', { name: 'Apply settings' }).click();
    }

    const configured = await plot.evaluate(element => JSON.parse(element.dataset.view));
    const initialText = await rangesReadout.inputValue();
    for (const key of mode.keys) expect(initialText).toContain(`${key}: ${configured[key]}`);

    await calculator.getByRole('button', { name: 'Zoom in' }).click();
    const current = await plot.evaluate(element => JSON.parse(element.dataset.view));
    expect(JSON.stringify(current)).not.toBe(JSON.stringify(configured));
    const currentText = await rangesReadout.inputValue();
    for (const key of mode.keys) expect(currentText).toContain(`${key}: ${current[key]}`);

    if (index === 1) {
      await copyButton.focus();
      await copyButton.press('Enter');
    } else {
      await copyButton.click();
    }
    await expect.poll(() => page.evaluate(() => window.__copiedGraphRanges)).toBe(currentText);
    await expect(calculator.locator('.calc-copy-view-ranges-status')).toHaveText('Current graph ranges copied.');

    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const dialog = calculator.getByRole('dialog', { name: 'Graph settings' });
    for (const [position, label] of mode.mins.entries()) {
      await expect(dialog.getByLabel(label)).toHaveValue(String(configured[mode.keys[position * 2]]));
      await expect(dialog.getByLabel(mode.maxes[position])).toHaveValue(String(configured[mode.keys[position * 2 + 1]]));
    }
    await dialog.getByRole('button', { name: 'Close graph settings' }).click();
    await calculator.getByRole('button', { name: 'Reset view' }).click();
  }
});

test('calculator copies and explicitly restores complete graph setups in every mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedGraphSetup = text; } },
    });
  });

  const modes = [
    {
      name: 'Cartesian',
      mode: 'cartesian',
      ranges: { xMin: '-4', xMax: '4', yMin: '-6', yMax: '6' },
      expression: '2*x+1',
      summary: 'y = 2*x+1',
    },
    {
      name: 'Polar',
      mode: 'polar',
      ranges: { thetaMin: '0', thetaMax: '6.2', rMin: '0', rMax: '8' },
      expression: 'sin(theta)',
      summary: 'r(θ) = sin(theta)',
    },
    {
      name: 'Parametric',
      mode: 'parametric',
      ranges: { tMin: '0', tMax: '6.28', xMin: '-2', xMax: '2', yMin: '-3', yMax: '3' },
      xExpression: 'cos(2*t)',
      yExpression: 'sin(2*t)',
      summary: 'x(t)=cos(2*t) · y(t)=sin(2*t)',
    },
  ];

  for (const [index, mode] of modes.entries()) {
    const settingsButton = calculator.getByRole('button', { name: 'Graph settings' });
    await settingsButton.click();
    const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await settings.getByRole('combobox', { name: 'Graph mode' }).click();
    await settings.getByRole('option', { name: new RegExp(mode.name) }).click();
    for (const [key, value] of Object.entries(mode.ranges)) {
      const labels = {
        xMin: 'Minimum x', xMax: 'Maximum x', yMin: 'Minimum y', yMax: 'Maximum y',
        thetaMin: 'Minimum theta', thetaMax: 'Maximum theta', rMin: 'Minimum r', rMax: 'Maximum r',
        tMin: 'Minimum t', tMax: 'Maximum t',
      };
      await settings.getByLabel(labels[key]).fill(value);
    }
    await settings.getByRole('button', { name: 'Apply settings' }).click();

    await calculator.getByRole('button', { name: 'Edit functions' }).click();
    const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
    if (mode.mode === 'parametric') {
      await editor.getByLabel('x(t)').fill(mode.xExpression);
      await editor.getByLabel('y(t)').fill(mode.yExpression);
    } else {
      await editor.getByLabel('Function expression').fill(mode.expression);
    }
    await editor.getByRole('button', { name: 'Apply', exact: true }).click();
    await calculator.getByRole('button', { name: 'Zoom in' }).click();

    const currentView = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
    const copySetup = calculator.getByRole('button', { name: 'Copy setup' });
    if (index === 1) {
      await copySetup.focus();
      await copySetup.press('Enter');
    } else {
      await copySetup.click();
    }
    await expect.poll(() => page.evaluate(() => window.__copiedGraphSetup || '')).not.toBe('');
    const snippet = JSON.parse(await page.evaluate(() => window.__copiedGraphSetup));
    expect(snippet.format).toBe('replit-calculator-graph-setup');
    expect(snippet.version).toBe(1);
    expect(snippet.graphMode).toBe(mode.mode);
    expect(snippet.configuredRanges).toEqual(mode.ranges);
    expect(snippet.currentViewRanges).toEqual(currentView);
    expect(snippet.functions).toHaveLength(1);
    if (mode.mode === 'parametric') {
      expect(snippet.functions[0].xExpression).toBe(mode.xExpression);
      expect(snippet.functions[0].yExpression).toBe(mode.yExpression);
    } else {
      expect(snippet.functions[0].expression).toBe(mode.expression);
    }

    const alternateMode = mode.mode === 'polar' ? 'cartesian' : 'polar';
    await settingsButton.click();
    const alternateSettings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await alternateSettings.getByRole('combobox', { name: 'Graph mode' }).click();
    await alternateSettings.getByRole('option', { name: new RegExp(alternateMode === 'polar' ? 'Polar' : 'Cartesian') }).click();
    await alternateSettings.getByRole('button', { name: 'Apply settings' }).click();

    const snapshotBeforeRestore = await calculator.evaluate(element => ({
      mode: element.querySelector('.calc-mode-label').textContent,
      functions: [...element.querySelectorAll('.calc-function-summary')].map(item => item.textContent),
      view: JSON.parse(element.querySelector('.calc-plot-area').dataset.view),
    }));
    await calculator.getByRole('button', { name: 'Restore setup' }).click();
    const restore = calculator.getByRole('dialog', { name: 'Restore graph setup' });
    const snippetField = restore.getByRole('textbox', { name: 'Graph setup snippet' });
    if (index === 0) {
      await snippetField.fill('not a setup');
      await restore.getByRole('button', { name: 'Review setup' }).click();
      await expect(restore.locator('.calc-setup-summary')).toContainText('not valid');
      await expect(restore.getByRole('button', { name: 'Apply setup' })).toBeHidden();
      expect(await calculator.evaluate(element => element.querySelector('.calc-mode-label').textContent)).toBe(snapshotBeforeRestore.mode);
    }
    await snippetField.fill(JSON.stringify(snippet));
    await restore.getByRole('button', { name: 'Review setup' }).click();
    await expect(restore.locator('.calc-setup-summary')).toContainText(`Ready to restore ${mode.mode} setup`);
    await expect(restore.locator('.calc-setup-summary')).toContainText('Applying replaces the active graph');
    const setupPreview = restore.locator('.calc-setup-preview');
    await expect(setupPreview).toBeVisible();
    await expect(setupPreview).toContainText(mode.mode);
    await expect(setupPreview).toContainText(mode.summary.replace('r(θ) = ', '').replace('y = ', '').replace('x(t)=', '').replace(' · y(t)=', '; y(t) = '));
    for (const [key, value] of Object.entries(mode.ranges)) {
      await expect(setupPreview).toContainText(`${key}: ${value}`);
    }
    await expect(restore.getByRole('button', { name: 'Apply setup' })).toBeVisible();
    expect(await calculator.evaluate(element => ({
      mode: element.querySelector('.calc-mode-label').textContent,
      functions: [...element.querySelectorAll('.calc-function-summary')].map(item => item.textContent),
      view: JSON.parse(element.querySelector('.calc-plot-area').dataset.view),
    }))).toEqual(snapshotBeforeRestore);

    await restore.getByRole('button', { name: 'Apply setup' }).click();
    await expect(calculator.locator('.calc-mode-label')).toHaveText(mode.mode.toUpperCase());
    await expect(calculator.locator('.calc-function-summary')).toHaveText(mode.summary);
    await expect(calculator.locator('.calc-plot-area')).toHaveAttribute('data-view', JSON.stringify(currentView));
    await expect(calculator.locator('.calc-graph-status')).toContainText(`Restored ${mode.mode} graph setup`);

    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const restoredSettings = calculator.getByRole('dialog', { name: 'Graph settings' });
    for (const [key, value] of Object.entries(mode.ranges)) {
      const labels = {
        xMin: 'Minimum x', xMax: 'Maximum x', yMin: 'Minimum y', yMax: 'Maximum y',
        thetaMin: 'Minimum theta', thetaMax: 'Maximum theta', rMin: 'Minimum r', rMax: 'Maximum r',
        tMin: 'Minimum t', tMax: 'Maximum t',
      };
      await expect(restoredSettings.getByLabel(labels[key])).toHaveValue(value);
    }
    await restoredSettings.getByRole('button', { name: 'Close graph settings' }).click();
  }
});

test('calculator exposes the complete setup for manual copying when clipboard access fails', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Clipboard denied'); } },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });

  await calculator.getByRole('button', { name: 'Copy setup' }).click();
  await expect(calculator.locator('.calc-copy-setup-status'))
    .toHaveText('Could not copy the setup. The snippet is open for manual copying.');
  const restore = calculator.getByRole('dialog', { name: 'Restore graph setup' });
  const setupField = restore.getByRole('textbox', { name: 'Graph setup snippet' });
  await expect(setupField).toHaveValue(/"format": "replit-calculator-graph-setup"/);
  const selected = await setupField.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
  expect(selected).toBe(await setupField.inputValue());
});

test('calculator keeps graph ranges selectable when clipboard access is blocked', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  const values = calculator.locator('.calc-view-ranges-values');
  const copyButton = calculator.getByRole('button', { name: 'Copy ranges' });

  for (const clipboardMode of ['rejected', 'unavailable']) {
    await page.evaluate(mode => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: mode === 'rejected' ? { writeText: async () => { throw new Error('Clipboard denied'); } } : undefined,
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: () => false,
      });
    }, clipboardMode);

    await copyButton.click();
    await expect(calculator.locator('.calc-copy-view-ranges-status'))
      .toHaveText('Could not copy the ranges. Select the values and copy them manually.');
    const selectedAfterFailure = await values.evaluate(element => ({
      value: element.value,
      selected: element.value.slice(element.selectionStart, element.selectionEnd),
      focused: document.activeElement === element,
    }));
    expect(selectedAfterFailure.selected).toBe(selectedAfterFailure.value);
    expect(selectedAfterFailure.focused).toBe(true);

    await values.click({ clickCount: 3 });
    const pointerSelection = await values.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
    expect(pointerSelection.length).toBeGreaterThan(0);

    await values.focus();
    await values.press('Control+A');
    const keyboardSelection = await values.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
    expect(keyboardSelection).toBe(selectedAfterFailure.value);
  }
});

test('graph mode uses the window height without calculator panels or vertical overflow', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(calculator.locator('.calc-display')).toBeHidden();
  await expect(calculator.locator('.calc-history')).toBeHidden();
  await expect(calculator.locator('.calc-plot-area')).toBeVisible();
  const dimensions = await calculator.locator('.calc').evaluate(element => ({
    client: element.clientHeight, scroll: element.scrollHeight,
    plotHeight: element.querySelector('.calc-plot-area').getBoundingClientRect().height,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 2);
  expect(dimensions.plotHeight).toBeGreaterThan(80);
});

test('scientific calculator controls fit in a short app window', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.evaluate(element => {
    element.style.height = '460px';
    element.style.flex = '0 0 460px';
  });
  await calculator.getByRole('button', { name: 'Scientific', exact: true }).click();
  const dimensions = await calculator.locator('.calc-main').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const bottom = Math.max(
      element.querySelector('.calc-keys').getBoundingClientRect().bottom,
      element.querySelector('.calc-scientific').getBoundingClientRect().bottom,
    );
    return { client: element.clientHeight, scroll: element.scrollHeight, bottom, mainBottom: bounds.bottom };
  });
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 2);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.mainBottom + 2);
});

test('basic and scientific calculator modes remain usable after graphing', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '3', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('10');
  await calculator.getByRole('button', { name: 'Scientific', exact: true }).click();
  await calculator.getByRole('button', { name: 'Graph', exact: true }).click();
  await calculator.getByRole('button', { name: 'Basic', exact: true }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: '6', exact: true }).click();
  await calculator.getByRole('button', { name: '×', exact: true }).click();
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('42');
  await calculator.getByRole('button', { name: 'Scientific', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('3');
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
