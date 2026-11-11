import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';
import { rawFixture } from './helpers';

describe('app render', () => {
  it('shows a clear error screen, not a crash, when the file is malformed', () => {
    const html = renderToStaticMarkup(<App rawData={{ accounts: 'nope' }} />);
    expect(html).toContain('The data file could not be loaded');
    expect(html).toContain('cash_tracker.deposits is missing or is not a list.');
    expect(html).toContain('Demo data.');
  });
  it('shows a failed data check on the worklist when a split does not add up', () => {
    const raw = rawFixture();
    raw.clearinghouse.remittance_records[1].amount_cents = 17000;
    const html = renderToStaticMarkup(<App rawData={raw} />);
    expect(html).toContain('Data checks: 5 of 6 passed');
    expect(html).toContain('Data check failed: Split allocations add up to the parent payment');
    expect(html).toContain('$1,070.00');
  });
  it('renders the real file with the banner and no double counted total', () => {
    const html = renderToStaticMarkup(<App rawData={rawFixture()} />);
    expect(html).toContain('Your decisions reset when you refresh.');
    expect(html).toContain('Data checks: 6 of 6 passed');
    expect(html).not.toContain('$1,550.00');
  });
});
