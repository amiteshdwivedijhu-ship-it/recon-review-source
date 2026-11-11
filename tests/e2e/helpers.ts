import { type Locator, type Page, expect } from '@playwright/test';

export const IDS = {
  label: 'A:conflicting_status:ACCT-A',
  missing: 'A:missing_posting_evidence:ACCT-B',
  claim: 'B:claim_review_needed:ACCT-A',
  short: 'C:deposit_mismatch',
};

/** The demo clock starts at the data snapshot, 2030-04-10. A date a few days after that, as YYYY-MM-DD. */
export function dateFromToday(offsetDays: number): string {
  const d = new Date(Date.UTC(2030, 3, 10 + offsetDays));
  return d.toISOString().slice(0, 10);
}

export async function openCase(page: Page, caseId: string) {
  await page.goto('/');
  await page.getByTestId(`row-${caseId}`).getByRole('link').click();
  await expect(page.getByTestId('case-summary')).toBeVisible();
}

export const panel = (page: Page, findingId: string): Locator => page.getByTestId(`panel-${findingId}`);
export const status = (page: Page, findingId: string): Locator => panel(page, findingId).getByTestId('finding-status');
export const lastToast = (page: Page): Locator => page.getByTestId('toast').last();
export const historyRows = (page: Page): Locator => page.getByTestId('history').locator('tbody tr');

export async function backToWorklist(page: Page) {
  await page.getByRole('link', { name: 'Back to worklist' }).click();
  await expect(page.getByTestId('worklist')).toBeVisible();
}

export async function assign(page: Page, findingId: string, opts: { owner: string; category: string; due: string; note: string }) {
  const p = panel(page, findingId);
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  await p.getByLabel('Owner', { exact: true }).selectOption(opts.owner);
  await p.getByLabel('Reason category').selectOption(opts.category);
  await p.getByLabel('Due date').fill(opts.due);
  await p.getByLabel('Note for the owner').fill(opts.note);
  await p.getByRole('button', { name: 'Assign', exact: true }).click();
}

/**
 * Activate a blocked action from the keyboard. Blocked buttons are aria-disabled, not removed,
 * so a person can still reach them and read why. Playwright will not mouse-click those.
 */
export async function activateBlocked(button: Locator) {
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await button.focus();
  await button.press('Enter');
}
