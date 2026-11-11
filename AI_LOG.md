# AI log

Tool: Claude (Claude Code), run unattended from a goal file I wrote before any code existed. It fixed the rules, the expected result for every case, and the limits of the run. Every entry below is a real moment from this build where generated work was wrong or unproven and a test or check caught it. Nothing here is invented.

## Generated work that was wrong, and what caught it

1. Ambiguous form locator. The generated click-through tests found the Owner field with `getByLabel('Owner')`. That also matched the field labeled "Note for the owner". Playwright's strict mode failed three tests with "resolved to 2 elements". Fix: exact label match. Lesson for the product too: two labels in one form shared a word, which a screen reader user could also trip on.

2. Blocked buttons the tests could not click. The first tests clicked the blocked "Resolve" button with the mouse. The button is `aria-disabled` on purpose so it stays reachable and can explain itself, and Playwright waits forever on such a button. Two tests timed out at 30 seconds. Fix: the tests now focus the button and press Enter, which also proves a keyboard user gets the blocked message.

3. Twenty seven failures with one cause. The first full e2e run failed every test. Reading the first error instead of the count showed one cause: the Chromium build for this Playwright version was not installed, because the tests were started with `playwright test` directly and skipped the `pretest:e2e` install step. Running `npm run test:e2e` fixed it. No test or app code changed.

4. A rule that would have broken the Case C decision. The first draft of the "ready to post is not established" rule fired for any unposted account with no claim review. Checked against the expected results, that would have put a "Request claim-level review" finding on Case C, which reads like a system posting suggestion. The rule now fires only when cash is matched, and a unit test asserts Case C has exactly one finding.

5. Dead variable. The type checker (`noUnusedLocals`) flagged an unused `textKey` in the generated handoff form. Removed.

6. Layout that only showed up in a screenshot. The first worklist screenshot had payment references and payer names wrapping onto three lines in narrow columns. All tests passed, so only looking at the image caught it. Fix: no wrap on those cells.

7. Noisy blocked reasons. In the Case C screenshot after a handoff, the panel listed a reason for all five buttons, including "Only an open finding can be confirmed." That is true and useless. The list now skips Confirm and Challenge. The reason is still on hover.

## Generated claims that were checked, and held

- The fixture hash is asserted in a unit test against the sha256 recorded in the goal file.
- Weekdays in 2030 (Wed Apr 3, Sat Apr 6) are asserted in tests, not assumed.
- $180.00 of $1,070.00 is 16.8 percent: computed with integer math and asserted.
- Status colors are checked for 4.5 to 1 contrast by a unit test that reads the token file.
- Each data check passes on the real file and fails on a broken copy built inside its test.
- Every blocked workflow move is tested to return the very same state object, so nothing can change by accident.

## Honest notes

- Most domain tests passed on the first run of the implementation. They were written first from the expected results in the goal file and seen to fail only because the module did not exist yet. That is weaker proof than a failing assertion, so each rule also has a broken-copy test that flips the result.
- Design tokens were checked against saved CSS, not a live browser. See DECISIONS.md item 3.
