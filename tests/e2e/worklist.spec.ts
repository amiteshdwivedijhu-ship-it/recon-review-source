import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows three live cases and Case D as read only', async ({ page }) => {
  const rows = page.getByTestId('worklist').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('row-A')).toContainText('SYN-PAY-001');
  await expect(page.getByTestId('row-B')).toContainText('SYN-PAY-002');
  await expect(page.getByTestId('row-C')).toContainText('SYN-PAY-003');
  const d = page.getByTestId('row-D');
  await expect(d).toContainText('SYN-CREDIT-004');
  await expect(d).toContainText('Covered in spec');
  await expect(d).toContainText('Investigation needed. Refund not established.');
  await expect(d).toContainText('-$90.00');
  await expect(d.getByRole('link')).toHaveCount(0);
});

test('summary strip shows golden totals and never the double counted sum', async ({ page }) => {
  await expect(page.getByTestId('tile-received')).toContainText('$1,070.00');
  await expect(page.getByTestId('tile-received')).toContainText('3 payments from 5 remittance rows');
  await expect(page.getByTestId('tile-deposited')).toContainText('$1,045.00');
  await expect(page.getByTestId('tile-difference')).toContainText('$25.00');
  await expect(page.getByTestId('tile-open')).toContainText('4');
  await expect(page.locator('body')).not.toContainText('$1,550.00');
});

test('north star tile shows the demo calculation', async ({ page }) => {
  const tile = page.getByTestId('tile-north-star');
  await expect(tile).toContainText('Verified in window');
  await expect(tile).toContainText('$180.00 of $1,070.00 (16.8%)');
  await expect(tile).toContainText('Demo calculation');
});

test('each row shows cash and posting separately, per account', async ({ page }) => {
  const a = page.getByTestId('row-A');
  await expect(a.getByTestId('cell-cash')).toHaveText(/Matched.*Matched/s);
  await expect(a.getByTestId('cell-posting')).toContainText('Verified posted');
  await expect(a.getByTestId('cell-posting')).toContainText('Unknown');
  await expect(a).toContainText('Cash matched. Posting proven for Account A only.');
  await expect(a).toContainText('$480.00');

  const b = page.getByTestId('row-B');
  await expect(b.getByTestId('cell-cash')).toContainText('Matched');
  await expect(b.getByTestId('cell-posting')).toContainText('Not posted (confirmed)');
  await expect(b).toContainText('$240.00');
  await expect(b.getByTestId('cell-owner')).toContainText('Posting team (Facility A)');

  const c = page.getByTestId('row-C');
  await expect(c.getByTestId('cell-cash')).toContainText('Variance: short $25.00');
  await expect(c.getByTestId('cell-posting')).toContainText('Not posted (confirmed)');
  await expect(c.getByTestId('cell-attention')).toContainText('Deposit short by $25.00, reason unknown');
  await expect(c.getByTestId('cell-attention')).toContainText('Posting decision needed');
  await expect(c.getByTestId('cell-owner')).toContainText('Cash reconciliation');
  await expect(c.getByTestId('cell-last-action')).toContainText('No action yet');
  await expect(c.getByTestId('cell-amount')).toContainText('$25.00');
  await expect(c.getByTestId('cell-amount')).toContainText('of $350.00 paid');
  // At 1024 pixels wide the worklist fits without sideways scrolling.
  await page.setViewportSize({ width: 1024, height: 800 });
  const table = page.getByTestId('worklist');
  expect(await table.evaluate((el) => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
});

test('no case is ever called Done', async ({ page }) => {
  await expect(page.locator('body')).not.toContainText(/\bDone\b/);
  for (const id of ['A', 'B', 'C']) {
    await expect(page.getByTestId(`row-${id}`).getByTestId('cell-attention')).toContainText('Needs attention');
  }
});

test('the reset banner is visible and data checks are shown', async ({ page }) => {
  await expect(page.getByText('Demo data. Your decisions reset when you refresh.')).toBeVisible();
  await expect(page.getByTestId('data-checks')).toContainText('Data checks: 6 of 6 passed');
});

test('filters narrow the list and show an empty state', async ({ page }) => {
  await page.getByRole('button', { name: /Needs attention/ }).click();
  await expect(page.getByTestId('worklist').locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: /Waiting on someone/ }).click();
  await expect(page.getByTestId('worklist-empty')).toBeVisible();
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.getByTestId('worklist').locator('tbody tr')).toHaveCount(4);
});

