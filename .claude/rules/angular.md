---
paths:
  - "angular/**"
---

# Angular

- Always have a `data-testid` on the HTML element, named after the component.
- No isolated stylesheet for an Angular component; use the global SCSS under `angular/styles`.
- Element and landmark names (the accessible name of a `nav`, `aside`, `section`, ...) are English in every language file; only user-facing labels are Vietnamese.
- Import across `app`, `components` and `layout` with the `@app/*`, `@components/*` and `@layout/*` aliases; keep `./` and one-level `../` for files in the same area.
