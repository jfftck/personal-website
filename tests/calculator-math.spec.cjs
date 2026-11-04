const { test, expect } = require('@playwright/test');

test('calculator keeps its evaluator export and uses the extracted math helpers', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcome-win-close').click();

  const exportedResult = await page.evaluate(async () => {
    const calculator = await import('/apps/calculator.js');
    return calculator.evaluateExpression('sin(π / 2) + sqrt(9)');
  });
  expect(exportedResult).toBeCloseTo(4, 12);

  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="calculator"]').click();
  const calculator = page.locator('.app-window[data-type="calculator"]').last();
  const expression = calculator.getByRole('textbox', { name: 'Expression' });

  await expression.fill('7+3');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('10');

  const modeTrigger = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await modeTrigger.click();
  const popupId = await modeTrigger.getAttribute('aria-controls');
  await calculator.locator('xpath=ancestor::body').locator(`#${popupId}`)
    .getByRole('option', { name: 'Scientific', exact: true }).click();

  await calculator.getByRole('button', { name: 'Base 2' }).click();
  await expect(expression).toHaveValue('0b111+0b11');
  await expect(calculator.locator('.calc-value')).toHaveText('0b1010');
});
