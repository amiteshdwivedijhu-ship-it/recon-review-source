# Design and build decisions

Judgment calls made during the agent build and the review that followed, each with a one line why. Items 1 to 33 come from the unattended agent build. Items 34 to 40 come from the review of that build.

## Setup and tools

1. The project has its own git repo on `main`, with one commit per build step. Why: each step can be read and checked on its own.
2. Geist is self-hosted through the `@fontsource/geist-sans` npm package, not loaded from Google Fonts at run time. Why: same font files, but the app and the tests work offline and make no outside calls.
3. Design tokens were checked against saved copies of the public site CSS, not a live browser. Why: the run rules allow network use for package installs only. The saved CSS does contain `#394BF3`, `#8E9BFF`, `#F5F7FF`, `#FAFBFC`, `#F8F9FB`, `rgba(31,32,35,0.28)`, and Geist 400 to 700. Ink `#161525` and the muted gray were not in the saved files, so those two are taken from the goal file as written. Worth a quick look in a browser.
4. `npm run test:e2e` first runs `playwright install chromium`. Why: a clean checkout has no browser. This is the one download beyond `npm install`. It was needed on this machine too.
5. Tailwind 3 with a `tailwind.config.js`, React 18, Vite 6, Vitest 3. Why: stable versions with a config file, as the goal file asks.
6. The agent build ended with a self review, with no second agent. Why: new repo, single author, and the run was limited to one agent.

## Logic

7. Posting is proven only by a saved transaction that matches payment reference, account, facility, and payer, and whose total equals that account's remittance share. Why: "verify posting per account and facility" and a label is never proof.
8. An empty transaction list only means "not posted (confirmed)" when `posting_history_complete` is true. An empty list with incomplete history is Unknown. Why: the README defines both flags, and both must agree.
9. The "ready to post is not established" finding is raised only when cash is matched. Case C gets no such finding. Why: in Case C the posting call belongs to the reviewer panel, and a second finding would read like a system posting suggestion.
10. Case C's deposit finding needs outside evidence (the reason for the $25.00) before it can be resolved. Why: resolving it with the reason still unknown would imply completion.
11. Reviewer decisions never change system statuses. After every finding is resolved or dismissed, a case reads "Findings resolved, not complete" and lists what the records still do not prove. "Reconciled and posted" is only reachable when the records prove it (unit tested on a clean synthetic copy). Why: no case may look complete while a track is Unknown.
12. "Mark evidence received" is simulated and does not edit source data, so Account B's posting track stays Unknown even after its finding is resolved. Why: the fixture must not change, and the screen should not pretend new data arrived.
13. Extra findings exist for cases the sample never hits: missing deposit, deposit over, split mismatch, posted amount mismatch, ledger expected amount mismatch, failed data checks. Why: they fall out of the same rules and are covered by unit tests on broken copies built inside the tests. No extra fixture file was added.
14. A failed data check tied to a payment becomes a finding on that case. One that names no live case shows in the Data checks panel only. Why: every failure stays visible without inventing a case for it.
15. A file with the wrong shape (missing section, float cents, text amount, missing field) stops the load and shows an error page that lists each problem. Why: matching on malformed data would produce wrong money.
16. Business days for the north star use the UTC date of `posted_at`. Why: the data is in UTC and has no time zone for the facility.

## Workflow

17. The allowed moves are exactly the list in the goal file. There is no reopen after Resolved or Dismissed. Why: the list is locked. "Reset demo" covers the demo. Listed as a known gap.
18. Handoff forms open with the system suggestion filled in (owner, category, what is missing, and a due date 3 business days out), under a note that says so. "Clear suggestion" empties the form in one press, and the note for the owner is never drafted. Why: an earlier version started empty and cost a click on every handoff. Nothing is saved until the reviewer sends it, so the suggestion stays a suggestion.
19. The demo clock starts at the data snapshot (2030-04-10, UTC) and runs forward. Due dates and history times use it. Why: an earlier version used the real date, which put 2026 actions beside 2030 payments. One timeline is easier to read, and the banner says the clock is a demo clock.
20. Blocked buttons stay focusable (`aria-disabled`) and show the reason on hover, in a list under the buttons, and in an alert when pressed. Why: a keyboard user cannot hover, and a removed button explains nothing.
21. Resolve on a finding that still waits on evidence always shows the evidence reason first, even before confirm. Why: that is the real blocker, and it matches the example in the goal file.
22. The "Resolved" filter is labeled "Findings resolved". Why: the bare word could suggest the case is complete.
23. Text fields are trimmed and capped at 500 characters. Owner and category must come from the fixed lists even if the form is bypassed. Why: input validation is part of the QA score.
24. Case C needs attention until the posting decision is recorded, even after the deposit exception is handed off. Why: the posting call is a required human step.

## Screens

25. System findings and "Your decisions" sit side by side, one row per finding, directly under the case summary. Source facts come after them. Why: the reviewer reads the finding and acts without scrolling past every evidence table, and the evidence is one scroll away when a finding needs checking. The three zones stay labeled.
26. The evidence table separates "Unknown" (null in the data, dashed) from "Not in this source" (that source has no such field). Why: both are not values, but only one is missing evidence.
27. Split payments get a "Whole payment" table above the per account tables. Why: it is the one place the parent amount is shown, counted once.
28. The worklist "Amount" column shows the payment amount. The amount at issue is shown beside each finding title. Why: both numbers matter and they are different.
29. Case D is a read only row with no detail page. `#/case/D` shows "Case not found" with a note. Why: the brief says spec only.
30. The header says "Signed in as Demo reviewer (no sign-in in this demo)". Why: history needs an actor, and the label should not suggest real sign-in.
31. Weekend deposit dates (DEP-002 is a Saturday) show as an info line, not a finding. Why: tracker dates may be booking dates.
34. From an Open finding, Request evidence and Assign follow-up are available at once. Sending the form confirms the finding and hands it off as one step, with one history entry for each move. If the handoff is incomplete, nothing is saved and the finding stays Open. Why: the state rules still require Confirmed before a handoff, but the reviewer should not pay a separate click for it.
35. In the evidence table, rows that agree show a plain check, and only differences, conflicts, and unknowns get a marker. Fields that only the billing ledger carries sit in one group with a single wide cell. Why: the earlier table filled two columns with "Not in this source" and gave every match the same weight as a mismatch.
36. The worklist shows the amount at issue first, then the payment total. Each account counts once, at its largest open finding. Why: Case C is a $25.00 problem on a $350.00 payment, and the row should say so.
37. One feedback message at a time, at the bottom center. Why: stacked messages in the corner covered the decision history.
38. Actions that are behind the reviewer are no longer shown: Confirm and Challenge after a finding leaves Open, and both handoffs once one is made. Resolve always stays and says why it waits. Why: a row of five disabled buttons hid the one that mattered.
39. Every page puts the conclusion and the next action first, with supporting detail below (the pyramid principle). The worklist opens with a queue of what needs the reviewer. A case opens with its conclusion and "What you need to do", and the status table sits below the findings. Why: a reviewer should know what to do before reading why.
40. The product requirements, QA record, and handoff notes are pages in the app, rendered from PRD.md, QA.md, and README.md at build time, behind a four-way switch in the header. Why: a reviewer can see everything in the submission without opening the repository, and a page cannot drift from its file.

## Docs

32. PRD.md is the specification. It replaced the shorter SPEC.md and carries the phases, the auto-clear rule, and the handoff record in one document.
33. Time spent is reported as hands-on time, with the unattended agent build named separately. Why: both are true, and one number alone would hide one of them.
