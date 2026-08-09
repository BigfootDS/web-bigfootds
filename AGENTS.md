# AGENTS.md

Guidance for AI coding agents working in this repository.

## Testing, coverage and feature behaviour

- Write tests that exercise logical behaviour and real use of functions and features. Cover meaningful success, failure, boundary, and regression cases instead of only implementation details.
- Before beginning unrelated work, inspect the changed or nearby feature and its tests. If earlier human work added or changed behaviour without adequate tests, prioritise focused coverage for that behaviour before starting new feature work.
- Treat test coverage as a gap-analysis tool, not a percentage target. Run the repository's relevant coverage command when available, inspect untested changed paths, and add the smallest useful tests for uncovered logic.
- Every new or materially changed feature must include or update tests at the appropriate unit, integration, end-to-end, or documentation-test level. Keep tests readable, deterministic, and close to the behaviour they protect.
- Run the narrowest relevant checks while editing, then the repository's broader test, lint, typecheck, build, or coverage commands when practical. Report commands that could not be run and why.

## Code and feature documentation

- Use JSDoc for exported APIs and non-obvious helpers, classes, callbacks, data shapes, side effects, error behaviour, security constraints, and surprising decisions. Explain contracts and caller obligations; do not add comments that simply repeat the code or TypeScript types.
- Keep the applicable `documentation/*.md` guides current when a feature, workflow, architecture boundary, API contract, configuration value, or operational behaviour changes. Where this repository uses `Documentation/` or `docs/`, update the matching local guide instead.
- Add a focused Markdown guide only when the change introduces enduring behaviour that needs an explanation beyond code and JSDoc. Keep `README.md` as the entry point unless the repository already assigns another documentation role.
- Documentation must describe the implementation that exists now, including relevant tests, commands, constraints, and user-visible behaviour. Use Australian English and real references for externally verifiable claims.

## Local skills

- Use the copied local skills in `.agents/skills/` when their trigger applies:
  - `alex-writing-style` for project documentation and prose.
  - `jsdoc-code-comments` for useful JSDoc and code-comment work.
  - `conventional-commit-summary` for one-line conventional commit subjects.

