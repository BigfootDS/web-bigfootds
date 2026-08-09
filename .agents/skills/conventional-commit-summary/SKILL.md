---
name: conventional-commit-summary
description: "Generate concise one-line Conventional Commit summaries for work completed by an AI agent. Use when Codex needs to summarise code changes, file edits, documentation updates, tests, refactors, fixes, generated assets, breaking changes, or other repository work as a brief git commit message with type, optional scope, optional breaking-change marker, and no extended description."
---

# Conventional Commit Summary

Summarise the completed work as a single Conventional Commit message.

The output must be one line only. Do not include a body, bullet list, explanation, trailer, or extended description field.

Keep in mind how the Conventional Commit syntax maps to semver, if the project uses semver version numbering such as a `package.json` file for NodeJS projects.

- `fix` commits should translate to `PATCH` in semver numbering
- `feat` commits should translate to `MINOR` in semver numbering
- `feat!` or `feat()!` commits should translate to `MAJOR` in semver numbering

While you don't have to determine the new semver number, this framing can help with the developer's expectations and satisfaction with the computed commit message.

## Format

Use this shape:

```text
type(scope): concise summary
```

Use this shape when there is no useful scope:

```text
type: concise summary
```

Use this shape for concise breaking changes:

```text
type(scope)!: concise summary
```

Use this shape for concise breaking changes with no useful scope:

```text
type!: concise summary
```

Keep the message brief enough to work as a git commit subject. Aim for roughly 50 to 72 characters when practical, but prefer clarity over forcing an exact length.

## Breaking Changes

Use `!` immediately before the colon when the change breaks an existing public contract, expected behaviour, API, command, schema, route, configuration format, package export, or documented workflow.

Do not add a `BREAKING CHANGE:` footer. This skill produces one-line commit subjects only.

Use the summary to name what changed, not just that something broke.

Good:

```text
feat(auth)!: changed the password requirements
refactor(api)!: renamed user response fields
chore(config)!: replaced legacy environment variable names
```

Avoid:

```text
feat(auth)!: breaking change
refactor!: changed stuff
```

## Types

Choose the type that best describes the primary change:

- `feat`: adds a user-facing feature, capability, content item, or new behaviour
- `fix`: fixes a bug, broken behaviour, typo with functional impact, or incorrect output
- `docs`: updates documentation, instructions, guides, examples, or prose-only content
- `style`: changes formatting, whitespace, naming, or presentation without changing behaviour
- `refactor`: restructures code without intended behaviour changes
- `test`: adds or updates tests, fixtures, mocks, or test configuration
- `chore`: performs maintenance, setup, dependency, tooling, metadata, or repo housekeeping work
- `build`: changes build scripts, packaging, bundling, or release artefacts
- `ci`: changes continuous integration or deployment workflow configuration
- `perf`: improves performance
- `revert`: reverts a previous change

## Scope

Use a short lowercase scope when it helps identify the area changed.

Good scopes are concrete repository areas, features, packages, routes, components, tools, or content groups:

- `auth`
- `bananas`
- `blog`
- `skill`
- `styles`
- `tests`
- `deps`
- `ci`

Omit the scope when it would be vague or forced.

## Summary Rules

- Write one brief sentence fragment after the colon.
- Start the summary with a lowercase word unless the first word is a proper noun, acronym, file name, or product name.
- Use past tense or simple action phrasing when that best matches the user's style, such as `added`, `fixed`, `updated`, or `removed`.
- Name the concrete thing that changed.
- Add `!` only when the change is genuinely breaking.
- Prefer specific nouns over generic words like `stuff`, `changes`, `updates`, or `improvements`.
- Do not end with a full stop.
- Do not mention that an AI agent did the work unless that is the actual content of the change.
- Do not include issue numbers, co-author trailers, test results, or extra context unless the user explicitly asks for them.

## Examples

```text
feat(bananas): added more banana varieties to the spawn system
feat(auth)!: changed the password requirements
fix(auth): fixed token refresh after expired sessions
docs(readme): updated setup steps for local development
docs(skill): added anti-slop guardrails to Alex writing style
style(nav): tightened spacing between menu links
refactor(api)!: renamed user response fields
refactor(api): moved request validation into shared middleware
test(cart): added coverage for empty checkout states
chore(config)!: replaced legacy environment variable names
chore(deps): updated frontend package versions
build(vite): added production asset compression
ci(actions): added lint checks for pull requests
perf(search): reduced duplicate index lookups
revert(auth): reverted session cookie expiry change
```

## Picking The Best Message

If multiple changes were made, choose the dominant user-visible or repository-significant change.

Examples:

- Code change plus tests: use `feat`, `fix`, or `refactor`, not `test`.
- Documentation-only change: use `docs`.
- Formatting-only change: use `style`.
- Dependency or tooling-only change: use `chore`, `build`, or `ci`.
- Skill content change: usually use `docs(skill)` or `feat(skill)` depending on whether it only explains behaviour or adds a new reusable capability.
- Breaking API, schema, config, route, CLI, or documented workflow change: add `!` before the colon.

When unsure, choose the clearest honest summary over trying to encode every detail.

