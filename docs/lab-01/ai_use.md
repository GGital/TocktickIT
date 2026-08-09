# Lab 1 — AI Use and Reflection

I used **Claude Code** with **Claude Opus 5** as the coding agent, run from Claude Desktop app. 
Two behaviour plugins were active: caveman, and one ("ponytail") that pushes it toward the smallest solution that works instead of scaffolding for features Lab 1 does not have.

## Selected Key Prompts

| Prompt Name | Actual Prompt Text |
|---|---|
| Plan Lab 1 Implementation | *As a senior software engineer, I would like you to read the instruction on this pdf file. Then, you must generate the execution plan to complete all the tasks. What have been done already: 1. I have created all the issues on the Github project. Output Format: Draft the plan in the markdown file avoiding saying unnecessary words
| | **My Reflection:** The review file provided by the model is good to go in a prompt. It read the PDF, checked my repo and toolchain, then asked three questions (who runs git, is there a reviewer, which LLM to record) before writing anything. Asking for "the plan in a markdown file" is what made the output reusable across the whole lab instead of scrolling away in the terminal. |
| Set Up Full-Stack Project | *I have already checkout to feature/1-project-foundation branch with postgreSQL server running on docker exposing on port 5432. You may leave where you're requiring postgreSQL credentials as placeholder* |
| | **My Reflection:** This single prompt works correctly for entire first issue as planned. "requiring postgreSQL credentials as placeholder" was intented not to include secrets in Agent's context.|
| Debug Database Connection | *`Error: P1000: Authentication failed against database server, the provided database credentials for postgres are not valid.` I have got this error. Could you help me check the database* |
| | **My Reflection:** I got this error as I have got 2 postgresql instances running simultaneously (on local and Docker), so I used the agent to diagnose and kill the local processs for me.  |
| Implement Health Check | *I have checkout into feature/2-health-check you may start your work* |
| | **My Reflection:** By this point the plan file carried all the detail, so a one-line prompt was enough. |
| Challenge Incomplete Work | *Look like it is still doesn't fulfill the criteria: The React page displays the backend status based on a real API call. A useful error message appears when the backend is unavailable.* |
| | **My Reflection:** I found out a problem where there is stale Vite process still running on my local causing to unexpected behavior, so the agent diagnose and present me the solution. |
| Implement Category Feature | *I have checkout to feature/3-category-seed* |
| | **My Reflection:** Everything is working just fine. The agent wrote the model, migration and seed, then proved idempotency by seeding three times and showing the `createdAt` timestamps unchanged. |
| Display Category List | *I have checkout to feature/4-category-list* |
| | **My Reflection:** Everything is working just fine. The planning at first just carried all the details here. |

## Overall Reflection

My prompts got shorter as the lab went on, and that was the point. The early effort went into one detailed planning prompt with the labsheet attached; after that, "I have checked out to
`feature/N-x`" was enough.

Three things I would carry into Lab 2:

1. **Paste raw errors, not diagnoses.** Both times I explained what I thought was wrong, I was
   wrong — port conflict, not bad credentials; stopped container, not broken code.
2. **Ask for evidence.** "Tests pass" is weaker than a row count that stays at 4 after three seed
   runs, or a browser tree showing the four categories rendered.
3. **State the constraint, not just the goal.** "Leave the credentials as placeholder" and "we are
   on branch X" prevented more mistakes than any amount of describing what I wanted built.
