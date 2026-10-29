import {test, expect} from '@playwright/test';

test('demo class unlocks with the view code', async ({page}) => {
  await page.goto('/c/demo/');
  const gate = page.locator('#gate');
  await expect(gate).toBeVisible();

  await page.getByLabel('班级查看码').fill('demo-password-123');
  await page.getByRole('button', {name: '打开班级地图'}).click();

  await expect(gate).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#class-title')).toContainText('演示班级');
  await expect(page.locator('#member-list')).toContainText('林晓');
});
