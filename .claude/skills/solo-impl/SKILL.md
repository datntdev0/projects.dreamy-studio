---
name: solo-impl
description: Implement a plan from `.claude/plans` task by task, committing after each task. Subtasks of a task can run in parallel on coder agents the user picks. Use when the user asks to implement, execute, or build a plan made by `solo-plan`.
argument-hint: <plan path or slug>
---

# Solo Impl

Execute a plan written by `solo-plan`, one task at a time, ending each task in a git commit. Subtasks inside a task may be split across coder agents the user chooses. Follow the steps below literally and in order.

## Steps

1. **Prepare.**
   - If running in herdr, load `toolbox-herdr-core` and `toolbox-herdr-app` before launching any agent.
   - Resolve `$ARGUMENTS` to `.claude/plans/<slug>.plan.md` (accept a full path or a bare slug). If missing or ambiguous, list `.claude/plans/` and ask.
   - Read the whole plan, then `_docs/rules/*.md`.
   - Run `git status` and `git log`. The tree must be clean apart from the plan; if dirty, stop and ask.
   - If earlier tasks of this plan already appear in `git log` (match their planned commit messages), report that and resume from the first task without a commit.
   - Ask the user which coder agents to use for the subtasks, unless already given in `$ARGUMENTS`.
2. **Implement each task in order.** For every task in the plan, do the following before moving to the next:
   1. **Announce** the task number and title.
   2. **Assign** subtasks across the chosen agents, at most one subtask in flight per agent. Make sure agents never edit the same files and every subtask is covered. When subtasks depend on each other, order them so each builds on finished work.
   3. **Launch** the agents. Prompt each with the plan path, its subtask id and text, the goal of the subtask, the files it may edit, "no commits, no subagents", and how to report back. If running in herdr, attach each agent to the current pane and confirm each has its own pane before continuing. Wait for all agents to finish without blocking the main chat, then read their reports.
   4. **Review** the full diff of the task. Fix or send back anything that deviates from the plan or breaks the rules. If the plan is wrong or incomplete, decide whether it is a real blocker (see **Blockers**): fix a non-blocker yourself and note it for the final report, and stop and ask the user only for a real blocker.
   5. **Verify** with the build, lint, or test commands from the plan's Verification section that apply to the touched area. Fix failures before committing.
   6. **Commit** only the files of this task, using the message from the task's `Commit` line.
   7. **Clean up**: close the agents that are not reused for the next task.
3. **Verify the whole plan.** After the last task, run everything in the plan's Verification section, including the manual checks you can perform.
4. **Report** the commits made with their hashes, the verification results, and anything skipped or deviating from the plan. Say plainly what failed.

## Section guidance

- **Task**: matches a task in the plan's Implementation section. It is atomic and ends in exactly one commit. Tasks run strictly sequentially: a task starts only after the previous one is done and committed.
- **Subtask**: matches a `<task>.<n>` subtask. Subtasks of the same task may run in parallel on different agents, each limited to the files it owns in the plan.
- **Agent prompt**: self-contained, since the agent has no chat context. Include the plan path, subtask id and text, the goal, the editable files, the `_docs/rules` to respect, and the instruction not to commit or spawn subagents.

## Blockers

The leader owns the implementation and keeps going when something is merely imperfect. Do not stop or ask the user for these; decide, fix, and report afterwards:

- A file outside the plan's list needs a mechanical, obviously required change
- Small gaps or inaccuracies in the plan that have one clear fix consistent with its intent.
- Agent mistakes, formatting, flaky or stuck agents (send back, restart, or fix directly).

Stop and ask the user only for a real blocker:

- A task that cannot be completed or verified after reasonable attempts.
- A requirement or rule conflict, or a fix that changes the design, contracts, storage, or scope the plan chose.
- A dirty tree or unexpected changes the leader did not make, or an action that is destructive or outward-facing.

## Rules

- Do not edit the plan file.
- Tasks are sequential, no exceptions. Only subtasks of the same task run in parallel.
- Coder agents write code but never commit. You commit, one commit per task.
- Respect `_docs/rules` in every change, including work done by agents.
- If a task cannot be completed or verified, stop, leave the working tree as it is, and report.
