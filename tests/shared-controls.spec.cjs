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

async function mountFormControlFixture(page) {
  await page.evaluate(async () => {
    const { upgradeAppControls } = await import(new URL('shared/app-controls.js', document.baseURI).href);
    const fixture = document.createElement('section');
    fixture.id = 'shared-form-control-fixture';
    fixture.style.cssText = 'position:fixed;top:100px;left:16px;z-index:5000;display:grid;gap:1rem;padding:1rem;background:var(--app-bg);';
    fixture.style.setProperty('--app-text', 'rgb(24, 32, 40)');
    fixture.style.setProperty('--app-bg', 'rgb(246, 248, 250)');
    fixture.style.setProperty('--app-border', 'rgb(120, 130, 140)');
    fixture.style.setProperty('--btn-hover', 'rgb(214, 220, 226)');
    fixture.style.setProperty('--btn-active', 'rgb(196, 204, 212)');
    fixture.style.setProperty('--accent', 'rgb(0, 112, 190)');
    fixture.style.setProperty('--focus-color', 'rgb(0, 112, 190)');

    const checkboxLabel = document.createElement('label');
    checkboxLabel.append(document.createTextNode('Remember choice '));
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'shared-checkbox';
    checkboxLabel.append(checkbox);

    const radioGroup = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Game theme';
    radioGroup.append(legend);
    const radios = [];
    for (const value of ['classic', 'ocean']) {
      const label = document.createElement('label');
      label.append(document.createTextNode(`${value} `));
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'shared-game-theme';
      radio.value = value;
      radio.setAttribute('aria-label', value);
      if (value === 'classic') radio.checked = true;
      label.append(radio);
      radioGroup.append(label);
      radios.push(radio);
    }

    const rangeLabel = document.createElement('label');
    rangeLabel.append(document.createTextNode('Volume '));
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.value = '4';
    range.setAttribute('aria-label', 'Volume');
    rangeLabel.append(range);

    fixture.append(checkboxLabel, radioGroup, rangeLabel);
    document.body.prepend(fixture);
    upgradeAppControls(fixture);
  });
}

test('shared checkbox, radio, and range components retain native keyboard behavior', async ({ page }) => {
  await mountFormControlFixture(page);
  const fixture = page.locator('#shared-form-control-fixture');
  const checkbox = page.getByRole('checkbox', { name: 'Remember choice' });
  const classic = page.getByRole('radio', { name: 'classic' });
  const ocean = page.getByRole('radio', { name: 'ocean' });
  const range = page.getByRole('slider', { name: 'Volume' });

  await expect(checkbox.locator('xpath=parent::app-checkbox')).toHaveCount(1);
  await expect(classic.locator('xpath=parent::app-radio')).toHaveCount(1);
  await expect.poll(() => range.evaluate(element => element.getRootNode().host.localName)).toBe('app-range');
  await expect(checkbox).toHaveClass(/app-control-native/);
  await expect(classic).toBeChecked();

  const styles = await checkbox.evaluate(element => ({
    appearance: getComputedStyle(element).appearance,
    background: getComputedStyle(element).backgroundColor,
    componentStyles: Boolean(element.parentElement.shadowRoot.querySelector('style')),
    rangeStyles: document.querySelector('#shared-form-control-fixture app-range')
      .shadowRoot.querySelector('style').textContent,
  }));
  expect(styles.appearance).toBe('none');
  expect(styles.background).toBe('rgb(214, 220, 226)');
  expect(styles.componentStyles).toBe(true);
  expect(styles.rangeStyles).toContain('background: var(--btn-hover)');
  expect(styles.rangeStyles).toContain('background: var(--accent)');
  expect(styles.rangeStyles).toContain('focus-visible');
  expect(styles.rangeStyles).toContain('--focus-color');

  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect.poll(() => fixture.locator('app-checkbox').evaluate(element => element.checked)).toBe(true);
  await classic.focus();
  await page.keyboard.press('ArrowRight');
  await expect(ocean).toBeChecked();
  await expect.poll(() => fixture.locator('app-radio').nth(1).evaluate(element => element.checked)).toBe(true);
  await range.focus();
  await page.keyboard.press('End');
  await expect(range).toHaveValue('10');
  await expect.poll(() => fixture.locator('app-range').evaluate(element => element.value)).toBe('10');
  await expect(range).toBeFocused();
  await expect(range.evaluate(element => element.matches(':focus-visible'))).resolves.toBe(true);
});

test.describe('shared form controls support touch input', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('checkboxes, radios, and ranges respond to touch', async ({ page }) => {
    await mountFormControlFixture(page);
    const checkbox = page.getByRole('checkbox', { name: 'Remember choice' });
    const ocean = page.getByRole('radio', { name: 'ocean' });
    const range = page.getByRole('slider', { name: 'Volume' });

    const tap = async locator => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    await tap(checkbox);
    await expect(checkbox).toBeChecked();
    await tap(ocean);
    await expect(ocean).toBeChecked();
    const start = Number(await range.inputValue());
    const box = await range.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height / 2);
    await expect.poll(async () => Number(await range.inputValue())).toBeGreaterThan(start);
  });
});

