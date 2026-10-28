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

async function chooseCalculatorMode(calculator, mode) {
  const select = calculator.locator('.calc-mode-select-field');
  if (await select.inputValue() === mode.toLowerCase()) return;
  const trigger = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await trigger.click();
  const popupId = await trigger.getAttribute('aria-controls');
  await calculator.locator('xpath=ancestor::body').locator(`#${popupId}`)
    .getByRole('option', { name: mode, exact: true }).click();
}

async function clickGraphMenuAction(calculator, menu, action) {
  await calculator.getByRole('button', { name: menu, exact: true }).click();
  await calculator.getByRole('button', { name: action, exact: true }).click();
}

async function openGraphInfo(calculator) {
  const panel = calculator.getByRole('dialog', { name: 'Current graph view' });
  if (!(await panel.isVisible())) await calculator.getByRole('button', { name: 'Graph information' }).click();
  await expect(panel).toBeVisible();
  return panel;
}

async function closeGraphInfo(page, calculator) {
  const panel = calculator.getByRole('dialog', { name: 'Current graph view' });
  if (await panel.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  }
}

async function setGraphPlotMode(page, calculator, mode) {
  if (await calculator.locator('.calc-mode-label').textContent() === mode.toUpperCase()) return;
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: new RegExp(mode, 'i') }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText(mode.toUpperCase());
}

