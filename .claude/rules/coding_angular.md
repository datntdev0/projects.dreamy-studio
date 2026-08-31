---
paths: ["angular/**/*.{html,scss,ts}"]
---

# Angular

- RULE-A-001: DO NOT use an isolated stylesheet for an Angular component; 
  - use the global SCSS under `angular/styles`.
- RULE-A-002: MUST have a `data-testid` on the HTML element, named after the component.
- RULE-A-003: Keep imports sorted with the project's import-sorting rule.
- RULE-A-004: Keep all named imports from the same module path in ONE LINE declaration:
  - even when that declaration exceeds the configured line width.
  - Do not split named imports from the same module path into multiple lines.
  - Use `// prettier-ignore` directly above an exceptionally long import when necessary.
- RULE-A-005: Split scss file with over 500 lines into multiple smaller files within a dedicated folder.