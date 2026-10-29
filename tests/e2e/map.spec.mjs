import {test, expect} from '@playwright/test';

async function unlock(page) {
  await page.goto('/c/demo/');
  await page.getByLabel('班级查看码').fill('demo-password-123');
  await page.getByRole('button', {name: '打开班级地图'}).click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.pt .d').first()).toBeVisible({timeout: 30_000});
}

const markerSum = page => page.locator('.pt .d').evaluateAll(dots => dots.reduce((sum, dot) => sum + Number(dot.textContent), 0));

test('count markers sum to the located domestic members in the snapshot', async ({page}) => {
  await unlock(page);
  const expected = await page.evaluate(async () => {
    const {members} = await (await fetch('api/snapshot', {credentials: 'same-origin'})).json();
    return members.filter(m => m.location?.country_code === 'CHN' && m.location.confirmed_at).length;
  });
  await expect.poll(() => markerSum(page), {timeout: 15_000}).toBe(expected);
});

test('close cities merge into a cluster at the national zoom', async ({page}) => {
  await unlock(page);
  await expect(page.locator('.pt.cl').first()).toBeVisible();
  await expect(page.locator('.pt.cl .nm').first()).toHaveText(/等 \d+ 城$/);
});

test('amap attribution stays visible and city-level fill is captured for review', async ({page}, info) => {
  await unlock(page);
  await expect(page.locator('.amap-logo').first()).toBeVisible();
  await expect(page.locator('.amap-copyright').first()).toBeAttached();
  await page.waitForTimeout(2500);  // district tiles fade in after the markers
  await page.screenshot({path: `artifacts/map-depth2-${info.project.name}.png`});
});
