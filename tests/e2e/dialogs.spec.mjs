import {test, expect} from '@playwright/test';
import {dragSheet, unlock} from './helpers.mjs';

const NATIVE = 'select, input[type=date], input[type=time], input[type=month], input[type=color]';
const nativeCount = page => page.locator(NATIVE).count();

// 林晓 (member 001) is demo-admin's member, so this login also opens admin dialogs.
async function loginAdmin(page, {alreadyUnlocked = false} = {}) {
  if (!alreadyUnlocked) await unlock(page);
  await page.evaluate(async () => {
    const token = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1] || '';
    const response = await fetch('api/login', {method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token)},
      body: JSON.stringify({name: '林晓', password: 'demo-password-123'})});
    if (!response.ok) throw new Error(await response.text());
  });
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.pt .d').first()).toBeVisible({timeout: 30_000});
  await dragSheet(page, -700);
}

test('every dialog is free of native pickers', async ({page}) => {
  await unlock(page);
  await dragSheet(page, -700);  // account links live at the end of the home list
  await page.locator('#account #auth-open').click();
  await expect(page.locator('#modal')).toBeVisible();
  expect(await nativeCount(page)).toBe(0);
  await page.locator('#modal-close').click();

  await loginAdmin(page, {alreadyUnlocked: true});
  for (const id of ['#my-password', '#admin-open']) {
    await page.locator(`#account ${id}`).click();
    await expect(page.locator('#modal')).toBeVisible();
    expect(await nativeCount(page), id).toBe(0);
    await page.locator('#modal-close').click();
  }
  await page.locator('#account #admin-open').click();
  await page.locator('#import-open').click();
  expect(await nativeCount(page), 'import').toBe(0);
  await page.locator('#modal-close').click();

  await page.locator('#account #my-profile').click();
  await page.locator('#add-location').click();
  await expect(page.locator('#location-form')).toBeVisible();
  expect(await nativeCount(page), 'location').toBe(0);
});

test('history editing uses the city search and the day picker', async ({page}, info) => {
  // Both device profiles share one database and one admin member: give each its own past stay.
  const [y1, y2] = info.project.name === 'se' ? ['2016', '2017'] : ['2019', '2020'];
  await loginAdmin(page);
  await page.locator('#account #my-profile').click();
  await page.locator('#add-location').click();
  await page.locator('#location-form #place-input').fill('成都');
  await page.locator('#location-form .sugg [data-place]', {hasText: '成都'}).first().click();
  await page.locator('#location-form [data-date="started_on"]').click();
  await page.locator(`.picker [data-year="${y1}"]`).click();
  await page.locator('.picker [data-month="3"]').click();
  await page.locator(`.picker [data-day="${y1}-03-15"]`).click();
  await page.locator('#location-form [data-date="ended_on"]').click();
  await page.locator(`.picker [data-year="${y2}"]`).click();
  await page.locator('.picker [data-month="7"]').click();
  await page.locator(`.picker [data-day="${y2}-07-01"]`).click();
  await page.locator('#location-form button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('足迹已保存');
  await expect(page.locator('#member-detail')).toContainText(`${y1}-03-15 → ${y2}-07-01`);
});
