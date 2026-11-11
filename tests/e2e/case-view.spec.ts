import { expect, test } from '@playwright/test';
import { IDS, openCase, panel } from './helpers';

test('Case A: three zones, per account tracks, and Unknown shown as Unknown', async ({ page }) => {
  await openCase(page, 'A');
  await expect(page.getByTestId('case-summary')).toHaveText('Cash matched. Posting proven for Account A only.');
  await expect(page.getByRole('heading', { name: 'Source facts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System findings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your decisions' })).toBeVisible();

  const trackA = page.getByTestId('track-ACCT-A');
  await expect(trackA.getByTestId('track-cash')).toContainText('Matched');
  await expect(trackA.getByTestId('track-posting')).toContainText('Verified posted');
  await expect(trackA.getByTestId('track-posting')).toContainText('POST-001');
  const trackB = page.getByTestId('track-ACCT-B');
  await expect(trackB.getByTestId('track-cash')).toContainText('Matched');
  await expect(trackB.getByTestId('track-posting')).toContainText('Unknown');

  // Whole payment: the parent is counted once.
  const whole = page.getByTestId('evidence-payment');
  await expect(whole.locator('[data-field="Amount"]')).toContainText('$480.00');
  await expect(whole.locator('[data-field="Split"]')).toContainText('$180.00 + $300.00');
  await expect(whole.locator('[data-field="Split"]')).toContainText('Adds up to $480.00');

  // Account A: saved transaction beats the stale label.
  const a = page.getByTestId('evidence-ACCT-A');
  await expect(a.locator('[data-field="Transaction"]')).toContainText('POST-001');
  await expect(a.locator('[data-field="Transaction"]')).toContainText('DEMO-OPERATOR-01');
  await expect(a.locator('[data-field="Status"]')).toContainText('Summary label: unposted (label only, not proof)');
  await expect(a.locator('[data-field="Status"]')).toContainText('Label conflicts with transaction');

  // Account B: nulls are Unknown, never $0.00 and never blank.
  const b = page.getByTestId('evidence-ACCT-B');
  const posted = b.locator('[data-field="Posted amount"]');
  await expect(posted.locator('[data-unknown="true"]')).toHaveText('Unknown');
  await expect(posted).not.toContainText('$0.00');
  await expect(b.locator('[data-field="Transaction"] [data-unknown="true"]')).toHaveText('Unknown');
  await expect(b.locator('[data-field="Transaction"]')).toContainText('History unavailable');
  for (const cell of await b.locator('tbody td').all()) {
    expect((await cell.innerText()).trim()).not.toBe('');
  }

  // Findings and actions come before the evidence tables. Ledger-only fields sit in their own group.
  const order = await page.evaluate(() => {
    const top = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top;
    return top('zone-system') < top('zone-source');
  });
  expect(order).toBe(true);
  await expect(a.getByTestId('ledger-only')).toContainText('Billing ledger only');
  await expect(a.getByTestId('ledger-only').getByText('Not in this source')).toHaveCount(0);
  await expect(a.getByTestId('evidence-count')).toHaveText('1 of 10 rows need a look');

  await expect(page.getByTestId('case-info')).toContainText('Deposit arrived 1 day after the remittance date.');
  await expect(page.getByTestId(`finding-${IDS.label}`)).toContainText('Summary label conflicts with posting evidence');
  await expect(page.getByTestId(`finding-${IDS.label}`)).toContainText('Billing system admin');
  await expect(page.getByTestId(`finding-${IDS.missing}`)).toContainText('Posting evidence missing for Account B');
  await expect(page.getByTestId(`finding-${IDS.missing}`)).toContainText('Request posting history for ACCT-B / FAC-B.');
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('Case B: cash matched, not posted, readiness not established', async ({ page }) => {
  await openCase(page, 'B');
  await expect(page.getByTestId('case-summary')).toHaveText('Cash matched. Not posted (confirmed). Ready to post is not established.');
  const track = page.getByTestId('track-ACCT-A');
  await expect(track.getByTestId('track-cash')).toContainText('Matched');
  await expect(track.getByTestId('track-posting')).toContainText('Not posted (confirmed)');
  const table = page.getByTestId('evidence-ACCT-A');
  await expect(table.locator('[data-field="Posted amount"]')).toContainText('$0.00');
  await expect(table.locator('[data-field="Posted amount"]')).toContainText('Known zero');
  await expect(table.locator('[data-field="Transaction"]')).toContainText('None');
  await expect(table.locator('[data-field="Claim review"] [data-unknown="true"]')).toHaveText('Unknown');
  await expect(page.getByTestId(`finding-${IDS.claim}`)).toContainText('Request claim-level review.');
  await expect(page.getByTestId('posting-decision')).toHaveCount(0);
});

test('Case C: variance shown, no system posting suggestion', async ({ page }) => {
  await openCase(page, 'C');
  await expect(page.getByTestId('track-ACCT-A').getByTestId('track-cash')).toContainText('Variance: deposit short by $25.00');
  const amount = page.getByTestId('evidence-ACCT-A').locator('[data-field="Amount"]');
  await expect(amount).toContainText('$350.00');
  await expect(amount).toContainText('$325.00');
  await expect(amount).toContainText('Deposit short by $25.00');
  await expect(page.getByTestId('posting-prompt')).toHaveText('Remit supports $350.00. Deposit shows $325.00. This posting call needs a person.');
  await expect(page.getByText('No system suggestion for posting')).toBeVisible();
  await expect(page.getByTestId('posting-decision-status')).toHaveText(/Decision needed/);
  await expect(page.getByTestId(`finding-${IDS.short}`)).toContainText('Cash reconciliation');
  await expect(page.locator('body')).not.toContainText(/adjustment/i);
});

test('disabled actions say why, on hover and in text', async ({ page }) => {
  await openCase(page, 'A');
  const p = panel(page, IDS.missing);
  const resolve = p.getByRole('button', { name: 'Resolve' });
  await expect(resolve).toHaveAttribute('aria-disabled', 'true');
  await expect(resolve).toHaveAttribute('title', "Can't resolve yet. Posting history for Account B is still missing.");
  await expect(p.getByTestId('blocked-reasons')).toContainText("Resolve: Can't resolve yet. Posting history for Account B is still missing.");
  // A handoff is open from the start: sending it confirms the finding in the same step.
  await expect(p.getByRole('button', { name: 'Request evidence' })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(p.getByRole('button', { name: 'Assign follow-up' })).not.toHaveAttribute('aria-disabled', 'true');
});

test('an unknown case id shows a not found page', async ({ page }) => {
  await page.goto('/#/case/D');
  await expect(page.getByRole('heading', { name: 'Case not found' })).toBeVisible();
  await expect(page.getByText('Demo data. Your decisions reset when you refresh.')).toBeVisible();
});