test('a case opens from the keyboard', async ({ page }) => {
  await page.getByRole('link', { name: /Open case B/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Matched amounts with no posting evidence');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('uses the Geist font and shows no logo image', async ({ page }) => {
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toContain('Geist');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px "Geist Sans"'))).toBe(true);
  await expect(page.locator('img, svg')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/ember/i);
});

test('every deliverable opens from the header switch, rendered from its own file', async ({ page }) => {
  const views = page.getByRole('navigation', { name: 'Views' });
  await expect(views.getByRole('link')).toHaveText(['Prototype', 'Product requirements', 'QA record', 'Handoff notes']);
  await expect(views.getByRole('link', { name: 'Prototype' })).toHaveAttribute('aria-current', 'page');

  await views.getByRole('link', { name: 'Product requirements' }).click();
  await expect(views.getByRole('link', { name: 'Product requirements' })).toHaveAttribute('aria-current', 'page');
  const prd = page.getByTestId('prd');
  await expect(prd.getByRole('heading', { level: 1 })).toHaveText('Payment reconciliation review: product requirements');
  await expect(prd.getByRole('heading', { name: '7. The auto-clear rule (Phase 4)' })).toBeVisible();
  await page.getByTestId('doc-contents').getByRole('button', { name: '13. Handoff record' }).click();
  await expect(prd.getByRole('heading', { name: '13. Handoff record' })).toBeInViewport();
  // A link to another written file opens that page. Any other repo file is plain text, so nothing leads nowhere.
  expect(await prd.locator('a:not([href^="http"]):not([href^="#/"])').count()).toBe(0);

  await views.getByRole('link', { name: 'QA record' }).click();
  const qa = page.getByTestId('qa');
  await expect(qa.getByRole('heading', { level: 1 })).toHaveText('QA record');
  await expect(qa.locator('tbody tr').filter({ hasText: 'Invalid handoff' })).toContainText('Pass');

  await views.getByRole('link', { name: 'Handoff notes' }).click();
  const handoff = page.getByTestId('handoff');
  await expect(handoff.getByRole('heading', { name: 'Time spent' })).toBeVisible();
  await expect(handoff.getByRole('heading', { name: 'Known gaps' })).toBeVisible();
  await expect(handoff.getByRole('heading', { name: 'AI tool and one suggestion corrected or verified' })).toBeVisible();
  await handoff.getByRole('link', { name: 'QA.md' }).click();
  await expect(page.getByTestId('qa')).toBeVisible();

  await views.getByRole('link', { name: 'Prototype' }).click();
  await expect(page.getByTestId('worklist')).toBeVisible();
});

test('the worklist leads with what the reviewer has to do', async ({ page }) => {
  const queue = page.getByTestId('action-queue');
  await expect(queue.getByRole('heading')).toHaveText('3 cases need you');
  await expect(queue).toContainText('$745.00 at issue.');
  await expect(page.getByTestId('queue-C')).toContainText('Case C: Review 1 finding, then record the posting decision');
  await expect(page.getByTestId('queue-C')).toContainText('$25.00');
  // The queue sits above the totals and the full table.
  const above = await page.evaluate(() => {
    const top = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top;
    return top('action-queue') < top('tile-received') && top('tile-received') < top('worklist');
  });
  expect(above).toBe(true);
  await page.getByTestId('queue-B').getByRole('link', { name: 'Review Case B' }).click();
  await expect(page.getByTestId('next-step')).toContainText('What you need to do');
  await expect(page.getByTestId('next-step')).toContainText('Review 1 finding');
});
