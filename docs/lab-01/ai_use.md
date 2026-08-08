# Lab 1 — AI Use and Reflection

I used **Claude Code** with **Claude Opus 5** as the coding agent, run from the terminal inside
VS Code. Two behaviour plugins were active: one that keeps the agent's prose terse, and one
("ponytail") that pushes it toward the smallest solution that works instead of scaffolding for
features Lab 1 does not have.

## Selected Key Prompts

| Prompt Name | Actual Prompt Text |
|---|---|
| Plan Lab 1 Implementation | *As a senior software engineer, I would like you to read the instruction on this pdf file. Then, you must generate the execution plan to complete all the tasks. What have been done already: 1. I have created all the issues on the Github project. Output Format: Draft the plan in the markdown file avoiding saying unnecessary words*<br>**My Reflection:** Attaching the labsheet PDF and stating what was already done stopped the agent from re-planning work I had finished. It read the PDF, checked my repo and toolchain, then asked three questions (who runs git, is there a reviewer, which LLM to record) before writing anything. Asking for "the plan in a markdown file" is what made the output reusable across the whole lab instead of scrolling away in the terminal. |
| Set Up Full-Stack Project | *I have already checkout to feature/1-project-foundation branch with postgreSQL server running on docker exposing on port 5432. You may leave where you're requiring postgreSQL credentials as placeholder* |
| | **My Reflection:** Saying "leave credentials as placeholder" kept my database password out of the agent's context entirely. Naming the branch mattered too — the labsheet forbids developing on `lab1-staging`, and the agent verified the branch before touching files. |
| Debug Database Connection | *`Error: P1000: Authentication failed against database server, the provided database credentials for postgres are not valid.` I have got this error. Could you help me check the database* |
| | **My Reflection:** My first instinct was that the password was wrong. Pasting the raw error was more useful than describing it: the agent checked what was actually listening on port 5432 and found two processes — my Windows PostgreSQL 16 service and the Docker proxy — with the Windows service winning. The credentials were fine all along. Lesson: give the agent the error text, not my theory about the error. |
| Fix Seed Command Error | *`Error [ERR_MODULE_NOT_FOUND]: Cannot find module prisma\seed.ts` Got this error instead* |
| | **My Reflection:** This one was self-inflicted scope: the seed hook was configured in Issue 1 but the seed file belongs to Issue 3. Good reminder that "configure everything up front" fights against the lab's issue-by-issue structure. |
| Implement Health Check | *I have checkout into feature/2-health-check you may start your work* |
| | **My Reflection:** By this point the plan file carried all the detail, so a one-line prompt was enough — the agent re-read the acceptance criteria from the plan rather than needing them repeated. Front-loading the plan paid for itself here. |
| Challenge Incomplete Work | *Look like it is still doesn't fulfill the criteria: The React page displays the backend status based on a real API call. A useful error message appears when the backend is unavailable.* |
| | **My Reflection:** The most valuable prompt I wrote. The agent did not just agree with me — it re-ran the app against my own dev server, showed both the Online and Offline states working, and traced my problem to a stale Vite process still serving the pre-feature bundle on port 5173. Pushing back is worth doing, but so is letting the agent push back. |
| Implement Category Feature | *I have checkout to feature/3-category-seed* |
| | **My Reflection:** The agent wrote the model, migration and seed, then proved idempotency by seeding three times and showing the `createdAt` timestamps unchanged. I would have just re-run it once and assumed. Asking for evidence, not just a green checkmark, is the habit to keep. |
| Display Category List | *I have checkout to feature/4-category-list* |
| | **My Reflection:** The first test run failed with a 500 from `/api/categories`. The agent checked `docker ps` before touching the code and found the container had stopped — the code was correct. Checking the environment before editing source saved a pointless debugging session. |

## Overall Reflection

My prompts got shorter as the lab went on, and that was the point. The early effort went into one
detailed planning prompt with the labsheet attached; after that, "I have checked out to
`feature/N-x`" was enough because the plan file held the acceptance criteria, the branch names and
the verification steps.

Three things I would carry into Lab 2:

1. **Paste raw errors, not diagnoses.** Both times I explained what I thought was wrong, I was
   wrong — port conflict, not bad credentials; stopped container, not broken code.
2. **Ask for evidence.** "Tests pass" is weaker than a row count that stays at 4 after three seed
   runs, or a browser tree showing the four categories rendered.
3. **State the constraint, not just the goal.** "Leave the credentials as placeholder" and "we are
   on branch X" prevented more mistakes than any amount of describing what I wanted built.

I reviewed and understood every file, command and dependency before committing. Where the agent
deviated from the labsheet's implied approach — pinning Prisma 6 instead of 7, using a Vite proxy
instead of a CORS package — it said so and gave the reason, and I accepted those two changes
knowingly.
