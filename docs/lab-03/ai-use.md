# Lab 3 — AI Use and Reflection

I used **Claude Code** with **Claude Opus 5** in the Claude Desktop app, the same setup as Labs 1 and 2. Two
behaviour plugins stayed on. *caveman* cuts filler from the agent's replies. *ponytail* steers it toward the
smallest solution that works.

The work ran in two sessions with two roles:
- **Specification agent session** (12–14 Sept): turned the stakeholder request into the four contract documents in
  `docs/lab-03/`, then broke the contract into the seventeen GitHub Issues #45–#61 and put them in order.
- **Coding agent session** (13–19 Sept): implemented those Issues one at a time as the software engineer, each on its
  own branch. The agent wrote the tests before the code and confirmed they failed first. I committed, pushed, and
  opened every Pull Request myself.

Because the contract was approved first (PR #44), every Issue body carries its own `Tests:`, `Covers:`, and `Exit:`
lines. Most implementation prompts were therefore just "Complete this issue" followed by the pasted Issue.

## Selected Key Prompts

### Specification Agent

| Prompt Name | Actual Prompt Text |
|---|---|
| Assign the specification role | *You're Specification AI Agent who are specialized at transform stakeholder requests provided into the engineering contract until the requirements, business rules, acceptance criteria, and test scenarios are sufficiently detailed and complete before implementation begins. Your task: You're required to transform the given stakeholder request into engineering contract with the format of what is provided* (followed by the Lab 3 stakeholder request) *You may look into the document of the previous lab to see the format of how it should be and what it should be covered* |
| | **My Reflection:** This was the Lab 2 prompt with one change: I pointed at the previous lab's documents instead of pasting a template. As a result, the Lab 3 contract kept the Lab 2 numbering style (FR, BR, AC, and A-nn assumptions) and extended the existing documents rather than starting over. The agent read the Lab 2 contract, and the current code before writing. It then asked four questions instead of seventeen, because Lab 2 had already settled most of the ground. |
| Override one recommended default | Answers to the agent's four questions: *All four docs (Recommended)* · *httpOnly session cookie + DB Session table (Recommended)* · *node:crypto scrypt (Recommended)* · *Full IT Staff powers + user admin* (the recommendation was *Read-only on tickets + full user admin*) |
| | **My Reflection:** I accepted three recommendations and overrode the fourth. The handout lets an Administrator be a Ticket Owner and read Internal Notes, so read-only Tickets would have contradicted it. This one answer shaped the authorization matrix, the owner select (active IT Staff *or* Administrator), and the last-Administrator rule. Choosing a server-side session over a JWT in `localStorage` also paid off later: it is exactly the XSS issue I flagged in my partner's PR #42. |
| Turn the contract into a backlog | *I would like you to list issues with the md of them* |
| | **My Reflection:** This returned 17 Issues, each with bullets, the real test IDs from `tests.md`, the AC numbers covered, and one `Exit:` sentence. It matched the style of my Lab 2 Issues without being told. Those `Exit:` lines were the most useful output of the whole sprint. Every one is a single observable fact, for example "two overlapping deactivations of the last two Administrators still leave one active". That made it clear when an Issue was really done. |
| Order the work, then parallelise it | *From the provided issues, I would like you to provide the order of issues for implementation* and *Is there something that can be done in parallel? I would like to this faster* |
| | **My Reflection:** The first answer was one long dependency chain. The second one was better because the agent checked what was actually merged instead of guessing. It found that #46 had mounted `requireSession` only on `/api/auth`, so #47 was small and was the only thing the backend waited on. It split the rest into a backend lane and a screens lane that meet at `api-spec.md`, since component tests mock `fetch` and a screen does not need its API merged. That is why PRs #64–#71 could all be reviewed on 15 September. |

### Coding Agent

| Prompt Name | Actual Prompt Text |
|---|---|
| Frame the whole sprint | *Now, I would like you to be software engineer who received the engineer contract/specs from @docs/lab-03 that will be containing all of the acceptance criteria and business request. Your first job is to complete this issue Data model, migrations, seed* (followed by the Issue #45 bullets) |
| | **My Reflection:** Same framing as Lab 2, and it worked the same way. The agent treated `docs/lab-03` as the contract, so test names and code comments cite BR and AC numbers. When the code disagreed with the spec, it reported the conflict instead of quietly changing either one. My reviewer noted in PR #62 that the migration renamed `RequesterUser` to `User` in place instead of dropping and recreating the table. That decision came from the spec's data-preservation rule, not from me. |
| Make the PR draft a standing rule | *yes, draft the PR and always draft it after completing the issue* |
| | **My Reflection:** One sentence replaced a follow-up prompt on each of the next fifteen Issues. Every draft ended with a "Reviewer check note" listing what to run and what to look at, and my reviewer's approvals often follow those notes point by point. |
| Resolve an overlap between two Issues | Answer to the agent's question on #47: *#47's exit criterion needs every protected endpoint … to answer 401 without a session. Today those routes still identify the Requester by the X-Requester-Id header, and #48 owns switching them to the session. How should #47 handle that overlap?* — *Mount stack on /api (Recommended)*. Answer on #48: *Lab 2 Playwright specs all start from the Development Requester selector … How should #48 treat them?* — *Convert to session login (Recommended)* |
| | **My Reflection:** Both times the agent found a real contradiction between two Issues' exit criteria before writing code, and it asked instead of choosing on its own. Converting the Lab 2 E2E suite instead of deleting it kept every Lab 2 behaviour under test after the selector was removed. My partner's PR #44 showed what the other path costs: a leftover `X-Requester-Id` fallback became an authentication bypass. |
| Per-issue implementation | *Complete this issue* (followed by the Issue bullets, e.g. *Administrator user management API · `GET /api/admin/users` with name/email search and a single optional role filter … Exit: two overlapping deactivations of the last two Administrators still leave one active.*) |
| | **My Reflection:** Most of the seventeen Issues used this prompt. Since the Issue text came from the contract, my prompt, the agent's definition of done, and the reviewer's checklist were all the same text. |
| Insist on the method | *Complete this issue with the PR body message Make sure that use are doing with the test driven development and spec driven development* (followed by the #54 ticket-operations bullets) |
| | **My Reflection:** From here on, each PR draft showed the red run before the green one, plus a mutation check. The agent broke the code on purpose and confirmed that a test failed. This caught weak tests that were passing for the wrong reason. In #59, the concurrent last-Administrator test first stopped at the first refusal, so removing the advisory lock still passed. In this issue, the STYLE-01 colour scan matched no rules under jsdom and passed on nothing. A RESP-01 table check also ran before the data loaded. Each was rewritten until the deliberate break made it fail. Without the mutation step, all three would have been green and useless. |
| Close the sprint with evidence | *I would like you to complete this issue Visual inspection and documentation · Complete the `ui-spec.md` §13 visual checklist against the captured screenshots, not from memory …* *Exit: every checklist item names the evidence file that proves it.* *You may look into previous docs to see repo that I have given reviews and information* |
| | **My Reflection:** "Not from memory" and "names the evidence file" made the agent look at the screenshots instead of the code. Doing that found D-01: the Requester's My Tickets table hid its status column at tablet width, and RESP-01 had missed it. It also found two checklist lines with no test behind them (keyboard operation of the Queue filters and `aria-required` on the new forms), and tests were added instead of the claims being softened. Running the README from a fresh clone found that npm 11 blocks Prisma's install scripts, which would have stopped anyone setting up the project. It also stopped at Prisma's safety guard on `migrate reset` instead of working around it, and left that command for me to run. |
