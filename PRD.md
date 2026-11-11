# Payment reconciliation review: product requirements

Author: Amitesh Dwivedi. Status: Phase 1 built as a prototype on synthetic data. This is the specification for the take-home. Test results are in [QA.md](QA.md), handoff notes are in [README.md](README.md), and run instructions are in section 13.

## 1. Summary

Before automation is trusted with money, a person must be able to check its work quickly. This product is that review layer for payment posting. It matches remittances, deposits, and the billing ledger, shows what it found and why, and lets a payment posting specialist confirm, challenge, or hand off each finding with full context.

The bet: a review layer that is fast and honest builds a measured track record, and that record is what earns the right to automate. Phase 1 proves a person can verify the system's matching and route exceptions. Later phases measure how often reviewers agree with the system, then let proven clean payments skip review under a strict rule.

One principle governs every screen: proof over labels. A saved transaction proves posting. A status label never does.

## 2. User and problem

The user is a payment posting specialist: a detail-heavy, rules-heavy role measured on speed and accuracy, often working across many accounts and facilities. Their job is proving that three records agree: what the payer said it paid, what the bank received, and what the billing system shows as posted.

Four pains, from desk research (job posts, practitioner guides, industry reports; no interviews yet; full research notes with sources are available on request):

| Pain | Evidence |
|---|---|
| The remittance and the money arrive separately and must be matched. | The industry wrote a rule for it (CAQH CORE reassociation). |
| "Posted" does not prove "paid", and a label does not prove "posted". | Practitioner guides warn that an import success message is not proof of correct posting. |
| Differences cannot always be explained on the day. | Good teams never force a balance. They park the gap with one owner and one due date. |
| Handoffs lose context. | Exception trackers with fixed fields (payer, dates, amount, category, owner, due date) exist because free-text handoffs fail. |

Why a review layer: products in this space already post payments with an agent and show a "human-in-the-loop" review queue. The specialist is increasingly checking a system's work, not doing the matching by hand. That only works if source facts, system findings, and reviewer decisions are visibly different things.

## 3. Goals and non-goals

Goals:
- A specialist can tell in seconds what needs attention, why, how much is at issue, and who owns the next step.
- Every posting claim is backed by transaction evidence, per account and facility.
- Unknown stays visible. No case looks complete while the records leave something open.
- Every exception leaves with an owner, a category, a due date, and its evidence.

Non-goals: posting payments, issuing refunds, resolving exceptions automatically, and replacing the billing system. The product reviews and routes. It does not move money.

## 4. Success metric

North star: **verified dollars in window.** The share of received dollars where, per account and facility, cash is matched and posting is proven by a saved transaction within 3 business days of deposit. On the sample data: $180.00 of $1,070.00 (16.8%).

| Measure | Target | Basis |
|---|---|---|
| Verified dollars within 3 business days | 85% | Posting teams publish 72 hour posting standards. 85% leaves room for real exceptions. |
| Verified dollars within 10 business days | 98% | Month-end close should find almost nothing unverified. |
| Audit error rate on verified accounts (guardrail) | 1% or less | See section 7. |
| Forced balance adjustments (guardrail) | Zero | A gap is explained, never adjusted away. |
| Reviewer decisions later reopened (guardrail) | 5% or less | Above this, speed is being bought with rework. |
| Handoffs complete first time | 90% or more | Required fields should make an incomplete handoff rare. |

Leading measure for automation: **confirm rate per finding type**, the share of system findings a reviewer confirms without challenge.

All targets are starting estimates. The first 30 days of real use sets the baseline, and the targets are re-based once.

## 5. Product principles

1. **Proof over labels.** Only a saved transaction that matches reference, account, facility, payer, and amount proves posting.
2. **Two tracks, never merged.** Cash reconciliation and posting are separate questions with separate statuses.
3. **Unknown is a status.** Missing data shows as Unknown with the reason, never as $0.00 or a blank.
4. **Never force a balance.** Exact cents, no tolerance, no plug adjustment.
5. **The system suggests, a person decides.** Suggestions are labeled as suggestions and nothing is saved until the reviewer sends it.

## 6. Phases

