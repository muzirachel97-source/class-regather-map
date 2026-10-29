import {expect} from '@playwright/test';

export async function unlock(page) {
  await page.goto('/c/demo/');
  await page.getByLabel('班级查看码').fill('demo-password-123');
  await page.getByRole('button', {name: '打开班级地图'}).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.pt .d').first()).toBeVisible({timeout: 30_000});
}

export const bootToday = page => page.evaluate(async () => (await (await fetch('api/bootstrap', {credentials: 'same-origin'})).json()).today);

// Same arithmetic as filter.js presetRange, kept independent on purpose.
export function presetLabel(today, years) {
  const index = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - years * 12;
  return `${Math.floor(index / 12)}.${String(index % 12 + 1).padStart(2, '0')}`;
}

export async function dragSheet(page, dy) {
  const grab = await page.locator('#sheet .grab').boundingBox();
  const x = grab.x + grab.width / 2, y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // A slow drag that settles before release: no flick, so the nearest stop wins.
  for (let i = 1; i <= 8; i++) {await page.mouse.move(x, y + dy * i / 8); await page.waitForTimeout(40);}
  await page.waitForTimeout(150);
  await page.mouse.move(x, y + dy);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

export const detent = page => page.locator('#sheet').getAttribute('data-detent');
export const markerSum = page => page.locator('.pt .d').evaluateAll(dots => dots.reduce((sum, dot) => sum + Number(dot.textContent), 0));
export const numberIn = async locator => Number((await locator.textContent()).match(/\d+/)[0]);

// AMap's 3D mode nudges HTML markers by sub-pixels every frame, so Playwright's
// "stable" wait never settles; tap the dot's centre through the real input path.
export async function tapMarker(page, locator) {
  await page.waitForTimeout(400);
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function openWuhan(page) {
  const wuhan = page.locator('.pt', {has: page.locator('.nm', {hasText: /^武汉$/})});
  const wuhanCluster = page.locator('.pt.cl', {has: page.locator('.nm', {hasText: /^武汉等/})});
  await page.waitForTimeout(1200);  // initial fit animation
  for (let i = 0; i < 4 && !(await wuhan.count()); i++) {
    if (await wuhanCluster.count()) await tapMarker(page, wuhanCluster.locator('.d'));
    await page.waitForTimeout(1000);
  }
  await tapMarker(page, wuhan.locator('.d'));
  await expect(page.locator('#sheet')).toHaveAttribute('data-detent', 'half');
}
