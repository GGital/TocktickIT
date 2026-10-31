# Lab 4 — AI Use and Reflection

I used **Claude Code** with **Claude Opus 5.5** in the Claude Desktop app. Two behaviour plugins stayed on, as in
Lab 3. *caveman* cuts filler from the agent's replies. *ponytail* steers it toward the smallest solution that works.

The work ran in two roles:
- **Specification agent session** (20 Oct): turned the Lab 4 handout into the four contract documents in
  `docs/lab-04/`, then opened the twelve GitHub Issues #79 – #90 on the Project board.
- **Coding agent session** (23 – 30 Oct): implemented #80 – #89 one Issue at a time, each on its own branch, tests
  first. One Issue, #84, ran in a second coding session at the same time, at my request. I committed, pushed, and
  opened every Pull Request myself, and the agent drafted each PR description.

## Selected Key Prompts

### Specification Agent

| Prompt Name | Actual Prompt Text |
|---|---|
| Assign the specification role | *You're Specification AI Agent who are specialized at transform stakeholder requests provided into the engineering contract until the requirements, business rules, acceptance criteria, and test scenarios are sufficiently detailed and complete before implementation begins. Your task: You're required to transform the given stakeholder request into engineering contract with the format of what is provided. You may look into the document of the previous lab to see the format of how it should be and what it should be covered* (with the Lab 4 handout PDF attached) |
| | **My Reflection:** This is the Lab 3 prompt unchanged, with the handout attached instead of a pasted request. Lab 4 changes the existing system rather than adding a new one, so the agent read the Lab 3 contract and the current code before writing. The contract kept the Lab 3 numbering and added FR-01 – FR-34, BR-01 – BR-84, and AC-01 – AC-52. It also named five open decisions instead of settling them quietly: no per-action assignee, the resolution gate, void instead of delete, `expectedVersion` on the Lab 3 staff PATCHes, and the My Tickets status filter. My reviewer checked every ID across all four documents in PR #91 and found only a miscount in my PR description. |
| Turn the contract into a board | *Could you help me open issues on the Github with description of that issues and acceptance criteria for each branches/features that you could distribute the work into? Make sure that it is appeared on the Github Kanban Board as well. Ask me questions if you have anything ambiguous* — answered *Existing project board* · *All to GGital* · *Feature / documentation labels* · *Yes, spec as written* (all the recommended options) |
| | **My Reflection:** The last of the four questions mattered most. It asked whether to write the Issues against the spec as it was, or to add the per-action assignee first. Answering "spec as written" meant every Issue quotes the same five decisions as the contract, so nothing was re-decided during implementation. Each Issue also carries its branch name, its dependencies, the test IDs it must turn green, and acceptance criteria as checkboxes. That made each Issue the full brief for the coding agent. |

### Coding Agent

| Prompt Name | Actual Prompt Text |
|---|---|
| Frame the whole sprint | *I would like you to be coding agent for the lab4. Your job is to implement the system based on the spec and engineering contract provided in the @docs/lab-04 . Your first job is to complete the issue #80 … Don't forget to create the testing files before starting to implement(test-driven development)* |
| | **My Reflection:** Naming test-driven development in the first prompt held for the whole sprint. Every PR draft reports the red run before the green one, and for each bug fix there is a test shown failing without the fix. In #80 the agent found that Prisma's `migrate resolve --rolled-back` refuses a migration that succeeded. It reported this as a deviation instead of hiding it, and wrote a `down.sql` that also deletes the history row. My reviewer called that "the right practical approach" in PR #92. |
| Stop at each Pull Request | Answer to the agent's question about starting #81 while #80 was uncommitted: *The #80 alone right now is enough. We would need to wait for the PR review before proceeding*, then *Accept the down.sql deviation; move on to issue #81.* |
| | **My Reflection:** I turned down the recommended option of branching #81 off the uncommitted #80. The agent kept that rule for the rest of the sprint: it never started a dependent Issue until I said the previous review was done. It drafted every PR description and stopped there. That cost some speed, but each Pull Request my reviewer saw was exactly one Issue. |
| Run independent Issues in parallel | *Are you able to checkout from lab4-staging and complete this issue in parallel with previous one? https://github.com/GGital/TocktickIT/issues/83 If so, please do it* and, while it was working, *this one also, https://github.com/GGital/TocktickIT/issues/84 If you can run it in parallel, please do it* |
| | **My Reflection:** The agent first checked that #83 (dashboard APIs) depended only on #80, then built it on its own branch from `lab4-staging`, without #82's changes. It moved #84 (Actions Taken UI) to a second session of its own, because the screens only needed the API contract, not #82's code. This is why PRs #94 – #96 could all be reviewed on 28 October. |
| Per-issue implementation | *You may start working on this https://github.com/GGital/TocktickIT/issues/85 I have already merged every previous PR into lab4-staging, so you may branch from there* (the same form for #86 – #88) |
| | **My Reflection:** By this point a link to the Issue was the whole prompt, because the Issue already held the branch, the tests, and the acceptance criteria. The agent's definition of done, my reviewer's checklist, and the Issue were the same text. Several Lab 2 and Lab 3 tests had to change because Lab 4 changed their rules (the new home route, `expectedVersion`, the resolution gate). The agent listed every one of those edits as a reviewer decision instead of folding them into the diff, and my reviewer approved each one explicitly in PRs #94, #95, and #99. |
| Act on a review | *I got this request changes review. Please check* (followed by the pasted PR #99 review) |
| | **My Reflection:** The agent reproduced both failures before changing anything. It also admitted its own mistake: its earlier "344 passed" had come from output that a token-saving tool had shortened, and that output hid the unhandled error and the exit code. The fix covered the cause, not just the two reported tests: a full run showed seven more tests timing out the same way, so the time budget was raised once instead of rewriting each test. I posted its short summary as my reply, and the reviewer re-approved within the hour. |
