# Agent Context: @marianmeres/modelize

## Package Identity

- **Name**: `@marianmeres/modelize`
- **Version**: 2.1.0
- **License**: MIT
- **Registry**: JSR (primary), NPM (secondary)
- **Runtime**: Deno, Node.js, Browser

## Purpose

Lightweight proxy wrapper for JavaScript/TypeScript objects providing:

1. Dirty tracking (which properties changed)
2. Validation (JSON Schema via AJV + custom validators) with lazy caching
3. Atomic bulk updates (`__hydrate`)
4. Svelte store compatibility (reactive `$` syntax) plus per-property subscriptions

## Architecture

```
src/
├── mod.ts           # Entry point, re-exports modelize.ts
└── modelize.ts      # Single-file implementation

tests/
└── modelize.test.ts # Test suite (64 tests)
```

## Core Concepts

### Proxy Pattern

- Wraps any object with ES6 Proxy
- Intercepts get/set operations
- Maintains internal state: dirty set, initial snapshot, validation errors

### Dirty Tracking

- Uses `Set<keyof T>` to track modified properties
- Only tracks shallow/direct property changes
- Nested mutations NOT tracked: `model.nested.prop = x` does not mark dirty
- Reference changes ARE tracked: `model.nested = newObj` marks dirty
- Non-strict `delete` also marks the key dirty (v2.1.0+)

### Validation

- Two-stage: JSON Schema (AJV) → Custom validator
- Lazy **and cached**: runs on first access to `__isValid`/`__errors`/`__validate()` after
  any mutation; reused until the next mutation
- Custom validator receives the unwrapped source (never the proxy)
- Errors accumulated from both sources into `__errors`
- AJV `keyword` + `params` are forwarded into `ValidationError`
- Accept an injected `Ajv` instance via `options.ajv` for custom formats or isolated
  caches

### Atomic Bulk Updates (`__hydrate`)

- Under `strict: true`, unknown keys are rejected **before** any mutation
- `{ validate: true }` validates the candidate (post-merge) state first and throws
  `ModelizeValidationError` without mutating on failure
- Notifies once per call, and only when something actually changed
- Per-key `subscribeKey` listeners fire for each changed key within the batch

### Svelte Integration

- `subscribe(callback)` follows Svelte store contract
- Callback called immediately with current value
- Returns unsubscribe function
- Enables `$model` auto-subscription syntax
- `subscribeKey(key, cb)` complements it for single-property listeners (no immediate call;
  receives `(new, prev)`)

## Public API Summary

### Main Function

```typescript
modelize<T extends object>(source: T, options?: ModelizeOptions<T>): Modelized<T>
```

### Configuration (ModelizeOptions)

```typescript
{
  schema?: JSONSchema,                 // AJV JSON Schema
  validate?: (m: T) => true | string,  // Custom validator (receives unwrapped source)
  strict?: boolean,                    // Default true: prevent new/deleted props
  clone?: boolean,                     // Default false: deep-clone source before wrapping
  ajv?: Ajv,                           // Optional AJV instance override
}
```

### Modelized Object Properties (readonly)

| Property    | Type                | Description                             |
| ----------- | ------------------- | --------------------------------------- |
| `__dirty`   | `Set<keyof T>`      | Modified property keys                  |
| `__isDirty` | `boolean`           | `dirty.size > 0`                        |
| `__isValid` | `boolean`           | Validation result (triggers validation) |
| `__errors`  | `ValidationError[]` | Last validation errors                  |
| `__source`  | `T`                 | Original unwrapped object               |
| `__initial` | `T`                 | Deep clone at creation time             |

### Modelized Object Methods

