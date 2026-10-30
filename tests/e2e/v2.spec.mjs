import {test, expect} from '@playwright/test';
import {detent, dragSheet, loginAs, unlock} from './helpers.mjs';

// Round-2 feedback (2026-10-30): slim bar, tap-to-open, tap-map-to-close, a collapsible
// desktop panel, pinyin-initial search, and "still here" also updating workplace + note.

const visibleHeight = page => page.locator('#sheet').evaluate(el => innerHeight - el.getBoundingClientRect().top);

test('the closed sheet is a slim bar; tapping it opens the range and list', async ({page}) => {
  await unlock(page);
  expect(await detent(page)).toBe('peek');
  expect(await visibleHeight(page)).toBeLessThanOrEqual(150);
  await expect(page.locator('#range')).not.toBeInViewport();
  await expect(page.locator('#sheet-summary')).toContainText('近 3 年');
  await page.locator('#sheet-title').click();
  expect(await detent(page)).toBe('half');
  await expect(page.locator('#range [data-preset="3y"]')).toBeInViewport();
});

test('tapping empty map closes the sheet back to the bar', async ({page}) => {
  await unlock(page);
  await page.locator('#sheet-title').click();
  expect(await detent(page)).toBe('half');
  await page.mouse.click(30, 200);  // open sea / empty land, no dot there
  await expect(page.locator('#sheet')).toHaveAttribute('data-detent', 'peek');
});

test('desktop: the list is a right-hand panel that folds down to a small card', async ({page}, info) => {
  test.skip(info.project.name !== 'iphone', 'one desktop run is enough');
  await page.setViewportSize({width: 1280, height: 800});
  await unlock(page);
  const box = await page.locator('#sheet').boundingBox();
  expect(box.x + box.width).toBeGreaterThan(1280 - 40);  // right side: AMap's logo (bottom-left) stays clear
  expect(box.width).toBeLessThanOrEqual(420);
  expect(await visibleHeight(page)).toBeLessThanOrEqual(150);
  await page.locator('#sheet-title').click();
  await expect(page.locator('#sheet')).toHaveAttribute('data-detent', 'full');
  await expect.poll(() => visibleHeight(page)).toBeGreaterThanOrEqual(500);  // after the 340 ms slide
});

test('search understands pinyin initials', async ({page}) => {
  await unlock(page);
  await page.locator('#sheet-title').click();
  await page.locator('#search').fill('lx');
  await expect(page.locator('#sheet-body .mem', {hasText: '林晓'})).toBeVisible();
});

test.describe('updating, as each device profile\'s own member', () => {
  test.describe.configure({mode: 'serial'});
  const who = info => info.project.name === 'se' ? {name: '陈雨', city: '杭州'} : {name: '林晓', city: '上海'};

  test('the city search takes initials too', async ({page}, info) => {
    await loginAs(page, who(info).name);
    await page.locator('#me-btn').click();
    await page.locator('#update-move').click();
    await expect(page.locator('#update-label')).toBeVisible();
    await expect(page.locator('#update-bio')).toBeVisible();
    await page.locator('#place-input').fill('sz');
    await expect(page.locator('.sugg [data-place]', {hasText: '深圳'}).first()).toBeVisible();
  });

  test('"still here" also asks for workplace and a personal note, then shows them', async ({page}, info) => {
    const me = who(info);
    await loginAs(page, me.name);
    await page.locator('#me-btn').click();
    const where = (await page.locator('#update .card .big').textContent()).trim();  // earlier specs may have moved this member
    await page.locator('#update-confirm').click();
    await expect(page.locator('#update-label')).toBeVisible();
    await page.locator('#update-label').fill('华为 · 坂田');
    await page.locator('#update-bio').fill('周末有空，来了喊我');
    await page.locator('#update-still-save').click();
    await expect(page.locator('#toast')).toContainText(`已确认还在${where}`);
    await dragSheet(page, -220);
    await page.locator('#search').fill(me.name);
    const row = page.locator('#sheet-body .mem', {hasText: me.name});
    await expect(row).toContainText('华为 · 坂田');
    await expect(row).toContainText('周末有空，来了喊我');
    await expect(page.locator('#me-btn .dot')).toBeHidden();
  });
});