test('calculator, calendar, and weather controls follow shared theme tokens', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc-mode-select')).toHaveCount(1);
  const calculatorMode = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await expect(calculatorMode).toHaveAttribute('aria-haspopup', 'listbox');
  const calculatorModeRadius = await calculatorMode.evaluate(element => getComputedStyle(element).borderRadius);
  await expect(calculator.locator('.calc-mode-select-field')).toHaveClass(/standard-select-native/);
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
  await expect(weather.locator('app-select').first()).toBeAttached();
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
    return { radius: style.borderRadius, border: style.borderTopWidth, transform: style.transform, textTransform: style.textTransform };
  });
  expect(selectStyle.radius).toBe('10.4px');
  expect(selectStyle.border).toBe('1px');
  expect(selectStyle.transform).toBe('none');
  expect(calculatorModeRadius).toBe(selectStyle.radius);
  expect(selectStyle.textTransform).toBe('capitalize');

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

  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('3');

  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-header .calc-memory')).toBeHidden();
  await expect(calculator.locator('.calc-header-graph-actions')).toBeVisible();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('y = f(x)');
  await expect(calculator.locator('.calc-open-settings')).toHaveText('Settings');
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Edit functions' })).toHaveCount(0);
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Graph settings' })).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await calculator.getByLabel('Function expression').fill('sin(x)');
  await calculator.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveAttribute('d', /M/);
  await expect(calculator.locator('.calc-graph-status')).toContainText('Plotted');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await calculator.getByLabel('Function expression').fill('window.alert(1)');
  await calculator.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-editor-error')).toContainText('Unknown function or name');
  await calculator.getByRole('button', { name: 'Cancel', exact: true }).click();
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
      const calc = wrapper.querySelector('.calc');
      const header = calc.querySelector('.calc-header');
      const history = calc.querySelector('.calc-history');
      const workspace = calc.querySelector('.calc-workspace');
      const main = calc.querySelector('.calc-main');
    return {
      keypadWidth: keypad.width,
      columnsWidth: columns.width,
      supportDisplay: getComputedStyle(element.querySelector('.calc-keypad-support')).display,
      padding: getComputedStyle(wrapper).padding,
        mainPaddingTop: Number.parseFloat(getComputedStyle(main).paddingTop),
        headerLeftInset: header.getBoundingClientRect().left - calc.getBoundingClientRect().left,
        headerRightInset: calc.getBoundingClientRect().right - header.getBoundingClientRect().right,
        toolbarBorder: getComputedStyle(header).borderBottomWidth,
        historyTopGap: history.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        historyRightGap: calc.getBoundingClientRect().right - history.getBoundingClientRect().right,
        historyBottomGap: calc.getBoundingClientRect().bottom - history.getBoundingClientRect().bottom,
        workspaceTopGap: workspace.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
    };
  });
  expect(Math.abs(basicLayout.keypadWidth - basicLayout.columnsWidth)).toBeLessThanOrEqual(2);
  expect(basicLayout.supportDisplay).toBe('none');
  expect(basicLayout.padding).toBe('0px');
  expect(basicLayout.mainPaddingTop).toBeGreaterThan(0);
  expect(basicLayout.headerLeftInset).toBeLessThanOrEqual(1);
  expect(basicLayout.headerRightInset).toBeLessThanOrEqual(1);
  expect(basicLayout.toolbarBorder).toBe('1px');
  expect(basicLayout.historyTopGap).toBeLessThanOrEqual(1);
  expect(basicLayout.historyRightGap).toBeLessThanOrEqual(1);
  expect(basicLayout.historyBottomGap).toBeLessThanOrEqual(1);
  expect(basicLayout.workspaceTopGap).toBeLessThanOrEqual(1);
  const backspaceGeometry = async () => calculator.locator('.calc-expression-input-wrap').evaluate(wrapper => {
    const buttonElement = wrapper.querySelector('.calc-backspace');
    const button = buttonElement.getBoundingClientRect();
    const input = wrapper.querySelector('.calc-expression');
    const inputBounds = input.getBoundingClientRect();
    return {
      buttonInsideInputRow: wrapper.contains(buttonElement) &&
        button.left >= inputBounds.left && button.right <= inputBounds.right,
      rightGap: inputBounds.right - button.right,
      verticalCenterOffset: Math.abs((button.top + button.bottom) / 2 - (inputBounds.top + inputBounds.bottom) / 2),
      rightPadding: parseFloat(getComputedStyle(input).paddingRight),
    };
  });
  const basicBackspace = await backspaceGeometry();
  expect(basicBackspace.buttonInsideInputRow).toBe(true);
  expect(basicBackspace.rightGap).toBeGreaterThanOrEqual(2);
  expect(basicBackspace.rightGap).toBeLessThanOrEqual(8);
  expect(basicBackspace.verticalCenterOffset).toBeLessThanOrEqual(2);
  expect(basicBackspace.rightPadding).toBeGreaterThanOrEqual(32);

  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeHidden();
  await expect(calculator.getByRole('button', { name: '÷', exact: true })).toHaveAttribute('title', 'Divide · type /');
  await chooseCalculatorMode(calculator, 'Scientific');
  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeVisible();
  const scientificBackspace = await backspaceGeometry();
  expect(scientificBackspace.buttonInsideInputRow).toBe(true);
  expect(scientificBackspace.rightPadding).toBeGreaterThanOrEqual(32);
  await expect(calculator.getByRole('button', { name: 'Square root' })).toHaveAttribute('title', 'Square root · type sqrt(');
  await expect(calculator.getByRole('button', { name: 'Pi' })).toHaveAttribute('title', 'Pi constant · type pi');
  await expect(calculator.getByRole('button', { name: 'Euler’s number' })).toHaveAttribute('title', 'Euler’s number · type e');
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
  await chooseCalculatorMode(calculator, 'Basic');
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
  await calculator.getByRole('button', { name: 'Clear memory' }).click();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeDisabled();
  await expect(calculator.getByRole('button', { name: 'Clear memory' })).toBeDisabled();
  await expect(output).toHaveText('21');
  await expression.fill('9');
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('9');

  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Pi' }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: 'Euler’s number' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('5.85987448205');
  await expression.fill('√(π)');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('1.77245385091');
  await expression.fill('sqrt(pi)');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('1.77245385091');
  await expression.fill('2×3');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('6');

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
  const scientificFill = await keypadColumns.evaluate(element => {
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    const scientific = element.querySelector('.calc-scientific').getBoundingClientRect();
    return support.bottom - scientific.bottom;
  });
  expect(scientificFill).toBeLessThanOrEqual(16);
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  expect(await calculator.locator('.calc-hex-keys').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const hexOrdering = await keypadColumns.evaluate(element => {
    const hex = element.querySelector('.calc-hex-keys').getBoundingClientRect();
    const scientific = element.querySelector('.calc-scientific').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { hexBottom: hex.bottom, scienceTop: scientific.top, supportBottom: support.bottom, scienceBottom: scientific.bottom };
  });
  expect(hexOrdering.hexBottom).toBeLessThanOrEqual(hexOrdering.scienceTop + 1);
  expect(hexOrdering.supportBottom - hexOrdering.scienceBottom).toBeLessThanOrEqual(16);
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
  const mediumHistory = await calculator.locator('.calc-workspace').evaluate(workspace => {
    const main = workspace.querySelector('.calc-main').getBoundingClientRect();
    const history = workspace.querySelector('.calc-history').getBoundingClientRect();
    return {
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
      gap: history.top - main.bottom,
      bottomGap: workspace.getBoundingClientRect().bottom - history.bottom,
      height: history.height,
    };
  });
  expect(mediumHistory.columns).toBe(1);
  expect(mediumHistory.gap).toBeGreaterThanOrEqual(0);
  expect(mediumHistory.bottomGap).toBeLessThanOrEqual(1);
  expect(mediumHistory.height).toBeGreaterThanOrEqual(128);
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
  const compactHistory = await calculator.locator('.calc-workspace').evaluate(workspace => {
    const main = workspace.querySelector('.calc-main').getBoundingClientRect();
    const history = workspace.querySelector('.calc-history').getBoundingClientRect();
    return {
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
      gap: history.top - main.bottom,
      bottomGap: workspace.getBoundingClientRect().bottom - history.bottom,
      height: history.height,
    };
  });
  expect(compactHistory.columns).toBe(1);
  expect(compactHistory.gap).toBeGreaterThanOrEqual(0);
  expect(compactHistory.bottomGap).toBeLessThanOrEqual(1);
  expect(compactHistory.height).toBeGreaterThanOrEqual(128);
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
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('.calc-dialog-close')).toHaveCount(0);
  await expect(editor.locator('app-dialog-actions')).toBeVisible();
  await expect(editor.getByRole('radio')).toHaveCount(6);
  await expect(editor.locator('.calc-editor-expression-label')).toContainText('y =');
  const equationLayout = await editor.locator('.calc-editor-expression-label').evaluate(label => {
    const input = label.querySelector('input').getBoundingClientRect();
    const bounds = label.getBoundingClientRect();
    const style = getComputedStyle(label);
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(' ').length,
      inputTopOffset: input.top - bounds.top,
    };
  });
  expect(equationLayout.display).toBe('grid');
  expect(equationLayout.columns).toBe(2);
  expect(Math.abs(equationLayout.inputTopOffset)).toBeLessThanOrEqual(2);
  await expect(editor.getByRole('button', { name: 'sin(', exact: true })).toBeVisible();
  for (const [name, symbol, tooltip] of [
    ['sin(', 'sin(', 'Sine function · type sin('],
    ['Theta', 'θ', 'Theta variable · type theta'],
    ['Pi', 'π', 'Pi constant · type pi'],
    ['Square root', '√(', 'Square root · type sqrt('],
    ['e', 'e', 'Euler’s number · type e'],
    ['^', '^', 'Power · type ^'],
    ['×', '×', 'Multiply · type *'],
  ]) {
    const key = editor.getByRole('button', { name, exact: true });
    await expect(key).toHaveText(symbol);
    await expect(key).toHaveAttribute('title', tooltip);
  }
  const functionExpression = editor.getByRole('textbox', { name: 'Function expression' });
  await functionExpression.fill('sin(x)');
  await expect(editor.locator('.calc-editor-select')).toHaveText('sin(x)');
  await expect(editor.locator('.calc-editor-select')).not.toContainText('Function');
  await expect(editor.locator('.calc-editor-nav > .calc-new-function')).toHaveText('New');
  await expect(editor.locator('.calc-dialog-actions .calc-new-function')).toHaveCount(0);
  await editor.getByRole('button', { name: 'New function' }).click();
  await expect(functionExpression).toHaveValue('');
  await expect(editor.locator('.calc-editor-select:not([data-empty="true"])')).toHaveCount(1);
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editor.getByRole('button', { name: 'cos(', exact: true }).click();
  await editor.getByRole('button', { name: '2', exact: true }).click();
  await editor.getByRole('button', { name: '×', exact: true }).click();
  await editor.getByRole('button', { name: 'x', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(functionExpression).toHaveValue('cos(2*x)');
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(0);
  const selectedFunctionBackground = await editor.locator('.calc-editor-select[aria-current="true"]')
    .evaluate(button => ({
      background: getComputedStyle(button).backgroundColor,
      common: getComputedStyle(button).getPropertyValue('--btn-active').trim(),
    }));
  expect(selectedFunctionBackground.background).toBe(selectedFunctionBackground.common);
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await expect(editor.getByRole('radio', { name: 'Orange line color' })).toBeChecked();
  await editor.getByRole('button', { name: '+', exact: true }).click();
  await editor.getByRole('button', { name: '1', exact: true }).click();
  await expect(functionExpression).toHaveValue('cos(2*x)+1');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(2);
  const colors = await calculator.locator('.calc-graph-line').evaluateAll(lines => lines.map(line => line.style.getPropertyValue('--function-color')));
  expect(new Set(colors).size).toBe(2);
  await openGraphInfo(calculator);
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator function editor underlines empty entries and drops them when applied', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  const expression = editor.getByRole('textbox', { name: 'Function expression' });

  const emptyEntry = editor.locator('.calc-editor-select[data-empty="true"]');
  await expect(emptyEntry).toHaveCount(1);
  const underlineStyle = await emptyEntry.evaluate(button => {
    const style = getComputedStyle(button);
    return { border: style.borderBottomStyle, background: style.backgroundColor };
  });
  expect(underlineStyle).toEqual({ border: 'solid', background: 'rgba(0, 0, 0, 0)' });

  await expression.fill('x');
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(0);
  await expect(editor.locator('.calc-editor-select[aria-current="true"]')).toHaveText('x');
  await editor.getByRole('button', { name: 'New function' }).click();
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editExisting = calculator.getByRole('dialog', { name: 'Edit functions' });
  const existingExpression = editExisting.getByRole('textbox', { name: 'Function expression' });
  await existingExpression.focus();
  await existingExpression.evaluate(field => field.setSelectionRange(field.value.length, field.value.length));
  await editExisting.getByRole('button', { name: 'Backspace expression' }).click();
  await expect(existingExpression).toHaveValue('');
  await expect(editExisting.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editExisting.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  const info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
});

test('calculator allows an empty graph and adding functions afterward', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const info = await openGraphInfo(calculator);
  await expect(calculator.locator('.calc-graph-heading .calc-function-list')).toHaveCount(0);
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(0);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await openGraphInfo(calculator);
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-empty')).toBeHidden();
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await expect(editor.locator('.calc-editor-empty')).toBeHidden();
  await editor.getByLabel('Function expression').fill('sin(x)');
  await expect(editor.locator('.calc-editor-select')).toHaveText('sin(x)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(1);
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator keeps functions separate by plot mode and lists them in graph information', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-graph-heading .calc-function-list')).toHaveCount(0);

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('x^2');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  let info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');

  await setGraphPlotMode(page, calculator, 'polar');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');

  await setGraphPlotMode(page, calculator, 'parametric');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-expression-label')).toBeHidden();
  await expect(editor.locator('.calc-editor-function-fields .calc-editor-function-label')).toHaveText(['x =', 'y =']);
  await editor.getByLabel('x(t)').fill('t');
  await editor.getByLabel('y(t)').fill('t^2');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('x(t)=t · y(t)=t^2');

  await setGraphPlotMode(page, calculator, 'cartesian');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');
  await page.locator('#close-btn').click();

  const reopened = await openUtility(page, 'calculator');
  await chooseCalculatorMode(reopened, 'Graph');
  await expect(reopened.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');
  await closeGraphInfo(page, reopened);
  await setGraphPlotMode(page, reopened, 'polar');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');
  await closeGraphInfo(page, reopened);
  await setGraphPlotMode(page, reopened, 'parametric');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('x(t)=t · y(t)=t^2');
});

