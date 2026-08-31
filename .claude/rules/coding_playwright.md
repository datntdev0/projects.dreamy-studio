---
paths: ["playwright/**/*.{ts}"]
---

# Playwright 

- RULE-V-001: Review the test list for redundant tests.
- RULE-V-002: Review whether tests can be written per story: one test per story.
- RULE-V-003: Keep imports sorted with the project's import-sorting rule.
- RULE-V-004: Keep all named imports from the same module path in ONE LINE declaration:
  - even when that declaration exceeds the configured line width.
  - Do not split named imports from the same module path into multiple lines.
  - Use `// prettier-ignore` directly above an exceptionally long import when necessary.
