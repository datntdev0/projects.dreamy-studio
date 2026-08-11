---
name: solo-plan
description: Generate an implementation plan for a human requirement and save it to `.claude/plans`. Use when the user asks to plan, design, or scope a feature, change, or fix before coding. Produces a plan file only, never code changes.
argument-hint: <requirement>
---

# Solo Plan

Turn a human requirement into a concrete implementation plan, saved as a markdown file in `.claude/plans/`. This skill only plans. Do not edit source code.

## Steps

1. **Understand the requirement.** Read `$ARGUMENTS` (or the user's message) and collect the requirement from `_docs/`.
2. **Ground the plan in the codebase.** Read `.claude/rules/*.md` and the code areas the requirement touches (`angular/`, `backend/`, `desktop/`). Find the existing patterns, modules, and naming to follow.
3. **Write the plan** by copying `template.plan.md` (in this skill's directory) and filling every section.
4. **Save it** to `.claude/plans/<slug>.plan.md`, where `<slug>` is a short kebab-case name for the requirement.
5. **Report** the plan path and a two or three line summary, plus any critical assumptions or blocker questions.

## Section guidance

- **Storage Design**: data the change creates or alters: DB tables or columns, migrations, file formats, settings, frontend state. Name the owner module for each. Include the shape (fields and types) and any migration or backward-compatibility concern.
- **Working Directory**: every file to create, modify, or delete, grouped by area and listed as repo-relative paths with directory tree in codeblock.
- **Implementation**: an ordered list of tasks, each broken into subtasks.
  - **Task**: one atomic, independently buildable unit of work that ends in a git commit. Tasks run strictly sequentially: a task starts only after the previous one is done and committed. Give each task a number and title, then:
    - `Commit`: the planned message, following `_docs/rules/commits.md`
    - `Subtasks`: a small step inside a task. Subtasks of the same task may be implemented in parallel and independently, so each must be self-contained and name the files it owns (repo-relative paths).
  - Order tasks so that every task leaves the project building, and number subtasks as `<task>.<n>` (for example `2.1`, `2.2`).
- **Verification**: how to prove it works: commands to run (build, lint, tests) and manual checks, each with the expected result.

## Rules

- Plans must respect the `_docs/rules`; call out any step where the requirement conflicts with them.
- Keep the plan specific and short enough to execute from. No filler, no restating the requirement at length.
- Do not update plan as a historical document, it should always reflect the current intended implementation.
- Do not commit, and do not run anything that mutates the project, while planning.