test('calculator migrates saved functions into their existing plot mode', async ({ page }) => {
  const legacy = {
    version: 1,
    graphMode: 'polar',
    ranges: {
      xMin: '-10', xMax: '10', yMin: '-10', yMax: '10',
      thetaMin: '-6.28', thetaMax: '6.28', rMin: '-10', rMax: '10',
      tMin: '-6.28', tMax: '6.28',
    },
    functions: [{
      id: 'fn-1', expression: 'sin(theta)', xExpression: 'cos(t)', yExpression: 'sin(t)',
      color: '#e47b27', visible: true,
    }],
    viewRanges: {},
  };
  await page.evaluate(value => localStorage.setItem('personal-desktop-calculator-graph-v1', JSON.stringify(value)), legacy);
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  let info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');
  await setGraphPlotMode(page, calculator, 'cartesian');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1')));
  expect(saved.version).toBe(2);
  expect(saved.functionsByMode.cartesian).toHaveLength(0);
  expect(saved.functionsByMode.polar).toHaveLength(1);
});

test('calculator graph settings keep modes and plot ranges independent', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-open-editor')).toHaveText('y = f(x)');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.locator('.calc-dialog-close')).toHaveCount(0);
  await expect(settings.locator('app-dialog-actions button')).toHaveText(['Cancel', 'Apply settings']);
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await expect(settings.getByLabel('Minimum theta')).toBeVisible();
  await settings.getByLabel('Maximum theta').fill('6.28');
  await settings.getByLabel('Minimum r').fill('0');
  await settings.getByLabel('Maximum r').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('r = f(θ)');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-expression-label')).toContainText('r =');
  const functionExpression = editor.getByLabel('Function expression');
  await editor.getByRole('button', { name: 'Clear expression' }).click();
  await editor.getByRole('button', { name: 'sin(', exact: true }).click();
  await editor.getByRole('button', { name: 'Theta', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(functionExpression).toHaveValue('sin(θ)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('polar');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await graphMode.click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await expect(settings.getByLabel('Minimum t')).toBeVisible();
  await settings.getByLabel('Maximum t').fill('6.28');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('x(t), y(t)');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const xExpression = editor.locator('.calc-editor-x');
  const yExpression = editor.locator('.calc-editor-y');
  await expect(xExpression).toBeVisible();
  await expect(yExpression).toBeVisible();
  await expect(editor.locator('.calc-editor-function-fields label').nth(0)).toHaveText('x =');
  await expect(editor.locator('.calc-editor-function-fields label').nth(1)).toHaveText('y =');
  const backspaceWidth = await editor.locator('.calc-editor-backspace').first().evaluate(button => ({
    width: getComputedStyle(button).width,
    right: getComputedStyle(button).right,
    padding: getComputedStyle(button.previousElementSibling).paddingRight,
  }));
  expect(backspaceWidth).toEqual({ width: '32px', right: '0px', padding: '32px' });
  await expect(editor.getByRole('button', { name: 'Move to y expression' })).toBeVisible();
  await xExpression.fill('cos(t)');
  await yExpression.fill('');
  await xExpression.focus();
  await editor.getByRole('button', { name: 'Move to y expression' }).click();
  await expect(yExpression).toBeFocused();
  await editor.getByRole('button', { name: 'sin(', exact: true }).click();
  await editor.getByRole('button', { name: 't', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(yExpression).toHaveValue('sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('parametric');
});

test('calculator fits visible curves in every graph mode without changing configured ranges', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('100*x');
  await editor.getByLabel('Show 100*x').uncheck();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  let fitted = await view();
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMin).toBeLessThan(-13);
  expect(fitted.yMax).toBeGreaterThan(19);
  await expect(calculator.locator('.calc-graph-status')).toContainText('1 visible curve');
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
  await openGraphInfo(calculator);
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
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  fitted = await view();
  expect(fitted.thetaMin).toBe(1);
  expect(fitted.thetaMax).toBe(5);
  expect(fitted.rMin).toBeLessThanOrEqual(1);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByRole('combobox', { name: 'Graph mode' })).toHaveAttribute('data-value', 'polar');
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('5');
  await expect(settings.getByLabel('Minimum r')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum r')).toHaveValue('10');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('-2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  fitted = await view();
  expect(fitted.rMin).toBe(0);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
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
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
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
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('PARAMETRIC');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByRole('combobox', { name: 'Graph mode' })).toHaveAttribute('data-value', 'parametric');
  await expect(settings.getByLabel('Minimum t')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum t')).toHaveValue('6.283');
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ tMin: 0, tMax: 6.283, xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
});

test('calculator Fit curves includes a narrow peak between rendered samples', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');

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
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');

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
  await chooseCalculatorMode(calculator, 'Graph');
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
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('cos(2*theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await openGraphInfo(calculator);
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -1 to 7/);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await openGraphInfo(calculator);
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
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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
  await chooseCalculatorMode(firstCalculator, 'Graph');
  await chooseCalculatorMode(secondCalculator, 'Graph');

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
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('cos(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();

  await openGraphInfo(secondCalculator);
  await expect(secondCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(secondCalculator.locator('.calc-function-summary').first()).toContainText('sin(theta)');
  await expect.poll(() => secondCalculator.locator('.calc-function-swatch').first()
    .evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await openGraphInfo(firstCalculator);
  await firstCalculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(secondCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);

  await secondCalculator.locator('.calc-graph-toolbar').click();
  await page.locator('#close-btn').click();
  const reopenedCalculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(reopenedCalculator, 'Graph');
  await expect(reopenedCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await openGraphInfo(reopenedCalculator);
  await expect(reopenedCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(reopenedCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect(reopenedCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);
});

test('calculator safely resets malformed or outdated saved graph settings', async ({ page }) => {
  for (const saved of ['{broken', JSON.stringify({ version: 0, graphMode: 'cartesian' })]) {
    await page.evaluate(value => localStorage.setItem('personal-desktop-calculator-graph-v1', value), saved);
    const calculator = await openUtility(page, 'calculator');
    await chooseCalculatorMode(calculator, 'Graph');
    const recovery = calculator.locator('.calc-storage-recovery');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Defaults are active.');
    await recovery.getByRole('button', { name: 'Reset saved graph' }).click();
    await expect(recovery).toBeHidden();
    await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
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
  await chooseCalculatorMode(calculator, 'Graph');
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
  )).toBe(2);
});

test('calculator graph zoom and pan work in every mode without changing configured ranges', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
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
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
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
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
    await expect.poll(view).toEqual(configured);
    const beforeWheelZoom = await view();
    const modeBox = await plot.boundingBox();
    await page.mouse.move(modeBox.x + modeBox.width / 2, modeBox.y + modeBox.height / 2);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => JSON.stringify(await view())).not.toBe(JSON.stringify(beforeWheelZoom));
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
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
    await rangeDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('calculator graph settings control axis labels, axis lines, grid styles, and spacing', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  let plot = calculator.locator('.calc-plot-area');
  const defaultLabelCount = await plot.locator('.calc-graph-label').count();
  const chooseSetting = async (settingsDialog, label, option) => {
    const trigger = settingsDialog.getByRole('combobox', { name: label });
    await trigger.click();
    const popupId = await trigger.getAttribute('aria-controls');
    await page.locator(`#${popupId}`).getByRole('option', { name: option, exact: true }).click();
  };

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await chooseSetting(settings, 'Grid spacing', 'Fine');
  await chooseSetting(settings, 'Grid style', 'Dotted lines');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'dotted');
  await expect(plot.locator('.calc-graph-grid')).not.toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis-x')).toHaveCount(1);
  await expect(plot.locator('.calc-graph-axis-y')).toHaveCount(1);
  const axisNamePositions = await plot.evaluate(element => ({
    xLabelY: Number(element.querySelector('.calc-graph-axis-name-x').getAttribute('y')),
    xAxisY: Number(element.querySelector('.calc-graph-axis-x').getAttribute('d').match(/M[\d.]+ ([\d.]+)/)[1]),
    yLabelX: Number(element.querySelector('.calc-graph-axis-name-y').getAttribute('x')),
    yAxisX: Number(element.querySelector('.calc-graph-axis-y').getAttribute('d').match(/M([\d.]+)/)[1]),
  }));
  expect(axisNamePositions.xLabelY).toBeLessThan(axisNamePositions.xAxisY);
  expect(axisNamePositions.yLabelX).toBeGreaterThan(axisNamePositions.yAxisX);
  expect(await plot.locator('.calc-graph-label').count()).toBeGreaterThan(defaultLabelCount);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await chooseSetting(settings, 'Grid style', 'No grid');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-grid')).toHaveCount(0);
  expect(await plot.locator('.calc-graph-label').count()).toBeGreaterThan(0);
  await expect(plot.locator('.calc-graph-axis-x')).toHaveCount(1);
  await expect(plot.locator('.calc-graph-axis-y')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Show axis labels').uncheck();
  await settings.getByLabel('Show X-axis line').uncheck();
  await settings.getByLabel('Show Y-axis line').uncheck();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-grid')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-label')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1')).display
  )).toEqual({
    axisLabels: false,
    xAxisLine: false,
    yAxisLine: false,
    gridStyle: 'none',
    gridSpacing: 'fine',
  });

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  plot = calculator.locator('.calc-plot-area');
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-label')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis')).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Show axis labels')).not.toBeChecked();
  await expect(settings.getByRole('combobox', { name: 'Grid style' })).toHaveAttribute('data-value', 'none');
  await expect(settings.getByRole('combobox', { name: 'Grid spacing' })).toHaveAttribute('data-value', 'fine');
});

test('calculator View controls apply transient graph ratios and keep Polar square', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const viewTrigger = calculator.getByRole('button', { name: 'View', exact: true });
  const initialView = await plot.evaluate(element => JSON.parse(element.dataset.view));

  await viewTrigger.click();
  const viewPanel = calculator.getByRole('dialog', { name: 'Graph view options' });
  const itemAfterDivider = await viewPanel.locator('.calc-menu-divider').evaluate(element => element.nextElementSibling.textContent);
  expect(itemAfterDivider).toBe('Reset view');
  await expect(viewPanel.getByRole('button').last()).toHaveText('Reset view');
  await viewPanel.getByRole('button', { name: '1:1', exact: true }).click();
  await expect(plot).toHaveAttribute('data-view-ratio', '1:1');
  await expect(plot).toHaveAttribute('data-view', JSON.stringify(initialView));
  await viewPanel.getByRole('button', { name: '2:1', exact: true }).click();
  await expect(plot).toHaveAttribute('data-view-ratio', '2:1');
  await viewPanel.getByRole('button', { name: '2×', exact: true }).click();
  await expect(plot).toHaveAttribute('data-scale-factor', '2');
  await expect(plot).toHaveAttribute('data-view', JSON.stringify(initialView));
  await page.keyboard.press('Escape');
  await expect(viewTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(viewTrigger).toBeFocused();

  const savedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || '{}'));
  expect(savedSettings).not.toHaveProperty('viewRatio');
  expect(savedSettings).not.toHaveProperty('viewScaleFactor');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const polarEditor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await polarEditor.getByLabel('Function expression').fill('sin(theta)');
  await polarEditor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(plot).toHaveAttribute('preserveAspectRatio', 'none');
  await expect(plot).toHaveAttribute('data-view-ratio', '1:1');

  await viewTrigger.click();
  await expect(viewPanel.getByRole('button', { name: '1:1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewPanel.getByRole('button', { name: '2:1', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');

  const circle = plot.locator('ellipse.calc-graph-grid').last();
  for (const size of [{ width: 940, height: 540 }, { width: 620, height: 680 }]) {
    await calculator.evaluate((element, dimensions) => {
      element.style.width = `${dimensions.width}px`;
      element.style.height = `${dimensions.height}px`;
    }, size);
    await expect.poll(async () => {
      const box = await circle.boundingBox();
      return box ? Math.abs(box.width - box.height) : Number.POSITIVE_INFINITY;
    }).toBeLessThan(1);
  }
});

test('calculator shows and copies the current view ranges in every graph mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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

    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
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
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
  }
});

