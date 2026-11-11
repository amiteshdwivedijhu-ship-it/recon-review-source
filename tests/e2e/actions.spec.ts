import { expect, test } from '@playwright/test';
import { IDS, activateBlocked, assign, backToWorklist, dateFromToday, historyRows, lastToast, openCase, panel, status } from './helpers';

const due = dateFromToday(3);

test('confirm updates the status, toast, history, and worklist row', async ({ page }) => {
  await openCase(page, 'A');
  await panel(page, IDS.label).getByRole('button', { name: 'Confirm' }).click();
  await expect(status(page, IDS.label)).toHaveText(/Confirmed/);
  await expect(lastToast(page)).toHaveText(/Confirmed: Summary label conflicts with posting evidence\./);
  await expect(historyRows(page)).toHaveCount(1);
  await expect(historyRows(page).first()).toContainText('Demo reviewer');
  await expect(historyRows(page).first()).toContainText('Confirmed finding');
  await expect(historyRows(page).first()).toContainText('Open to Confirmed');
  await backToWorklist(page);
  await expect(page.getByTestId('row-A').getByTestId('cell-last-action')).toContainText('Confirmed finding');
  await expect(page.getByTestId('row-A').getByTestId('cell-attention')).toContainText('Confirmed');
  await expect(page.getByTestId('tile-open')).toContainText('4');
});

test('challenge without a reason is blocked; with a reason it can be dismissed', async ({ page }) => {
  await openCase(page, 'B');
  const p = panel(page, IDS.claim);
  await p.getByRole('button', { name: 'Challenge' }).click();
  await p.getByRole('button', { name: 'Save challenge' }).click();
  await expect(p.getByTestId('form-alert')).toHaveText('Challenge not saved. Fix 1 field.');
  await expect(p.getByText('Add a reason for the challenge.')).toBeVisible();
  await expect(status(page, IDS.claim)).toHaveText(/Open/);
  await expect(page.getByTestId('history-empty')).toBeVisible();

  await p.getByLabel('Reason for the challenge').fill('Review was done by phone today.');
  await p.getByRole('button', { name: 'Save challenge' }).click();
  await expect(status(page, IDS.claim)).toHaveText(/Challenged/);
  await expect(p).toContainText('Review was done by phone today.');
  await p.getByRole('button', { name: 'Dismiss finding' }).click();
  await expect(status(page, IDS.claim)).toHaveText(/Dismissed by reviewer/);
  await expect(historyRows(page)).toHaveCount(2);

  // Dismissing a finding does not make the case look complete.
  await expect(page.getByTestId('case-review')).toHaveText(/Findings resolved, not complete/);
  await expect(page.getByTestId('case-open-items')).toContainText('Not posted for Account A');
  await expect(page.getByTestId('track-ACCT-A').getByTestId('track-posting')).toContainText('Not posted (confirmed)');
  await backToWorklist(page);
  await expect(page.getByTestId('tile-open')).toContainText('3');
  await page.getByRole('button', { name: /Findings resolved/ }).click();
  await expect(page.getByTestId('row-B')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bDone\b/);
});

test('a challenge can be withdrawn back to Open', async ({ page }) => {
  await openCase(page, 'B');
  const p = panel(page, IDS.claim);
  await p.getByRole('button', { name: 'Challenge' }).click();
  await p.getByLabel('Reason for the challenge').fill('Checking.');
  await p.getByRole('button', { name: 'Save challenge' }).click();
  await p.getByRole('button', { name: 'Move back to Open' }).click();
  await expect(status(page, IDS.claim)).toHaveText(/Open/);
  await expect(historyRows(page).first()).toContainText('Challenged to Open');
});

