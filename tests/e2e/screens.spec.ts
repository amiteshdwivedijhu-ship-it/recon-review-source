import { expect, test } from '@playwright/test';
import { IDS, openCase, panel } from './helpers';

/** Screenshots of our own app for review. Run with: npm run screens */
test.skip(!process.env.SCREENS, 'only runs with SCREENS=1');

const shot = (name: string) => ({ path: `docs/screens/${name}.png`, fullPage: true });

test('capture screens', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot(shot('01-worklist'));
  for (const id of ['A', 'B', 'C']) {
    await openCase(page, id);
    await page.screenshot(shot(`0${'ABC'.indexOf(id) + 2}-case-${id.toLowerCase()}`));
  }
  // Case C with an invalid handoff and a saved posting decision.
  const p = panel(page, IDS.short);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  await p.getByRole('button', { name: 'Clear suggestion' }).click();
  await p.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(p.getByTestId('form-alert')).toBeVisible();
  await page.screenshot(shot('05-case-c-invalid-handoff'));
  await p.getByRole('button', { name: /Use system suggestion/ }).click();
  await p.getByLabel('Note for the owner').fill('Deposit DEP-003 is $25.00 short of REM-003. Please find the reason.');
  await p.getByRole('button', { name: 'Assign', exact: true }).click();
  const decision = page.getByTestId('posting-decision');
  await decision.getByRole('radio', { name: /Hold/ }).check();
  await decision.getByLabel('Reason (required)').fill('Holding until Cash reconciliation explains the $25.00.');
  await decision.getByRole('button', { name: 'Save posting decision' }).click();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await page.screenshot(shot('06-case-c-after-decisions'));
  await page.goto('/#/');
  await expect(page.getByTestId('worklist')).toBeVisible();
  await page.screenshot(shot('07-worklist-after-actions'));
});