test('calculator copies and explicitly restores complete graph setups in every mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
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
    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
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
    await clickGraphMenuAction(calculator, 'Setup', 'Restore setup');
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
    await restoredSettings.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('calculator exposes the complete setup for manual copying when clipboard access fails', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Clipboard denied'); } },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });

  await clickGraphMenuAction(calculator, 'Setup', 'Copy setup');
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
  await chooseCalculatorMode(calculator, 'Graph');
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

    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
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
  await chooseCalculatorMode(calculator, 'Graph');
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
  await chooseCalculatorMode(calculator, 'Scientific');
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
  await chooseCalculatorMode(calculator, 'Scientific');
  await chooseCalculatorMode(calculator, 'Graph');
  await chooseCalculatorMode(calculator, 'Basic');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: '6', exact: true }).click();
  await calculator.getByRole('button', { name: '×', exact: true }).click();
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('42');
  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('3');
});

test('calculator mode persists and editor fields include caret-aware backspace buttons', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const backspace = calculator.locator('.calc-backspace');
  const backspaceMetrics = () => backspace.evaluate(button => {
    const input = button.parentElement.querySelector('.calc-expression');
    const style = getComputedStyle(button);
    return {
      width: style.width,
      boxSizing: style.boxSizing,
      inputPaddingRight: getComputedStyle(input).paddingRight,
      rightGap: Number((input.getBoundingClientRect().right - button.getBoundingClientRect().right).toFixed(2)),
      display: style.display,
      alignItems: style.alignItems,
      justifyItems: style.justifyItems,
    };
  });
  const expectedBackspaceMetrics = {
    width: '32px',
    boxSizing: 'border-box',
    inputPaddingRight: '32px',
    rightGap: 0,
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
  };
  await expect.poll(backspaceMetrics).toEqual(expectedBackspaceMetrics);

  await chooseCalculatorMode(calculator, 'Scientific');
  await expect(calculator.locator('.calc-mode-select .standard-select-trigger')).toHaveText('Scientific');
  await expect.poll(backspaceMetrics).toEqual(expectedBackspaceMetrics);

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  let restored = page.locator('.app-window[data-type="calculator"]').last();
  if (!await restored.count()) restored = await openUtility(page, 'calculator');
  await expect(restored.locator('.calc-mode-select .standard-select-trigger')).toHaveText('Scientific');

  await chooseCalculatorMode(restored, 'Graph');
  await restored.getByRole('button', { name: 'Graph settings' }).click();
  const settings = restored.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await restored.getByRole('button', { name: 'Edit functions' }).click();
  const editor = restored.getByRole('dialog', { name: 'Edit functions' });
  const editorBackspaceStyle = await editor.getByRole('button', { name: 'Backspace expression' }).evaluate(button => {
    const style = getComputedStyle(button);
    return {
      width: style.width,
      boxSizing: style.boxSizing,
      display: style.display,
      alignItems: style.alignItems,
      justifyItems: style.justifyItems,
    };
  });
  expect(editorBackspaceStyle).toEqual({
    width: '32px',
    boxSizing: 'border-box',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
  });
  const xField = editor.getByRole('textbox', { name: 'x(t)' });
  const yField = editor.getByRole('textbox', { name: 'y(t)' });
  await xField.fill('cos(t)');
  await xField.focus();
  await xField.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await editor.getByRole('button', { name: 'Backspace first coordinate' }).click();
  await expect(xField).toHaveValue('cos(t');
  await yField.fill('sin(t)');
  await yField.focus();
  await yField.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await editor.getByRole('button', { name: 'Backspace second coordinate' }).click();
  await expect(yField).toHaveValue('sin(t');
});