test('missing data: Resolve on Account B is blocked with a reason, state unchanged', async ({ page }) => {
  await openCase(page, 'A');
  const p = panel(page, IDS.missing);
  await activateBlocked(p.getByRole('button', { name: 'Resolve' }));
  await expect(p.getByTestId('blocked-message')).toHaveText("Can't resolve yet. Posting history for Account B is still missing.");
  await expect(status(page, IDS.missing)).toHaveText(/Open/);
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('request evidence, mark it received (simulated), then resolve', async ({ page }) => {
  await openCase(page, 'A');
  const p = panel(page, IDS.missing);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await p.getByRole('button', { name: 'Request evidence' }).click();

  // The form opens with the system suggestion filled in and labeled.
  await expect(p.getByTestId('suggestion-note')).toContainText('Filled in from the system suggestion.');
  await expect(p.getByLabel('Due date')).toHaveValue('2030-04-15');

  // Empty request: three field errors, nothing saved.
  await p.getByRole('button', { name: 'Clear suggestion' }).click();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByTestId('form-alert')).toHaveText('Evidence request not saved. Fix 3 fields.');
  await expect(status(page, IDS.missing)).toHaveText(/Confirmed/);

  await p.getByRole('button', { name: /Use system suggestion/ }).click();
  await expect(p.getByLabel('What is missing')).toHaveValue('Posting history for ACCT-B / FAC-B');
  await expect(p.getByLabel('Who to ask')).toHaveValue('Posting team (Facility B)');
  await p.getByLabel('Due date').fill(due);
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(status(page, IDS.missing)).toHaveText(/Evidence requested/);
  await expect(lastToast(page)).toContainText('Evidence requested from Posting team (Facility B)');

  // Still blocked until the evidence is marked received.
  await activateBlocked(p.getByRole('button', { name: 'Resolve' }));
  await expect(p.getByTestId('blocked-message')).toHaveText("Can't resolve yet. Posting history for Account B is still missing.");
  await expect(p.getByText('Simulated', { exact: true })).toBeVisible();
  await p.getByRole('button', { name: 'Mark evidence received' }).click();
  await p.getByRole('button', { name: 'Resolve' }).click();
  await p.getByRole('button', { name: 'Save resolution' }).click();
  await expect(p.getByText('Add a resolution note.')).toBeVisible();
  await p.getByLabel('Resolution note').fill('History received. Posting team will re-run the match.');
  await p.getByRole('button', { name: 'Save resolution' }).click();
  await expect(status(page, IDS.missing)).toHaveText(/Resolved/);
  await expect(historyRows(page)).toHaveCount(4);

  // The source records did not change, so the track still says Unknown.
  await expect(page.getByTestId('track-ACCT-B').getByTestId('track-posting')).toContainText('Unknown');
  await backToWorklist(page);
  await expect(page.getByTestId('row-A').getByTestId('cell-posting')).toContainText('Unknown');
  await expect(page.getByTestId('row-A').getByTestId('cell-attention')).toContainText('Needs attention');
});

test('invalid handoff: no owner and no due date shows errors and changes nothing', async ({ page }) => {
  await openCase(page, 'C');
  const p = panel(page, IDS.short);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  await p.getByRole('button', { name: 'Clear suggestion' }).click();
  await p.getByLabel('Reason category').selectOption('Deposit mismatch');
  await p.getByLabel('Note for the owner').fill('Please find the reason for the $25.00 gap.');
  await p.getByRole('button', { name: 'Assign', exact: true }).click();

  await expect(p.getByTestId('form-alert')).toHaveText('Handoff not saved. Fix 2 fields.');
  await expect(p.getByText('Choose an owner.')).toBeVisible();
  await expect(p.getByText('Add a due date.')).toBeVisible();
  await expect(p.getByLabel('Owner', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(status(page, IDS.short)).toHaveText(/Confirmed/);
  await expect(historyRows(page)).toHaveCount(1);
  await expect(page.getByTestId('toast')).toHaveCount(1);

  // A due date in the past is rejected too.
  await p.getByLabel('Owner', { exact: true }).selectOption('Cash reconciliation');
  await p.getByLabel('Due date').fill('2020-01-15');
  await p.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(p.getByText("Due date can't be in the past.")).toBeVisible();
  await expect(status(page, IDS.short)).toHaveText(/Confirmed/);
  await expect(historyRows(page)).toHaveCount(1);
});

test('mismatch routing: Case C exception is assigned to Cash reconciliation with a due date', async ({ page }) => {
  await openCase(page, 'C');
  const p = panel(page, IDS.short);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  await expect(p.getByLabel('Owner', { exact: true })).toHaveValue('Cash reconciliation');
  await expect(p.getByLabel('Reason category')).toHaveValue('Deposit mismatch');
  await p.getByLabel('Due date').fill(due);
  await p.getByLabel('Note for the owner').fill('Deposit DEP-003 is $25.00 short of REM-003. Please find the reason.');
  await p.getByRole('button', { name: 'Assign', exact: true }).click();

  await expect(status(page, IDS.short)).toHaveText(/Assigned/);
  await expect(lastToast(page)).toContainText('Assigned to Cash reconciliation');
  await expect(p).toContainText('Deposit mismatch');
  await expect(historyRows(page).first()).toContainText('Assigned follow-up');
  await expect(historyRows(page).first()).toContainText('Confirmed to Assigned');
  await backToWorklist(page);
  const row = page.getByTestId('row-C');
  await expect(row.getByTestId('cell-owner')).toContainText('Cash reconciliation: Follow up');
  await expect(row.getByTestId('cell-owner')).toContainText('Due');
  await expect(row.getByTestId('cell-last-action')).toContainText('Assigned follow-up');
  await expect(row.getByTestId('cell-cash')).toContainText('Variance: short $25.00');
  await expect(row.getByTestId('cell-amount')).toContainText('$25.00');
  await expect(row.getByTestId('cell-amount')).toContainText('of $350.00 paid');
  // The posting decision is still owed, so the case still needs attention.
  await expect(row.getByTestId('cell-attention')).toContainText('Needs attention');
  await expect(row.getByTestId('cell-attention')).toContainText('Posting decision needed');
});

test('assign then resolve a finding that needs no outside evidence', async ({ page }) => {
  await openCase(page, 'A');
  const p = panel(page, IDS.label);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await assign(page, IDS.label, { owner: 'Billing system admin', category: 'Conflicting status', due, note: 'Please fix the summary label on LED-001-A.' });
  await expect(status(page, IDS.label)).toHaveText(/Assigned/);
  await p.getByRole('button', { name: 'Resolve' }).click();
  await p.getByLabel('Resolution note').fill('Label fix request sent to the billing system admin.');
  await p.getByRole('button', { name: 'Save resolution' }).click();
  await expect(status(page, IDS.label)).toHaveText(/Resolved/);
  await expect(p.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
  await backToWorklist(page);
  await expect(page.getByTestId('tile-open')).toContainText('3');
});

test('Case C posting decision: blocked without a reason, then Hold is logged and the exception stays open', async ({ page }) => {
  await openCase(page, 'C');
  const decision = page.getByTestId('posting-decision');
  await decision.getByRole('button', { name: 'Save posting decision' }).click();
  await expect(decision.getByTestId('form-alert')).toHaveText('Posting decision not saved. Fix 2 fields.');
  await expect(decision.getByText('Choose Hold or Proceed per remittance.')).toBeVisible();
  await expect(decision.getByText('Add a reason for this posting decision.')).toBeVisible();

  await decision.getByRole('radio', { name: /Hold/ }).check();
  await decision.getByRole('button', { name: 'Save posting decision' }).click();
  await expect(decision.getByTestId('form-alert')).toHaveText('Posting decision not saved. Fix 1 field.');
  await expect(decision.getByText('Add a reason for this posting decision.')).toBeVisible();
  await expect(page.getByTestId('posting-decision-status')).toHaveText(/Decision needed/);
  await expect(page.getByTestId('history-empty')).toBeVisible();

  await decision.getByLabel('Reason (required)').fill('Holding until Cash reconciliation explains the $25.00.');
  await decision.getByRole('button', { name: 'Save posting decision' }).click();
  await expect(page.getByTestId('posting-decision-status')).toHaveText(/Hold/);
  await expect(lastToast(page)).toHaveText(/Posting decision saved: Hold\. The deposit exception stays open\./);
  await expect(historyRows(page)).toHaveCount(1);
  await expect(historyRows(page).first()).toContainText('Recorded posting decision');
  await expect(historyRows(page).first()).toContainText('No decision to Hold');

  // Shown on the posting track as the reviewer's call, beside the system status.
  const posting = page.getByTestId('track-ACCT-A').getByTestId('track-posting');
  await expect(posting).toContainText('Not posted (confirmed)');
  await expect(posting).toContainText('Your call: Hold');
  // The $25.00 exception is untouched.
  await expect(status(page, IDS.short)).toHaveText(/Open/);
  await expect(page.getByTestId('track-ACCT-A').getByTestId('track-cash')).toContainText('Variance: deposit short by $25.00');
  await backToWorklist(page);
  await expect(page.getByTestId('tile-open')).toContainText('4');
  await expect(page.getByTestId('row-C').getByTestId('cell-posting')).toContainText('Your call: Hold');
  await expect(page.getByTestId('row-C').getByTestId('cell-attention')).toContainText('Deposit short by $25.00, reason unknown');
});

test('Case C posting decision: Proceed per remittance also leaves the exception open, and a change is logged', async ({ page }) => {
  await openCase(page, 'C');
  const decision = page.getByTestId('posting-decision');
  await decision.getByRole('radio', { name: /Proceed per remittance/ }).check();
  await decision.getByLabel('Reason (required)').fill('Remittance is clear at $350.00.');
  await decision.getByRole('button', { name: 'Save posting decision' }).click();
  await expect(page.getByTestId('posting-decision-status')).toHaveText(/Proceed per remittance/);
  await expect(status(page, IDS.short)).toHaveText(/Open/);
  await expect(page.getByTestId('case-review')).toHaveText(/Needs attention/);

  await decision.getByRole('button', { name: 'Change decision' }).click();
  await decision.getByRole('radio', { name: /Hold/ }).check();
  await decision.getByLabel('Reason (required)').fill('Supervisor asked to wait.');
  await decision.getByRole('button', { name: 'Save changed decision' }).click();
  await expect(page.getByTestId('posting-decision-status')).toHaveText(/Hold/);
  await expect(historyRows(page)).toHaveCount(2);
  await expect(historyRows(page).first()).toContainText('Changed posting decision');
  await expect(historyRows(page).first()).toContainText('Proceed per remittance to Hold');
  await expect(status(page, IDS.short)).toHaveText(/Open/);
});

test('Reset demo returns everything to the starting state', async ({ page }) => {
  await openCase(page, 'A');
  await panel(page, IDS.label).getByRole('button', { name: 'Confirm' }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(lastToast(page)).toContainText('Demo reset');
  await expect(status(page, IDS.label)).toHaveText(/Open/);
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await backToWorklist(page);
  await expect(page.getByTestId('row-A').getByTestId('cell-last-action')).toContainText('No action yet');
  await expect(page.getByTestId('tile-open')).toContainText('4');
});

test('decisions reset on refresh, as the banner says', async ({ page }) => {
  await openCase(page, 'B');
  await panel(page, IDS.claim).getByRole('button', { name: 'Confirm' }).click();
  await expect(status(page, IDS.claim)).toHaveText(/Confirmed/);
  await page.reload();
  await expect(status(page, IDS.claim)).toHaveText(/Open/);
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('the worklist re-sorts: a case waiting on someone drops below cases that need attention', async ({ page }) => {
  await openCase(page, 'B');
  const p = panel(page, IDS.claim);
  await p.getByRole('button', { name: 'Confirm' }).click();
  await p.getByRole('button', { name: 'Request evidence' }).click();
  await p.getByLabel('Due date').fill(due);
  await p.getByRole('button', { name: 'Send request' }).click();
  await backToWorklist(page);
  const order = await page.getByTestId('worklist').locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid')));
  expect(order).toEqual(['row-A', 'row-C', 'row-B', 'row-D']);
  await expect(page.getByTestId('row-B').getByTestId('cell-attention')).toContainText('Waiting on someone');
  await page.getByRole('button', { name: /Waiting on someone/ }).click();
  await expect(page.getByTestId('worklist').locator('tbody tr')).toHaveCount(1);
});

test('one-step handoff: an open finding is confirmed and assigned together, and both moves are logged', async ({ page }) => {
  await openCase(page, 'C');
  const p = panel(page, IDS.short);
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  await expect(p.getByTestId('confirm-first-note')).toContainText('This also confirms the finding.');
  await p.getByLabel('Note for the owner').fill('Deposit DEP-003 is $25.00 short of REM-003. Please find the reason.');
  await p.getByRole('button', { name: 'Confirm and assign' }).click();

  await expect(status(page, IDS.short)).toHaveText(/Assigned/);
  await expect(lastToast(page)).toContainText('Confirmed. Assigned to Cash reconciliation, due 2030-04-15.');
  await expect(page.getByTestId('toast')).toHaveCount(1);
  // The top of the case now says who has the next step, and what the reviewer still owes.
  await expect(page.getByTestId('next-step')).toContainText('Record the posting decision');
  await expect(page.getByTestId('next-step')).toContainText('Waiting on Cash reconciliation: follow up, due Apr 15, 2030');
  await expect(historyRows(page)).toHaveCount(2);
  await expect(historyRows(page).nth(0)).toContainText('Confirmed to Assigned');
  await expect(historyRows(page).nth(1)).toContainText('Open to Confirmed');
  // History runs on the demo clock, on the same timeline as the data.
  await expect(historyRows(page).first()).toContainText('Apr 10, 2030');
});

test('one-step handoff that is incomplete leaves the finding Open and logs nothing', async ({ page }) => {
  await openCase(page, 'C');
  const p = panel(page, IDS.short);
  await p.getByRole('button', { name: 'Assign follow-up' }).click();
  // Owner, category, and due date are suggested. The note is the reviewer's to write.
  await p.getByRole('button', { name: 'Confirm and assign' }).click();
  await expect(p.getByTestId('form-alert')).toHaveText('Handoff not saved. Fix 1 field.');
  await expect(p.getByText('Add a short note for the owner.')).toBeVisible();
  await expect(status(page, IDS.short)).toHaveText(/Open/);
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
