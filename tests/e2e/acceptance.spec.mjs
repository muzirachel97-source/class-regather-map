import {test, expect} from '@playwright/test';
import {dragSheet, openWuhan, unlock} from './helpers.mjs';

// Screens compared by hand against the B v3 mockups (class-regather-review/board/b3-*.png).
// Read-only: nothing here saves, so later specs still see the seeded data.
const shot = (page, info, n) => page.screenshot({path: `artifacts/acceptance/${info.project.name}-${n}.png`});
const settle = page => page.waitForTimeout(1800);

test('six screens for visual review', async ({page}, info) => {
  await unlock(page);
  await settle(page);
  await shot(page, info, 1);                        // ① home
  await openWuhan(page);
  await settle(page);
  await shot(page, info, 2);                        // ② Wuhan half
  await page.locator('#sheet-body .more').click();
  await settle(page);
  await shot(page, info, 3);                        // ③ Wuhan full
  await page.locator('#region-close').click();
  await page.locator('#range [data-preset="all"]').click();
  await page.locator('#scope-seg [data-scope="world"]').click();
  await dragSheet(page, -220);
  await settle(page);
  await shot(page, info, 4);                        // ④ overseas

  await page.evaluate(async () => {
    const token = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1] || '';
    await fetch('api/login', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token)},
      body: JSON.stringify({name: '林晓', password: 'demo-password-123'})});
  });
  await page.reload();
  await expect(page.locator('.pt .d').first()).toBeVisible({timeout: 30_000});
  await page.locator('#me-btn').click();
  await settle(page);
  await shot(page, info, 5);                        // ⑤ update: still here?
  await page.locator('#update-move').click();
  await page.locator('#place-input').fill('深');
  const {width, height} = page.viewportSize();
  await page.setViewportSize({width, height: height - 291});  // on-screen keyboard
  await settle(page);
  await shot(page, info, 6);                        // ⑥ moving, keyboard up
  await expect(page.locator('#update-save')).toBeInViewport();
  // The suggestion must stay tappable above the save bar while the keyboard is up.
  const suggestion = await page.locator('.sugg [data-place]').first().boundingBox();
  const bar = await page.locator('#update .savebar').boundingBox();
  expect(suggestion.y + suggestion.height).toBeLessThanOrEqual(bar.y + 1);
});

test('desktop stays usable', async ({page}, info) => {
  test.skip(info.project.name !== 'iphone', 'one desktop shot is enough');
  await page.setViewportSize({width: 1440, height: 900});
  await unlock(page);
  await settle(page);
  await page.screenshot({path: 'artifacts/acceptance/desktop-1.png'});
  await expect(page.locator('#sheet')).toBeInViewport();
  await expect(page.locator('.pt .d').first()).toBeInViewport();
});