| Method                   | Returns      | Description                                                                                       |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------- |
| `__validate()`           | `true`       | Throws `ModelizeValidationError` if invalid                                                       |
| `__reset()`              | `void`       | Clear dirty state, keep values. No-op notify when already clean.                                  |
| `__resetToInitial()`     | `void`       | Restore initial values, clear dirty. Also removes non-strict extras. No-op notify when unchanged. |
| `__hydrate(data, opts?)` | `void`       | Atomic bulk update; single notification. Opts: `{ resetDirty?, validate? }`                       |
| `subscribe(cb)`          | `() => void` | Svelte-compatible; immediate call with current value                                              |
| `subscribeKey(key, cb)`  | `() => void` | Per-property; `cb(new, prev)`; no immediate call                                                  |

### Top-level utilities

| Export           | Description                                     |
| ---------------- | ----------------------------------------------- |
| `isModelized(x)` | Type guard — `true` if produced by `modelize()` |

### Error Types

```typescript
interface ValidationError {
	path: string;
	message: string;
	keyword?: string; // AJV keyword (schema errors only)
	params?: Record<string, unknown>; // AJV params (schema errors only)
}
class ModelizeValidationError extends Error {
	readonly errors: ValidationError[];
}
```

## Reserved Property Names

Cannot be used in source objects:

```
__dirty, __isDirty, __isValid, __source, __initial, __errors,
__validate, __reset, __resetToInitial, __hydrate, subscribe, subscribeKey
```

The proxy's `has` trap returns `true` for these names too, so `"__dirty" in model` matches
`model.__dirty` being accessible.

## Dependencies

### Runtime

- `@marianmeres/pubsub` - Change notification pub/sub
- `ajv` - JSON Schema validation

### Development

- `@std/assert` - Deno test assertions
- `@marianmeres/npmbuild` - NPM build tooling

## Common Tasks

### Run Tests

```bash
deno task test
deno task test:watch
```

### Build NPM Package

```bash
deno task npm:build
# Output: .npm-dist/
```

### Publish

```bash
deno task publish     # Both JSR and NPM
deno task rp          # Patch version + publish
deno task rpm         # Minor version + publish
```

## Implementation Notes

### Strict Mode (default: true)

- Prevents adding new properties: `model.newProp = x` throws
- Prevents deleting properties: `delete model.prop` throws
- `__hydrate()` respects strict mode with **atomic** pre-check (no partial mutation)

### Non-strict Mode

- `delete model.prop` succeeds and marks `prop` as dirty
- `__resetToInitial()` removes any keys added post-creation

### Deep Clone for Initial State

- Prefers the platform `structuredClone` when available (handles `Date`, `Map`, `Set`,
  `RegExp`, typed arrays, cycles)
- Falls back to a cycle-safe manual clone for payloads that `structuredClone` rejects
  (e.g. objects containing functions)

### Subscriber Notifications

Triggered by:

- Property value change (if actually different)
- Property delete (non-strict mode)
- `__reset()` — only when dirty set was non-empty
- `__resetToInitial()` — only when state actually changed
- `__hydrate()` — single notification; only when something changed

### AJV Instance

- Lazy-initialized module-level singleton (shared by default)
- Configured with `allErrors: true`
- Schema validators are compiled and cached per modelize call
- Override with `options.ajv` to isolate caches or register custom formats

### Validation Cache

- Result of `runValidation()` is cached on the modelize instance
- Invalidated on every set / delete / `__hydrate` / `__resetToInitial`
- `__isValid`, `__errors`, `__validate()` all share the same cache

## Type Exports

```typescript
import {
	isModelized,
	type JSONSchema,
	modelize,
	type Modelized,
	type ModelizedMethods,
	type ModelizeOptions,
	ModelizeValidationError,
	type ValidationError,
} from "@marianmeres/modelize";
```

## File Locations

| Purpose        | Path                     |
| -------------- | ------------------------ |
| Entry point    | `src/mod.ts`             |
| Implementation | `src/modelize.ts`        |
| Tests          | `tests/modelize.test.ts` |
| Package config | `deno.json`              |
| Build script   | `scripts/build-npm.ts`   |
| Human docs     | `README.md`, `API.md`    |
