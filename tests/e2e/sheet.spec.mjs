import {test, expect} from '@playwright/test';
import {detent, dragSheet, unlock} from './helpers.mjs';

test('drag up from peek snaps to half then full, and back down', async ({page}) => {
  await unlock(page);
  expect(await detent(page)).toBe('peek');
  await dragSheet(page, -220);
  expect(await detent(page)).toBe('half');
  await dragSheet(page, -400);
  expect(await detent(page)).toBe('full');
  await dragSheet(page, 500);
  expect(await detent(page)).not.toBe('full');
});

test('single scroll region and a frozen map while the sheet is full', async ({page}) => {
  await unlock(page);
  await dragSheet(page, -700);
  expect(await detent(page)).toBe('full');
  const scrollers = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
    const style = getComputedStyle(el);
    return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.offsetParent !== null;
  }).map(el => el.id || el.className));
  expect(scrollers).toEqual(['sheet-body']);
  await expect(page.locator('#map')).toHaveCSS('pointer-events', 'none');
});

test('no native pickers on the main page', async ({page}) => {
  await unlock(page);
  await dragSheet(page, -700);
  expect(await page.locator('select, input[type=date], input[type=time], input[type=month], input[type=color]').count()).toBe(0);
});