test('calculator graph View supports custom axis ratios, scaling, and logarithmic axes', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const view = calculator.getByRole('button', { name: 'View', exact: true });
  await view.click();
  const panel = calculator.getByRole('dialog', { name: 'Graph view options' });

  await panel.getByRole('button', { name: 'Custom…' }).first().click();
  await panel.getByLabel('Custom ratio X').fill('3');
  await panel.getByLabel('Custom ratio Y').fill('2');
  await panel.getByRole('button', { name: 'Apply', exact: true }).first().click();
  await expect(plot).toHaveAttribute('data-view-ratio', '3:2');
  const ratioGeometry = await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const range = JSON.parse(element.dataset.renderedView);
    const pixelPerUnitX = (rect.width * 568 / 640) / (range.xMax - range.xMin);
    const pixelPerUnitY = (rect.height * 348 / 400) / (range.yMax - range.yMin);
    return pixelPerUnitX / pixelPerUnitY;
  });
  expect(ratioGeometry).toBeCloseTo(1.5, 2);

  await panel.getByRole('button', { name: 'Custom…' }).last().click();
  await panel.getByLabel('Custom scaling factor').fill('3.5');
  await panel.getByRole('button', { name: 'Apply', exact: true }).last().click();
  await expect(plot).toHaveAttribute('data-scale-factor', '3.5');
  await panel.getByRole('button', { name: 'Log X', exact: true }).click();
  await panel.getByRole('button', { name: 'Log Y', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Log X', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Log Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const logView = await plot.evaluate(element => JSON.parse(element.dataset.renderedView));
  expect(logView.xMin).toBeGreaterThan(0);
  expect(logView.yMin).toBeGreaterThan(0);
  await expect(plot.getByText('0.1', { exact: true })).toBeVisible();
  await expect(plot.locator('.calc-graph-grid')).toBeVisible();
});