| Phase | Ships | Proves | Exit criterion |
|---|---|---|---|
| 1. Review and handoff (built) | Worklist, case view, calculated findings, handoffs with required fields, decision history, for cases A to C | A person can check the system's matching and route exceptions with context | All acceptance checks pass. They do: 137 rule tests and 31 click-through tests. |
| 2. Saving and measurement | Saved decisions, reopen, audit trail, supervisor approval for dismissals and risky posting calls, confirm and challenge rates by finding type | The system's findings agree with reviewers, measurably | 30 days of use including one month-end close, with a stable confirm rate |
| 3. Wider coverage | Credit investigation (Case D) with a return-deadline clock, many payments in one deposit, payer adjustments, real remittance files | The rules hold on real-world shapes | The Phase 1 checks pass on a larger, messier data set |
| 4. Selective auto-clear | Proven clean payments skip review under the rule in section 7 | Automation is safe where it has a track record | Audit error rate holds at 1% or less for 90 days |

Phase 2 comes before wider coverage on purpose. Nothing in the thesis is possible without saved decisions, and learning from real reviewers is worth more than handling more data shapes unobserved.

## 7. The auto-clear rule (Phase 4)

A payment skips human review only when both parts hold.

**Part 1, the records prove it.** Cash matched to the cent, posting verified by a saved transaction for every account and facility, no conflicting label, nothing Unknown, all data checks passed.

**Part 2, the track record supports it.** For that payer and payment type:

| Setting | Value | Why this number |
|---|---|---|
| Reviewed payments before auto-clear starts | 300 or more | With zero challenges in 300 reviews, the true error rate is under 1% at 95% confidence (the statistical "rule of three": 3 divided by 300). |
| Confirm rate over that set | 99% or more | At most 3 challenges in 300. Clean payments should almost never be disputed. |
| Minimum observation period | 30 days, including one month-end close | Month-end is when hidden posting problems surface. |
| Audit sample of auto-cleared payments | 10% for the first 30 days, then 5%, never fewer than 30 a week | Practitioner guidance for automated decisions puts steady-state sampling near 5%, higher while trust is new. |
| Suspend auto-clear for that payer and type | Audit error rate above 2% in any rolling 100 audited payments | A common trip-wire in human-in-the-loop operations. Any suspension sends work back to full review. |
| Always reviewed | The largest 5% of payments by amount, and every exception | Limits the cost of a rare miss. |

Expected reach: published auto-posting targets for electronic remittances sit at 80% to 90% of lines, with native tools nearer 60% to 70%. Planning assumption: 60% of payments auto-clear in the first year, with 80% as the ceiling. The rest are exceptions, which is where a person adds the most.

These values come from vendor and practitioner sources and one statistical rule. No independent industry standard exists for them. They are defensible starting points to tune against the audit results.

## 8. Phase 1 requirements

**Data model.** Three sources, joined by payment reference, account, and facility. Amounts are integer cents, formatted only on screen. Null means unknown. Zero is a known zero.

| Source | Records | Key facts |
|---|---|---|
| Remittance | Parent, allocation, single payment | Amount, payer, payment date |
| Deposit | Deposit with account allocations | Amount received, deposit date |
| Billing ledger | Payment record, posting transaction, credit | Expected and posted amount, statuses, saved transactions |

**Rules.**

- **Data checks on load:** splits sum to the parent, deposit allocations sum to the deposit, account and facility pairs and payers exist, transactions match their ledger row, links resolve. A failure becomes a visible finding.
- **Matching:** join remittance, deposit, and ledger by payment reference, payer, account, and facility. Parents and single payments are receipts. Allocations are never counted again ($1,070.00 received, not $1,550.00).
- **Cash status per account:** Matched, Variance, or Unknown.
- **Posting status per account and facility:** Verified posted, Not posted (confirmed), Posted amount differs, or Unknown. "Not posted (confirmed)" needs a complete history with no transactions.
- **Findings:** each names its rule, its evidence records, a suggested next step, and a suggested owner.
- **Reviewer moves:** confirm, challenge (reason required), request evidence, assign follow-up (owner, category, due date, note), resolve (note required, and evidence received when the finding waits on evidence).
- **Safeguards:** a blocked action explains why and changes nothing. An incomplete handoff saves nothing. A case never reads as complete while the records leave something open.
- **History:** every action writes one entry: who, what, the status change, and the note.

**Reviewer workflow.**

| From | Action | To | Required |
|---|---|---|---|
| Open | Confirm | Confirmed | None |
| Open | Challenge | Challenged | Reason |
| Challenged | Dismiss, or move back | Dismissed by reviewer, or Open | None |
| Confirmed | Request evidence | Evidence requested | What is missing, who from, due date |
| Confirmed | Assign follow-up | Assigned | Owner, category, due date, note |
| Evidence requested, Assigned | Resolve | Resolved | Note, and evidence received when the finding waits on evidence |

