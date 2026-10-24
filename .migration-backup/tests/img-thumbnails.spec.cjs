const { test, expect } = require('@playwright/test');

const pictures = Array.from({ length: 18 }, (_, i) => ({
  filename: `20261001_Photo_${i + 1}.svg`,
  url: `/pictures/thumb-${i + 1}.svg`,
}));

async function openViewer(page, gallery = pictures, selected = 0) {
  await page.route('**/pictures/manifest.json', route => route.fulfill({ json: gallery }));
  await page.route('**/pictures/thumb-*.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#069"/></svg>',
  }));
  await page.goto('/');
  await page.evaluate(({ url, selected }) => {
    localStorage.setItem('desktop-session-v2', JSON.stringify({
      v: 2, columns: [{ widthPreset: 'half', apps: [{
        type: 'img-viewer', state: { url, galleryIdx: selected },
      }] }],
    }));
  }, { url: gallery[selected]?.url, selected });
  await page.reload();
  await page.locator('#welcome-win-close').click();
}

test('thumbnail selection updates the photo, counter, active state and saved selection', async ({ page }) => {
  await openViewer(page);
  const strip = page.getByRole('navigation', { name: 'Photo thumbnails' });
  await expect(strip).toBeVisible();
  await expect(strip.locator('button')).toHaveCount(18);
  await page.getByRole('button', { name: 'View Photo 8', exact: true }).click();
  await expect(page.locator('.img-viewport img')).toHaveAttribute('src', pictures[7].url);
  await expect(page.locator('.img-counter')).toHaveText('8 / 18');
  await expect(strip.locator('[aria-current="true"]')).toHaveAccessibleName('View Photo 8');
  await expect(strip.locator('.active')).toHaveCount(1);
  await page.reload();
  await expect(strip.locator('[aria-current="true"]')).toHaveAccessibleName('View Photo 8');
});

test('navigation keeps the active thumbnail visible in an overflowing strip', async ({ page }) => {
  await openViewer(page);
  const strip = page.locator('.img-thumbnails');
  await page.locator('.img-toolbar [data-action="prev"]').click();
  await expect(strip.locator('.active')).toHaveAccessibleName('View Photo 18');
  const metrics = await strip.evaluate(el => {
    const active = el.querySelector('.active');
    return {
      overflows: el.scrollWidth > el.clientWidth,
      visible: active.offsetLeft >= el.scrollLeft &&
        active.offsetLeft + active.offsetWidth <= el.scrollLeft + el.clientWidth,
    };
  });
  expect(metrics).toEqual({ overflows: true, visible: true });
  await page.locator('.img-toolbar [data-action="next"]').click();
  await expect(strip.locator('.active')).toHaveAccessibleName('View Photo 1');
  await page.locator('.img-toolbar [data-action="open"]').click();
  await page.locator('.doc-sidebar-item').filter({ hasText: 'Photo 4' }).click();
  await expect(strip.locator('.active')).toHaveAccessibleName('View Photo 4');
});

test('thumbnail buttons work with the keyboard in a narrow viewer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openViewer(page);
  const button = page.getByRole('button', { name: 'View Photo 3', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.img-viewport img')).toHaveAttribute('src', pictures[2].url);
  await expect(page.locator('.img-viewport')).toBeVisible();
});

for (const count of [0, 1]) {
  test(`thumbnail strip auto-hides for ${count} photos`, async ({ page }) => {
    await openViewer(page, pictures.slice(0, count));
    await expect(page.locator('.img-thumbnails')).toBeHidden();
    await expect(page.locator('.img-counter')).toHaveText(count ? '1 / 1' : '');
  });
}
