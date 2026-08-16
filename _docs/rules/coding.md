# Code Style

- No member comments.
- Single-line imports.
- Avoid nested functions.
- Rust unit tests live in `desktop/test/`, mirroring `desktop/src/`: one `<name>.test.rs` per source file, declared with `#[cfg(test)] #[path = "<relative path>/test/<dir>/<name>.test.rs"] mod tests;`.
- Common test helpers live in `desktop/test/shared/` and are used through `crate::testing`.
- Unit tests of `desktop/src/shared` stay inline.
