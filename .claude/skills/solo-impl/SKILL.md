---
name: solo-impl
description: Implement a REQ ID by dispatching sub-agents that follow its plan. Use when the user asks to implement or build a requirement. Requires both spec and plan for the REQ ID.
---

# solo-impl

Input: a REQ ID (format `REQ-xx-yyy`). If none is given, stop and ask for it.

Preconditions: both `_docs/2.<REQ-ID>.spec.md` and `_docs/3.<REQ-ID>.plan.md` must exist. If either is missing, stop and tell the user which skill to run (`/solo-spec` or `/solo-plan`).

## Steps

1. **Read** the spec, the plan and `AGENTS.md`. Split the plan's `Implementation` into steps (one step = one commit).
2. **Dispatch** one sub-agent per step with the Agent tool:
   - Run steps that touch different files in parallel (worktree isolation if they could conflict); run dependent steps in order.
   - Each prompt must be self-contained: the step goal, the relevant spec behaviors and verifications, the `Storage`/`Directory` parts of the plan, and the `AGENTS.md` conventions. Tell it to stay within the step's scope.
   - Each sub-agent implements the step, verifies it (build/tests/storybook as applicable) and commits as `<type>(<scope>): <summary>` (summary ≤ 100 chars).
3. **Verify** after all steps: check each spec `Verifications` scenario is satisfied; fix or re-dispatch where not.
4. **Report**: steps done, verifications passed/failed, and anything deviating from the plan.

## Rules

- Follow the plan; do not add scope. If the plan is wrong or incomplete, stop and tell the user to update it via `/solo-plan`.
- Never skip failing checks; report them.
