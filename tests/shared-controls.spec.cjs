const { test, expect } = require('@playwright/test');

let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('shared button wrappers preserve names, focus, disabled behavior, and activation', async ({ page }) => {
  await page.evaluate(async () => {
    const { wrapAppButton } = await import(new URL('shared/app-controls.js', document.baseURI).href);
    const fixture = document.createElement('div');
    fixture.id = 'shared-button-fixture';
    Object.assign(fixture.style, {
      position: 'fixed',
      top: '120px',
      left: '16px',
      zIndex: '3000',
      display: 'flex',
      gap: '8px',
    });

    const start = document.createElement('button');
    start.type = 'button';
    start.textContent = 'Focus start';

    const standard = document.createElement('button');
    standard.type = 'button';
    standard.textContent = 'Save changes';
    standard.id = 'shared-standard-button';
    standard.addEventListener('click', () => { window.sharedButtonActivationCount += 1; });
    const standardWrapper = wrapAppButton(standard);

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.setAttribute('aria-label', 'Open settings');
    icon.title = 'Open settings';
    icon.id = 'shared-icon-button';
    const iconWrapper = wrapAppButton(icon, { size: 'icon', variant: 'quiet' });

    const disabled = document.createElement('button');
    disabled.type = 'button';
    disabled.textContent = 'Unavailable action';
    disabled.disabled = true;
    disabled.id = 'shared-disabled-button';
    disabled.addEventListener('click', () => { window.sharedButtonActivationCount += 1; });
    const disabledWrapper = wrapAppButton(disabled, { variant: 'quiet' });

    const unwrapped = document.createElement('button');
    unwrapped.type = 'button';
    unwrapped.className = 'util-action';
    unwrapped.textContent = 'Unwrapped action';
    unwrapped.id = 'unwrapped-action';

    window.sharedButtonActivationCount = 0;
    fixture.append(start, standardWrapper, iconWrapper, disabledWrapper, unwrapped);
    document.body.prepend(fixture);
  });

  const standard = page.getByRole('button', { name: 'Save changes', exact: true });
  const icon = page.getByRole('button', { name: 'Open settings', exact: true });
  const disabled = page.getByRole('button', { name: 'Unavailable action', exact: true });

  await expect(standard).toHaveAttribute('data-app-button-size', 'standard');
  await expect(standard).toHaveAttribute('data-app-button-variant', 'standard');
  await expect(standard.locator('xpath=parent::app-button')).toHaveCount(1);
  await expect(icon).toHaveAttribute('data-app-button-size', 'icon');
  await expect(icon).toHaveAttribute('data-app-button-variant', 'quiet');
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute('data-app-button-variant', 'quiet');
  const shadowStyles = await standard.evaluate(element => ({
    hasShadowRoot: Boolean(element.parentElement.shadowRoot),
    hasComponentStyles: Boolean(element.parentElement.shadowRoot.querySelector('style')),
    radius: getComputedStyle(element).borderRadius,
    minHeight: getComputedStyle(element).minHeight,
    unwrappedRadius: getComputedStyle(document.getElementById('unwrapped-action')).borderRadius,
  }));
  expect(shadowStyles.hasShadowRoot).toBe(true);
  expect(shadowStyles.hasComponentStyles).toBe(true);
  expect(shadowStyles.radius).toBe('10.4px');
  expect(shadowStyles.minHeight).toBe('38.4px');
  expect(shadowStyles.unwrappedRadius).not.toBe(shadowStyles.radius);

  const iconBounds = await icon.boundingBox();
  expect(iconBounds.width).toBeCloseTo(38.4, 0);
  expect(iconBounds.height).toBeCloseTo(38.4, 0);

  await page.getByRole('button', { name: 'Focus start' }).focus();
  await page.keyboard.press('Tab');
  await expect(standard).toBeFocused();
  const focusStyle = await standard.evaluate(element => ({
    visible: element.matches(':focus-visible'),
    color: getComputedStyle(element).outlineColor,
    expectedColor: (() => {
      const probe = document.createElement('span');
      probe.style.borderTop = '1px solid var(--focus-color)';
      document.body.append(probe);
      const color = getComputedStyle(probe).borderTopColor;
      probe.remove();
      return color;
    })(),
    outlineStyle: getComputedStyle(element).outlineStyle,
  }));
  expect(focusStyle.visible).toBe(true);
  expect(focusStyle.outlineStyle).toBe('solid');
  expect(focusStyle.color).toBe(focusStyle.expectedColor);

  await standard.click();
  await page.evaluate(() => document.getElementById('shared-disabled-button').click());
  await expect.poll(() => page.evaluate(() => window.sharedButtonActivationCount)).toBe(1);
});