test('Settings renders checkboxes and sliders through shared components', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="settings"]').click();
  const settings = page.locator('.app-window[data-type="settings"]').last();

  await settings.locator('.settings-nav-item[data-page="time"]').click();
  const timeToggle = settings.getByRole('checkbox', { name: 'Use 24-hour time' });
  await expect(timeToggle).toHaveClass(/app-control-native/);
  await expect(timeToggle.locator('xpath=parent::app-checkbox')).toHaveCount(1);
  const initialTimeState = await timeToggle.isChecked();
  await timeToggle.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => timeToggle.isChecked()).toBe(!initialTimeState);

  await settings.locator('.settings-nav-item[data-page="appearance"]').click();
  const opacity = settings.getByRole('slider', { name: 'Window background opacity' });
  await expect.poll(() => opacity.evaluate(element => element.getRootNode().host.localName)).toBe('app-range');
  const opacityProxy = settings.locator('.settings-tint-slider[aria-label="Window background opacity"]');
  const opacityLabel = settings.locator(`label[for="${await opacityProxy.getAttribute('id')}"]`);
  await opacityLabel.click();
  await expect(opacity).toBeFocused();
  await expect(opacity).toHaveAttribute('aria-label', 'Window background opacity');
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
    window.sharedSelectChangeCount = 0;
    select.addEventListener('change', () => { window.sharedSelectChangeCount += 1; });
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
    const leakingStyle = document.createElement('style');
    leakingStyle.textContent = `
      .standard-select-trigger { color: rgb(255, 0, 0) !important; background: rgb(255, 0, 0) !important; }
      .standard-select-popup { background: rgb(255, 0, 0) !important; }
    `;
    document.head.append(leakingStyle);
    enhanceSelect(select);
  });

  const trigger = page.getByRole('combobox', { name: 'Theme', exact: true });
  const sourceSelect = page.locator('#shared-theme-select');
  const styleBoundary = await sourceSelect.evaluate(select => {
    const host = select.closest('app-select');
    const triggerElement = host.shadowRoot.querySelector('.standard-select-trigger');
    const popupElement = host.shadowRoot.querySelector('.standard-select-popup');
    return {
      hasComponentStyles: Boolean(host.shadowRoot.querySelector('style')),
      triggerIsScoped: triggerElement.getRootNode() === host.shadowRoot,
      popupIsScoped: popupElement.getRootNode() === host.shadowRoot,
      nativeRemainsInLightDom: select.getRootNode() === document,
      nativeSlot: select.slot,
      triggerColor: getComputedStyle(triggerElement).color,
      triggerBackground: getComputedStyle(triggerElement).backgroundColor,
      popupBackground: getComputedStyle(popupElement).backgroundColor,
    };
  });
  expect(styleBoundary.hasComponentStyles).toBe(true);
  expect(styleBoundary.triggerIsScoped).toBe(true);
  expect(styleBoundary.popupIsScoped).toBe(true);
  expect(styleBoundary.nativeRemainsInLightDom).toBe(true);
  expect(styleBoundary.nativeSlot).toBe('native');
  expect(styleBoundary.triggerColor).not.toBe('rgb(255, 0, 0)');
  expect(styleBoundary.triggerBackground).not.toBe('rgb(255, 0, 0)');
  expect(styleBoundary.popupBackground).not.toBe('rgb(255, 0, 0)');
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
  await expect.poll(() => page.evaluate(() => window.sharedSelectChangeCount)).toBe(1);
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
  await app.locator('.game-settings-toggle').click();
  const themePicker = app.getByRole('radiogroup', { name: 'Theme' });
  const classicTheme = themePicker.getByRole('radio', { name: 'Theme: Classic grey' });
  const oceanTheme = themePicker.getByRole('radio', { name: 'Theme: Ocean' });
  await expect(classicTheme.locator('xpath=parent::app-radio')).toHaveCount(1);
  await classicTheme.focus();
  await page.keyboard.press('ArrowRight');
  await expect(oceanTheme).toBeChecked();
  await expect(oceanTheme).toHaveAttribute('aria-checked', 'true');
  await app.getByRole('button', { name: 'Close settings' }).click();

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

test('desktop app windows are named non-modal dialogs and remain independently usable', async ({ page }) => {
  const openApp = async type => {
    await page.locator('#app-menu-btn').click();
    await page.locator(`#app-list .app-launcher[data-type="${type}"]`).click();
  };

  await openApp('calculator');
  const calculator = page.getByRole('dialog', { name: 'Calculator', exact: true });
  await expect(calculator).toBeVisible();
  await expect(calculator).toHaveJSProperty('open', true);

  await openApp('settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings).toHaveJSProperty('open', true);
  await expect(calculator).toBeVisible();

  const modalStates = await page.evaluate(() => [...document.querySelectorAll('.app-window')].map(windowEl => ({
    isDialog: windowEl instanceof HTMLDialogElement,
    modal: windowEl.matches(':modal'),
    ariaModal: windowEl.getAttribute('aria-modal'),
    hasName: Boolean(windowEl.getAttribute('aria-label')),
  })));
  expect(modalStates).toHaveLength(2);
  for (const state of modalStates) {
    expect(state).toEqual({
      isDialog: true,
      modal: false,
      ariaModal: 'false',
      hasName: true,
    });
  }

  await settings.locator('.settings-nav-item[data-page="time"]').click();
  const timeToggle = settings.getByRole('checkbox', { name: 'Use 24-hour time' });
  const initialTimeState = await timeToggle.isChecked();
  await timeToggle.focus();
  await page.keyboard.press('Space');
  if (initialTimeState) await expect(timeToggle).not.toBeChecked();
  else await expect(timeToggle).toBeChecked();

  await calculator.locator('button').first().focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => (
    document.activeElement?.closest('.app-window')?.dataset.type
  ))).toBe('calculator');
  await expect(settings).toBeVisible();
});
