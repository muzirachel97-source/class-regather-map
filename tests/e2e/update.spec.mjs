import {test, expect} from '@playwright/test';
import {bootToday, dragSheet, unlock} from './helpers.mjs';

// Each device profile updates its own claimed demo member (both confirmed 13 months ago),
// because the two projects share one seeded database per run.
const PEOPLE = {iphone: {name: '林晓', city: '上海'}, se: {name: '陈雨', city: '杭州'}};
let who;
test.beforeEach(({}, info) => {who = PEOPLE[info.project.name];});

// Login is set up through the API: the login form itself is upstream code, not under test here.
async function loginAsOwnMember(page) {
  await unlock(page);
  await page.evaluate(async name => {
    const token = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1] || '';
    const response = await fetch('api/login', {method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token)},
      body: JSON.stringify({name, password: 'demo-password-123'})});
    if (!response.ok) throw new Error(await response.text());
  }, who.name);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.pt .d').first()).toBeVisible({timeout: 30_000});
}

test.describe.configure({mode: 'serial'});

test('stale dot shows for a 13-month-old confirmation', async ({page}) => {
  await loginAsOwnMember(page);
  await expect(page.locator('#me-btn .dot')).toBeVisible();
});

test('save stays disabled until a suggestion is picked', async ({page}) => {
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await expect(page.locator('#update .who')).toContainText(who.name);
  await page.locator('#update-move').click();
  await page.locator('#place-input').fill('深');
  await expect(page.locator('#update-save')).toBeDisabled();
  await expect(page.locator('#update .hint')).toContainText('点选下面的结果后才能保存');
  await page.locator('.sugg [data-place]', {hasText: '深圳'}).first().click();
  await expect(page.locator('#update-save')).toBeEnabled();
});

test('a move earlier than the current stay is rejected and keeps the input', async ({page}) => {
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await page.locator('#update-move').click();
  await page.locator('#place-input').fill('深');
  await page.locator('.sugg [data-place]', {hasText: '深圳'}).first().click();
  await page.locator('#moved-at').click();
  await page.locator('.picker [data-year="2020"]').click();
  await page.locator('.picker [data-month="1"]').click();
  await page.locator('#update-save').click();
  await expect(page.locator('#update .field-error')).toContainText(`比你在${who.city}的开始时间还早`);
  await expect(page.locator('#place-input')).toHaveValue(/深圳/);
});

test('the form is locked while saving and keeps the input when saving fails', async ({page}) => {
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await page.locator('#update-move').click();
  await page.locator('#place-input').fill('成');
  await page.locator('.sugg [data-place]', {hasText: '成都'}).first().click();
  let release;
  await page.route('**/api/members/*/locations', route => new Promise(resolve => {
    release = () => resolve(route.fulfill({status: 500, contentType: 'application/json', body: '{"error":"服务暂时不可用"}'}));
  }));
  await page.locator('#update-save').click();
  await expect(page.locator('#update-save')).toHaveText('正在保存…');
  await expect(page.locator('#update-save')).toBeDisabled();
  await expect(page.locator('#place-input')).toBeDisabled();
  await expect(page.locator('#update [data-mode="world"]')).toBeDisabled();
  release();
  await expect(page.locator('#update .field-error')).toContainText('没保存成功，内容已保留');
  await expect(page.locator('#place-input')).toHaveValue('成都');
  await expect(page.locator('#update-save')).toBeEnabled();
});

test('a late device location does not overwrite a later manual choice', async ({page, context}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude: 22.54, longitude: 114.06});
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await page.locator('#update-move').click();
  await page.locator('#locate').click();
  await page.locator('#update [data-mode="world"]').click();
  await page.locator('#place-input').fill('日本');
  await page.locator('.sugg [data-place]', {hasText: '日本'}).first().click();
  await page.waitForTimeout(4000);  // long enough for convertFrom + reverse geocoding to land
  await expect(page.locator('#place-input')).toHaveValue('日本');
});

test('closing the update view returns to the member detail it came from', async ({page}) => {
  await loginAsOwnMember(page);
  await dragSheet(page, -700);
  await page.locator('#account #my-profile').click();
  await expect(page.locator('#member-detail')).toBeVisible();
  await dragSheet(page, 350);  // pull the detail down so the top bar (and 我) is reachable
  await page.locator('#me-btn').click();
  await expect(page.locator('#update')).toBeVisible();
  await page.locator('#region-close').click();
  await expect(page.locator('#member-detail')).toBeVisible();
  await expect(page.locator('#sheet-title')).toHaveText(who.name);
});

test('still here refreshes the confirmation and clears the dot', async ({page}) => {
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await expect(page.locator('#update .card')).toContainText(who.city);
  await page.locator('#update-confirm').click();
  await expect(page.locator('#toast')).toContainText(`已确认还在${who.city}`);
  await expect(page.locator('#me-btn .dot')).toBeHidden();
});

test('moving to Shenzhen without a month starts today', async ({page}) => {
  await loginAsOwnMember(page);
  const today = await bootToday(page);
  await page.locator('#me-btn').click();
  await page.locator('#update-move').click();
  await page.locator('#place-input').fill('深');
  await page.locator('.sugg [data-place]', {hasText: '深圳'}).first().click();
  await page.locator('#update-note').fill('南山做游戏');
  await page.locator('#update-save').click();
  await expect(page.locator('#toast')).toContainText('已更新到深圳 · 最近确认：今天');
  const latest = await page.evaluate(async () => {
    const me = (await (await fetch('api/bootstrap', {credentials: 'same-origin'})).json()).me;
    const detail = await (await fetch(`api/members/${me.id}`, {credentials: 'same-origin'})).json();
    return detail.locations.at(-1);
  });
  expect(latest.city_name).toContain('深圳');
  expect(latest.started_on).toBe(today);
  expect(latest.note).toBe('南山做游戏');
});

test('not me logs out and opens the login form', async ({page}) => {
  await loginAsOwnMember(page);
  await page.locator('#me-btn').click();
  await page.locator('#update .who button').click();
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#modal input[name="password"]')).toBeVisible();
  const me = await page.evaluate(async () => (await (await fetch('api/bootstrap', {credentials: 'same-origin'})).json()).me);
  expect(me).toBeFalsy();
});