From Open, a handoff may be sent directly: it confirms and hands off as one step, or saves nothing. Human judgment is needed for four things: whether a finding is right, who owns an exception, whether evidence is enough to close it, and the Case C posting call.

**Cases A to D.**

- **A:** Cash matched. Account A is verified by POST-001, and its "unposted" label is a conflict routed to the Billing system admin. Account B is Unknown: request posting history from the Facility B posting team.
- **B:** Cash matched at $240.00. Not posted (confirmed). Readiness is not established: request claim-level review.
- **C:** Deposit short by $25.00, reason unknown. The gap is its own exception for Cash reconciliation and stays open. The tool suggests no posting action. The reviewer records Hold or Proceed per remittance with a reason.
- **D (written only, no screen):** a credit of $90.00 on SYN-CLAIM-004 with no payment reference. Status: "Investigation needed. Refund not established." Evidence needed: the claim's transaction history, remittance detail, refund history, and payer recovery history. Next action: route to a credit investigation owner with a due date. A credit alone does not show a refund is owed. Some payers set return deadlines (Medicare: 60 days after an overpayment is identified, 42 CFR 401.305), so credits need a clock. That rule is an example, not a claim about this fictional payer.

Assumptions: a deposit within 3 business days of the remittance is normal (CAQH CORE timing rule). Business days are Monday to Friday with no holidays. DEP-002 is dated a Saturday: noted, not flagged, since tracker dates may be booking dates. Owners are demo roles.

**Acceptance checks.** All pass. Steps and actual results are in [QA.md](QA.md).

| Check | Expected |
|---|---|
| Split total | $180.00 + $300.00 = $480.00. Received total $1,070.00. |
| Posting evidence | Account A verified by POST-001 despite the "unposted" label. |
| Missing data | Account B shows Unknown. Resolve is blocked with a reason. |
| Mismatch routing | Case C shows $25.00 short and suggests Cash reconciliation. |
| Invalid handoff | No owner or due date: field errors, state and history unchanged. |
| Posting decision | No reason: blocked. With a reason: logged, exception still open. |
| North star | $180.00 of $1,070.00 (16.8%). |

## 9. Key decisions and trade-offs

| Decision | Alternative rejected | Why |
|---|---|---|
| On a short deposit (Case C), the system makes no posting suggestion. The reviewer records Hold or Proceed with a reason, and the gap stays open as its own exception. | System holds posting, or system recommends posting the remittance amount. | Holding slows cash for a gap that is often worked separately. Recommending makes a call the evidence cannot back. This puts the judgment where it belongs and writes it down. |
| Exact-cent matching, no tolerance. | A small tolerance to cut noise. | A tolerance is a forced balance by another name. Small gaps are often the first sign of a pattern. |
| Suggestions are pre-filled and labeled, never saved on their own. | Empty forms, or silent defaults. | Empty forms cost a click on every handoff. Silent defaults blur who decided. |
| Evidence received does not change system status. | Let the reviewer mark a track as proven. | Only source records can prove posting. A reviewer's note is a decision, not evidence. |
| Phase 2 is saving and measurement, not credits. | Build the credit flow first for its compliance weight. | Credits matter, but without saved decisions there is no track record and no way to measure anything. |

## 10. What I changed after reviewing the first build

I reviewed the first working build as a product lead would and changed six things.

1. **Findings now come before the evidence.** The first build put the action buttons below every evidence table, so a reviewer scrolled past the proof to act. Findings and actions now sit under the case summary, with the evidence one scroll away.
2. **Handoff is one step.** Confirming and then handing off were two clicks. Now sending a handoff from an open finding confirms it too, as one all-or-nothing step, with both moves logged.
3. **Rows that agree stay quiet.** Every match had the same visual weight as a mismatch, and two columns were filled with "Not in this source". Now only differences, conflicts, and unknowns are marked.
4. **One timeline.** Actions were stamped with the real date beside 2030 sample data. A demo clock now starts at the data snapshot.
5. **Amount at issue leads.** The worklist showed the payment total. Case C is a $25.00 problem on a $350.00 payment, and the row now says so.
6. **Action first on every page.** Each screen now follows the pyramid principle: the conclusion and the reviewer's next step at the top, supporting detail below. The worklist opens with a queue of what needs the reviewer, one button per case. A case opens with its one-line conclusion and "What you need to do", then findings and actions, then status by account, then the evidence. The specification, QA record, and handoff notes sit beside the prototype in the header, so everything in the submission is one click away.

