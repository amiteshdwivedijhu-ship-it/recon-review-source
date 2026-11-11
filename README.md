# Payment reconciliation review (prototype)

A review screen for a payment posting specialist. It loads the synthetic sample data, matches remittances to deposits and ledger records, shows what it found, and lets a reviewer confirm, challenge, request evidence, assign follow-up, and resolve. Cases A to C are live. Case D is covered in PRD.md only.

Everything here is demo data. Nothing is sent, posted, or saved. Your decisions reset when you refresh.

- Product requirements and specification: [PRD.md](PRD.md)
- QA record: [QA.md](QA.md)
- Judgment calls made during the build: [DECISIONS.md](DECISIONS.md)
- AI use and checks: [AI_LOG.md](AI_LOG.md)
- Screenshots of this app: [docs/screens/](docs/screens/)

## Time spent

About 3 hours hands-on (me): reading the brief and data, writing the rules and expected results, reviewing the build, and directing the changes. A coding agent built and tested unattended from my written goal file, outside those hours.

## Hosted demo

https://amiteshdwivedijhu-ship-it.github.io/recon-review-demo/

The same build as this source, with synthetic data only. It resets on refresh. The header switches between four views: the prototype, the product requirements (PRD.md), the QA record (QA.md), and these handoff notes (README.md). Each written page is rendered from its file.

## Setup

Needs Node 20 or newer and npm.

```
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Checks

```
npm test            # 137 unit tests on the rules (Vitest)
npm run test:e2e    # 31 click-through tests (Playwright, headless)
npm run build       # type check and production build into dist/
```

`npm run test:e2e` downloads a headless Chromium the first time. That is the only download besides `npm install`.

Other scripts: `npm run screens` retakes the screenshots in `docs/screens/`. `npm run package` builds and writes `ember-recon.zip` without `node_modules`.

## How to try it

1. Worklist: the queue at the top lists what needs you, with one button per case. Below it, read the summary strip, then the three live rows. Each row shows cash and posting status per account, what needs attention and why, the amount, and who owns the next step.
2. Open Case A. The top says what the records show and what you need to do. The findings and your actions come next. Below them, compare the three sources in "Source facts": rows that agree stay quiet, and only differences and gaps are marked. Account A is proven by POST-001 even though its label says unposted. Account B is Unknown.
3. On "Posting evidence missing for Account B", press Resolve. It is blocked and says why. Press Request evidence: the form opens with the system suggestion filled in and labeled, and sending it confirms the finding in the same step. Watch the worklist row and the history change.
4. Open Case C. Press Assign follow-up, clear the suggestion, and try to assign it with no owner or due date. Nothing is saved and the finding stays Open. Fix the fields and assign it. Record the posting decision with and without a reason.
5. Press "Reset demo", or refresh, to start over.

## Project layout

```
fixtures/         sample_data.json and README.txt, unchanged copies
src/domain/       all rules, as pure functions with no React
  load.ts           shape checks, null stays null
  validate.ts       the six data checks
  cash.ts           receipts and cash reconciliation
  posting.ts        posting status from transaction evidence
  findings.ts       findings, case summary, Case D summary
  metrics.ts        business days and the north star
  workflow.ts       state machine, validation, roll-up
  history.ts        decision history
  evidence.ts       rows for the evidence table
src/ui/           React screens
src/styles/       design tokens
tests/unit/       Vitest
tests/e2e/        Playwright
scripts/          package.sh
```

## Fixtures

`fixtures/sample_data.json` is the supplied file, byte for byte. A unit test checks its sha256 (`6dba24b2...f5f2b`). No extra fixture files were added. Tests that need bad data build a broken copy in memory.

## What is simulated

- Handoffs and evidence requests are saved in the page only. No message goes to anyone.
- "Mark evidence received" does not change any source record, so the status from the records stays as it was.
- The posting decision records a choice. Nothing is posted.
- "Demo reviewer" is a fixed name. There is no sign-in.
- The demo clock starts at the data snapshot (Apr 10, 2030, UTC) and runs forward, so history times and due dates sit on the same timeline as the data.

## Known gaps

- No saving. A refresh clears every decision and the history.
- No reopen after Resolved or Dismissed. Use "Reset demo".
- Only the four supplied cases. Many payments in one deposit, payer adjustments, reversals, and real 835 files are not handled.
- Business days ignore holidays and time zones.
- The north star tile is a calculation on four cases, not a real measurement.
- Design colors were checked against saved copies of the public site CSS, not a live browser.
- No screen reader pass by a person. Keyboard paths and contrast are covered by tests.
- No one who posts payments for a living has tried it.

## Next step

Put it in front of one or two payment posters with a larger synthetic set that includes a many-to-one deposit and a provider-level adjustment. Watch where they stop trusting the screen. After that, add saving and reopen so the rework guardrail in the spec can be measured.

## AI tool and one suggestion corrected or verified

Built with Claude (Claude Code), working from a written goal file.

One suggestion I corrected: the agent's first rule for "ready to post is not established" fired for any unposted account with no claim review. On Case C that added a "Request claim-level review" finding beside the $25.00 deposit gap, which read like the system recommending a posting step on a payment whose cash does not match. The expected results I had written for Case C (exactly one finding) caught it. The rule now fires only when cash is matched, and a test asserts it. More examples are in AI_LOG.md.
