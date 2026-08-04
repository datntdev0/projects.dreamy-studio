---
name: solo-spec
description: Write a requirement spec for a given REQ ID (e.g. REQ-01-001) into `_docs/2.<REQ-ID>.spec.md`. Use when the user asks to spec, clarify or define requirements. Requires a REQ ID.
---

# solo-spec

Input: a REQ ID (format `REQ-xx-yyy`). If none is given, stop and ask for it. Do nothing else without it.

## Steps

1. **Read context**: `_docs/0.Product-Vision.md`, `_docs/1.Product-Capabilities.md`, and any existing `_docs/2.*.spec.md` related to the REQ.
2. **Clarify** with the human, following "Clarifications" in `AGENTS.md`:
   - Rate each open question: Block / High / Medium / Low.
   - Only ask Block and High business questions (use AskUserQuestion, put the recommended option first).
   - Repeat until no Block or High question remains.
3. **Assume**: for Medium questions, pick the recommended answer yourself and do not ask; remember them for the report. Low questions: just decide, no need to record them. The spec has no assumptions section; apply the choices directly.
4. **Write** `_docs/2.<REQ-ID>.spec.md` from `.claude/templates/requirement.spec.md`:
   - Replace the title with the real REQ ID and name.
   - Keep it short; behaviors and verifications must be concrete and testable.
5. **Review**: start the `doc-reviewer` sub-agent (Agent tool, `subagent_type: "doc-reviewer"`). Pass only the REQ ID and the spec path — no session context or justification, so it stays unbiased. Fix every Block/High finding and re-review once; fix or note Medium/Low as you see fit.
6. **Report**: in your reply (not in the document), list the Medium assumptions you chose so the human can override them. Suggest `/solo-plan <REQ-ID>` next.

## Rules

- Business perspective only: user goals, business rules, user-visible behaviors and outcomes, in business language.
- No technical content: no tech stack, architecture, data model, API, file structure, UI framework or performance/implementation constraints. Do not ask technical questions either; those belong to solo-plan.
- Do not write code.