Each change has a test. The generated build passed every check before these changes, which is the lesson: passing tests showed the rules were right, not that the screen was easy to use.

## 11. Risks and open questions

- **Proceed on a short deposit has no second approver.** Phase 2 adds supervisor approval when the gap is over $10.00 or 1% of the payment. Case C ($25.00, 7%) would need it.
- **A reviewer can dismiss their own challenge.** Phase 2 routes dismissals to a second person.
- **Evidence base is thin.** Four synthetic cases and desk research. No posting specialist has used this.
- **Rubber-stamping.** A 99% confirm rate could mean reviewers stopped reading. Phase 2 tracks time per decision and seeds known-bad cases to check that challenges still happen.
- **Real data shapes.** Many payments in one deposit, payer adjustments, and reversals are untested.
- **Open:** who owns a credit past its return deadline, and whether thresholds should vary by payer.

## 12. Next two weeks

1. Sit with two payment posters on a larger synthetic set that includes one many-to-one deposit and one payer adjustment. Watch where they stop trusting the screen.
2. Add saving and reopen, so the confirm rate and rework guardrail can be measured.
3. Re-base the section 4 targets on what the sessions show.

## 13. Handoff record

**Time spent.** About 3 hours hands-on (me): reading the brief and data, writing the rules and expected results, reviewing the build, and directing the changes in section 10. A coding agent built and tested unattended from my written goal file, outside those hours.

**Run it.** Hosted demo: https://amiteshdwivedijhu-ship-it.github.io/recon-review-demo/ (same build, synthetic data, resets on refresh). To run locally you need Node 20 or newer and npm.

```
npm install
npm run dev         # then open the address it prints, usually http://localhost:5173
npm test            # 137 unit tests on the rules
npm run test:e2e    # 31 click-through tests, downloads a headless Chromium the first time
```

**What is simulated.** Handoffs and evidence requests are saved in the page only and reset on refresh. "Mark evidence received" changes no source record. The posting decision records a choice and posts nothing. "Demo reviewer" is a fixed name. The demo clock starts at the data snapshot, Apr 10, 2030.

**Known gaps.** No saving and no sign-in. No reopen after Resolved or Dismissed. Only the four supplied cases: many payments in one deposit, payer adjustments, reversals, and real remittance files are not handled. Business days ignore holidays. Phone-size screens are not supported. No screen reader pass by a person. No one who posts payments for a living has tried it.

**Next step.** Section 12.

## 14. AI use and one correction

Built with Claude (Claude Code), working from a goal file I wrote that fixed the rules and the expected result for every case before any code existed.

**One suggestion I corrected.** The agent's first rule for "ready to post is not established" fired for any unposted account with no claim review. On Case C that added a second finding, "Request claim-level review", beside the $25.00 deposit gap. It read like the system recommending a posting step on a payment whose cash does not even match, which is the opposite of the Case C decision in section 9. The expected results I had written for Case C (exactly one finding) caught it. The rule now fires only when cash is matched, and a test asserts Case C has one finding.

**One thing tests could not catch.** The first build passed every check with the action buttons below all the evidence. That came from reviewing the screens as a user would, and led to the changes in section 10. More examples are in [AI_LOG.md](AI_LOG.md).

## Sources for the estimates

- Posting window: published posting-team standards of 72 hours, from a health system job posting in my research notes.
- Auto-posting reach: [MedHeave](https://medheave.com/medical-billing-services/what-is-payment-posting/) (80% or more), [Nirmitee](https://nirmitee.io/blog/payment-posting-automation-medical-billing/) (over 90%, native tools 60% to 70%), [ASP-RCM](https://asprcmsolutions.com/whitepapers/835-reconciliation-handbook/) (norm near 84%).
- Audit sampling and suspension trip-wire: [human-in-the-loop patterns](https://alivedise.github.io/backend-engineering-essentials/ai-backend-patterns/human-in-the-loop-ai-patterns) (5% audit of auto-approved decisions), [GTM operations guide](https://gtmstack-production.pages.dev/blog/human-in-the-loop-ai-operations) (tighten above 2% false auto-executions).
- Cross-industry check: cash application teams treat 85% straight-through processing as a strong target ([Stuut](https://www.stuut.ai/blog/cash-application-match-rate-benchmark)).
- Sample size: the statistical rule of three for zero observed errors.