test('calculator shows formatted view ranges in a right-anchored information popover', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-view-ranges')).toHaveCount(0);

  const trigger = calculator.getByRole('button', { name: 'Graph information' });
  const info = calculator.getByRole('dialog', { name: 'Current graph view' });
  await expect(info).toBeHidden();
  const [toolbarBox, triggerBox] = await Promise.all([
    calculator.locator('.calc-graph-toolbar').boundingBox(),
    trigger.boundingBox(),
  ]);
  expect(triggerBox.x + triggerBox.width / 2).toBeGreaterThan(toolbarBox.x + toolbarBox.width / 2);

  await trigger.click();
  await expect(info).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Current graph view' })).toBeVisible();
  await expect(info.locator('.calc-info-mode')).toHaveText('Cartesian');
  await expect(info.locator('.calc-info-range')).toHaveCount(2);
  await expect(info.locator('[data-axis="xMin"] dd')).toHaveText('-10 – 10');
  await expect(info.locator('[data-axis="yMin"] dd')).toHaveText('-10 – 10');
  await expect(info.locator('.calc-info-ratio')).toHaveText('Auto');
  await expect(info.locator('.calc-info-scale')).toHaveText('1×');
  const [buttonBox, infoBox] = await Promise.all([trigger.boundingBox(), info.boundingBox()]);
  expect(Math.abs(buttonBox.x + buttonBox.width - infoBox.x - infoBox.width)).toBeLessThan(2);

  await page.keyboard.press('Escape');
  await expect(info).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
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
