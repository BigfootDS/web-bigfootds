---
name: jsdoc-code-comments
description: "Write, improve, or review human-friendly JSDoc comments for JavaScript and TypeScript. Use when Codex needs to document functions, classes, modules, React components, hooks, callbacks, object shapes, public APIs, tricky behaviour, side effects, thrown errors, async results, edge cases, or generated code comments while avoiding pointless comments that merely repeat the code."
---

# JSDoc Code Comments

Write JSDoc that helps the next developer understand the contract, intent, and surprising parts of JavaScript or TypeScript code.

Do not add comment noise. A good JSDoc block earns its space by saying something the signature, names, and nearby implementation do not already make obvious.

## Workflow

1. Read the surrounding code before writing comments.
2. Identify the real documentation target: exported API, shared helper, class, component, hook, callback, type alias, object shape, or complex internal function.
3. Document behaviour and constraints before syntax details.
4. Prefer editing or deleting weak existing comments over stacking new comments on top of them.
5. Use `/** ... */` JSDoc blocks immediately above the declaration they document.
6. Keep the first sentence useful as a standalone summary.
7. Add tags only when they clarify the contract.
8. Re-read the comment against the code and remove anything that is obvious, stale, vague, or unverified.

## What Good JSDoc Explains

Use JSDoc to clarify:

- The purpose of a public API, exported function, class, component, or hook.
- Preconditions, invariants, or assumptions that callers must honour.
- Non-obvious input formats, units, time zones, ID types, or data sources.
- Return values that need interpretation, such as `null`, empty arrays, partial objects, or status objects.
- Side effects, mutation, caching, persistence, network calls, logging, analytics, timers, or DOM updates.
- Error behaviour, especially expected thrown errors or rejected promises.
- Async behaviour such as retries, cancellation, debouncing, polling, and stale data.
- Security, privacy, accessibility, or performance constraints that affect how the code should be used.
- Why a surprising implementation exists, if the reason belongs near the code.

Avoid JSDoc that only says what the code already says:

- `/** Gets the user. */` above `getUser`.
- `@param id - The id.` when the parameter name and type already say that.
- `@returns The result.` without naming what result means.
- Type descriptions that duplicate TypeScript annotations without adding meaning.
- Broad praise such as `robust`, `powerful`, `comprehensive`, or `seamless`.

## Syntax Guidelines

Use standard JSDoc shape:

```js
/**
 * Short summary of the contract or behaviour.
 *
 * Extra detail only when it helps explain constraints, edge cases, side
 * effects, examples, or why the code behaves this way.
 *
 * @param {Type} name - Description that adds meaning.
 * @returns {Type} Description of the returned value.
 */
```

For JavaScript, include types in tags when they are not otherwise available:

```js
/**
 * Builds a display label for a saved repository search.
 *
 * @param {object} search - Persisted search record from local storage.
 * @param {string} search.name - User-visible search name.
 * @param {string[]} search.topics - GitHub topics included in the search.
 * @returns {string} Label suitable for a compact toolbar button.
 */
function formatSearchLabel(search) {
  return `${search.name} (${search.topics.length})`;
}
```

For TypeScript, do not restate types unless the project expects typed JSDoc. Use tags to explain meaning, units, edge cases, or caller obligations:

```ts
/**
 * Converts a stored repository timestamp into the user's local display month.
 *
 * @param timestamp - ISO 8601 timestamp returned by the GitHub API.
 * @param timeZone - IANA time zone used for month boundaries.
 * @returns Month label formatted as `YYYY-MM`.
 */
function toDisplayMonth(timestamp: string, timeZone: string): string {
  // ...
}
```

Use specialised tags when they genuinely clarify the API:

- `@throws` for expected thrown errors or promise rejections.
- `@example` for public APIs where a short usage example prevents mistakes.
- `@deprecated` with replacement guidance.
- `@template` for generic JavaScript utilities.
- `@typedef`, `@property`, and `@callback` when documenting plain JavaScript shapes.
- `@remarks` only if the local documentation tooling supports it.

## Good Examples

Good JSDoc describes the real contract and the detail a caller could misuse.

```ts
/**
 * Loads the profile shown in account settings.
 *
 * Returns `null` when the API reports that the user no longer exists, so the
 * caller can render account recovery instead of treating it as a transport
 * failure.
 *
 * @param userId - Stable session user ID, not the public username.
 * @throws {NetworkError} When the profile endpoint cannot be reached.
 */
async function loadSettingsProfile(userId: string): Promise<UserProfile | null> {
  // ...
}
```

```js
/**
 * Groups invoices by billing month using the account's configured time zone.
 *
 * This keeps invoices issued near midnight with the month the customer sees on
 * their statement, rather than the server's UTC month.
 *
 * @param {Invoice[]} invoices - Invoices with ISO 8601 `issuedAt` values.
 * @param {string} timeZone - IANA time zone such as `Australia/Sydney`.
 * @returns {Map<string, Invoice[]>} Invoices keyed by `YYYY-MM`.
 */
function groupInvoicesByBillingMonth(invoices, timeZone) {
  // ...
}
```

```tsx
/**
 * Renders the saved-search filter bar.
 *
 * Keeps draft filter state local until Apply is clicked, so parent data loaders
 * are not called on every keystroke.
 */
function SavedSearchFilters(props: SavedSearchFiltersProps) {
  // ...
}
```

```ts
/**
 * Coordinates writes for user records that may be retried by the queue.
 *
 * Writes for the same user ID run sequentially to avoid an older retry
 * overwriting fresher profile data.
 */
class UserWriteCoordinator {
  // ...
}
```

## Bad Examples

Bad JSDoc repeats names, pads the file, or makes generic claims without adding useful information.

```ts
/**
 * Gets a user.
 *
 * @param userId - The user ID.
 * @returns The user.
 */
async function getUser(userId: string): Promise<User> {
  // ...
}
```

Why it is bad: the comment only repeats the function name, parameter name, and return type.

```js
/**
 * Handles data.
 *
 * @param {object} data - The data.
 * @returns {object} The processed data.
 */
function handleData(data) {
  // ...
}
```

Why it is bad: `data`, `handle`, `processed`, and `object` are too vague to help a maintainer use the function correctly.

```ts
/**
 * A robust and seamless service for managing all user operations.
 */
class UserService {
  // ...
}
```

Why it is bad: it sounds like marketing copy and does not document any real behaviour, boundary, or constraint.

```ts
/**
 * Adds one to count.
 *
 * @param count - Count.
 * @returns Count plus one.
 */
function increment(count: number): number {
  return count + 1;
}
```

Why it is bad: the implementation is simpler than the comment. Delete the comment unless there is a non-obvious domain rule to explain.

## Quality Check

Before finalising JSDoc comments, check that:

- The comment says why the code exists, how to use it safely, or what a caller could get wrong.
- The first sentence is specific enough to stand on its own in generated docs.
- Every `@param`, `@returns`, and `@throws` description adds meaning beyond the name and type.
- TypeScript comments do not duplicate annotations without adding semantics.
- The comment does not promise behaviour the code does not actually implement.
- The wording is plain, direct, and human-readable.
- Obvious comments have been removed instead of polished.
