---
name: solo-review
description: Perform code review on the given specific codebase, identifying potential issues, improvements, and best practices.
disable-model-invocation: true
---

Rules:
- Common rules: `./.claude/rules/conventions.md`.
- Angular rules: `./.claude/rules/coding_angular.md`.
- Playwright rules: `./.claude/rules/coding_playwright.md`.
- Reply the review results using the provided response templates.
- Reply the fixing results using the provided response templates.
- Out of scope: any changes outside the specified rules or requests.

DoD:
- All rules are passed after addressing the identified issues.

Tools:
- `pnpm format`: Run code formatting checks and apply consistent code style.
- `pnpm lint`: Run linting to identify and fix code quality issues.
- `pnpm format --angular`: Run code formatting checks and apply consistent code style specifically for Angular files.
- `pnpm lint --angular`: Run linting to identify and fix code quality issues specifically for Angular files.

---

Response Template #1: The review result
```
Summary of Identified Issues:
- Issue 1: [<RULE-ID>] [Description]
- Issue 2: [<RULE-ID>] [Description]

Suggested Improvements:
- Improvement 1: [Description]
- Improvement 2: [Description]

Adherence to Best Practices:
- [Description]
```

Response Template #2: The fixing result
```
Summary of Fixes:
- Fix 1: [<RULE-ID>] [Description of the fix]
- Fix 2: [<RULE-ID>] [Description of the fix]

Adherence to Best Practices After Fixes:
- [Description]

DoD Checklist:
- [ ] <RULE-ID-001>: [Description]
- [ ] <RULE-ID-002>: [Description]
```
