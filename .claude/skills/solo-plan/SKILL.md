---
name: solo-plan
description: Write the technical design and implementation plan for a REQ ID into `_docs/3.<REQ-ID>.plan.md`. Use when the user asks to plan or design a requirement. Requires an existing spec for the REQ ID.
---

# solo-plan

Input: a REQ ID (format `REQ-xx-yyy`). If none is given, stop and ask for it.

Precondition: `_docs/2.<REQ-ID>.spec.md` must exist. If not, stop and tell the user to run `/solo-spec <REQ-ID>` first.

## Steps

1. **Read context**: the spec, `AGENTS.md` (conventions), and the relevant existing code (use Explore for broad searches).
2. **Clarify** technical decisions with the human, following "Clarifications" in `AGENTS.md`:
   - Rate each open question: Block / High / Medium / Low.
   - Only ask Block and High questions (use AskUserQuestion, put the recommended option first).
   - Repeat until no Block or High question remains.
3. **Assume**: for Medium questions, pick the recommended answer yourself and do not ask; remember them for the report. Low questions: just decide, no need to record them. The plan has no assumptions section; apply the choices directly.
4. **Write** `_docs/3.<REQ-ID>.plan.md` from `.claude/templates/implement.plan.md`:
   - Title uses `IMP-xx-yyy` matching the REQ ID.
   - `Storage`: data model. `Directory`: file change tree.
   - `Implementation`: ordered steps, each one commit (`<type>(<scope>): <summary>`, summary ≤ 100 chars) with its goal. Each step must be independently buildable and trace back to spec behaviors/verifications.
5. **Review**: start the `doc-reviewer` sub-agent (Agent tool, `subagent_type: "doc-reviewer"`). Pass only the REQ ID and the plan path — no session context or justification, so it stays unbiased. Fix every Block/High finding and re-review once; fix or note Medium/Low as you see fit.
6. **Report**: in your reply (not in the document), list the Medium assumptions you chose so the human can override them. Suggest `/solo-impl <REQ-ID>` next.

## Rules

- Follow the conventions in `AGENTS.md` when designing.
- Do not write code.