test('custom select supports keyboard navigation, disabled options, Escape, and typeahead', async ({ page }) => {
  await page.evaluate(async () => {
    const { enhanceSelect } = await import(new URL('apps/custom-select.js', document.baseURI).href);
    const fixture = document.createElement('div');
    fixture.id = 'shared-select-fixture';
    const label = document.createElement('label');
    label.append(document.createTextNode('Theme'));
    const select = document.createElement('select');
    select.id = 'shared-theme-select';
    for (const [value, text, disabled = false] of [
      ['blue', 'Blue'],
      ['gray', 'Gray', true],
      ['gold', 'Gold'],
    ]) {
      const option = new Option(text, value);
      option.disabled = disabled;
      select.add(option);
    }
    label.append(select);
    fixture.append(label);
    document.body.prepend(fixture);
    enhanceSelect(select);
  });

  const trigger = page.getByRole('combobox', { name: 'Theme', exact: true });
  const sourceSelect = page.locator('#shared-theme-select');
  await expect(trigger).toHaveAttribute('data-value', 'blue');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  const popupId = await trigger.getAttribute('aria-controls');
  const popup = page.locator(`[id="${popupId}"]`);
  await expect(popup.getByRole('option', { name: 'Gold' })).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  await expect(sourceSelect).toHaveValue('gold');
  await expect(trigger).toHaveAttribute('aria-valuetext', 'Gold');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  await trigger.press('b');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(popup.getByRole('option', { name: 'Blue' })).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  await expect(sourceSelect).toHaveValue('blue');
});

test('animation picker supports keyboard selection, focus trapping, and focus restoration', async ({ page }) => {
  await page.evaluate(async () => {
    const { createAnimationPickerController } =
      await import(new URL('apps/animation-picker.js', document.baseURI).href);
    const host = document.createElement('div');
    host.id = 'shared-animation-fixture';
    document.body.prepend(host);
    window.sharedAnimationChanges = [];
    const controller = createAnimationPickerController(host, { label: 'Animation choices' });
    const picker = controller.createPicker({
      id: 'test-animation',
      label: 'Win animation',
      description: 'Choose an animation.',
      choices: [['fade', 'Fade'], ['zoom', 'Zoom']],
      selected: ['fade'],
      onChange: selection => window.sharedAnimationChanges.push(selection),
    });
    host.append(picker);
  });

  const trigger = page.locator('#shared-animation-fixture .animation-picker-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Win animation options' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'No animation' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const zoom = dialog.getByRole('checkbox', { name: 'Zoom' });
  await expect(zoom).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const fade = dialog.getByRole('checkbox', { name: 'Fade' });
  await expect(fade).toBeFocused();
  await page.keyboard.press('Space');
  await expect(trigger).toContainText('None');
  await expect(trigger).toHaveAttribute('aria-label', 'Win animation: None');
  await expect.poll(() => page.evaluate(() => window.sharedAnimationChanges.at(-1))).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('#shared-animation-fixture .animation-picker-layer')).toBeHidden();
});

test('narrow and wide game toolbars retain flag mode and keep shared controls in bounds', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();
  await page.locator('[data-game="minesweeper"]').click();
  const app = page.locator('.app-window[data-type="minesweeper"]').last();
  const flagMode = app.getByRole('switch', { name: 'Flag mode' });
  await flagMode.click();
  await expect(flagMode).toHaveAttribute('aria-checked', 'true');
  await expect(app.locator('.mine-cell')).toHaveCount(81);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(flagMode).toHaveAttribute('aria-checked', 'true');
    const geometry = await app.evaluate(element => {
      const toolbar = element.querySelector('.game-toolbar');
      const flag = toolbar.querySelector('.game-flag-toggle');
      const toolbarRect = toolbar.getBoundingClientRect();
      const flagRect = flag.getBoundingClientRect();
      return {
        toolbarLeft: toolbarRect.left,
        toolbarRight: toolbarRect.right,
        flagLeft: flagRect.left,
        flagRight: flagRect.right,
        clientWidth: toolbar.clientWidth,
        scrollWidth: toolbar.scrollWidth,
      };
    });
    expect(geometry.flagLeft).toBeGreaterThanOrEqual(geometry.toolbarLeft - 1);
    expect(geometry.flagRight).toBeLessThanOrEqual(geometry.toolbarRight + 1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    await expect(app.locator('.mine-cell')).toHaveCount(81);
  }
});
