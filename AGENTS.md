# Agent Context: @marianmeres/modelize

## Package Identity

- **Name**: `@marianmeres/modelize`
- **Version**: 3.0.0
- **License**: MIT
- **Registry**: JSR (primary), NPM (secondary)
- **Runtime**: Deno, Node.js, Browser

## Purpose

Lightweight proxy wrapper for JavaScript/TypeScript objects providing:

1. Dirty tracking (which properties changed)
2. Validation (any Standard Schema validator + custom validators) with lazy caching
3. Atomic bulk updates (`__hydrate`)
4. Svelte store compatibility (reactive `$` syntax) plus per-property subscriptions

## Architecture

```
src/
├── mod.ts              # Main entry ("."), re-exports modelize.ts + standard-schema.ts
├── modelize.ts         # Core implementation — NO validation dependency
├── standard-schema.ts  # Vendored Standard Schema V1 types, guard, pointer mapping
└── ajv.ts              # Entry ("./ajv") — the ONLY module importing `ajv`

tests/
└── modelize.test.ts    # Test suite (100 tests)
```

Two entry points, declared in `deno.json` `exports` and mirrored into `package.json` by
`scripts/build-npm.ts` via npmbuild's `entryPoints: ["mod", "ajv"]`.

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

- Two-stage: Standard Schema → Custom validator
- The core validates ONLY through the [Standard Schema](https://standardschema.dev)
  interface (`schema["~standard"].validate(candidate)`); it has no validator dependency
- JSON Schema is supported via `ajvSchema()` on the `./ajv` subpath, which adapts AJV into
  a Standard Schema. This is the only place `ajv` is imported.
- Lazy **and cached**: runs on first access to `__isValid`/`__errors`/`__validate()` after
  any mutation; reused until the next mutation. A _thrown_ error is cached the same way
  (`cachedFailure`) so async schemas don't restart work on every read.
- Custom validator receives the unwrapped source (never the proxy) and may return
  `true | string | ValidationError[]` (empty array = valid). Any other return value throws
  a `TypeError` naming the mistake (the common one is forgetting `return true`).
- Async detection duck-types `.then` rather than using `instanceof Promise`, so a thenable
  from another realm is still rejected instead of silently passing
- Errors accumulated from both sources into `__errors`, schema errors first
- **The transformed value is discarded.** Standard Schema returns `{ value }`; modelize
  reads only `.issues`. Zod `.default()`/`.transform()`/`z.coerce` are checked but never
  written back. A getter must not mutate, and defaults adding keys would break strict
  mode.
- **Async schemas throw** a `TypeError` (spec-sanctioned for sync-only consumers)
- `options.schema` is validated eagerly in `modelize()`; a plain JSON Schema throws a
  `TypeError` pointing at `ajvSchema()`
- `keyword`/`params` travel as extra fields on the issue (`ModelizeIssue`), so only the
  AJV adapter populates them; they are omitted (not `undefined`) otherwise

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
  schema?: StandardSchemaV1,           // Any Standard Schema validator
  validate?: (m: T) => true | string | ValidationError[],  // Custom (unwrapped source)
  strict?: boolean,                    // Default true: prevent new/deleted props
  clone?: boolean,                     // Default false: deep-clone source before wrapping
}
```

### Subpath `@marianmeres/modelize/ajv`

```typescript
ajvSchema<T = unknown>(schema: JSONSchema, ajv?: Ajv): StandardSchemaV1<T, T>
```

Compiles eagerly. Preserves AJV `keyword`/`params` and round-trips `instancePath` exactly
(RFC 6901 `~0`/`~1`), so migrated `ValidationError`s are byte-identical to 2.x.

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

| Export                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `isModelized(x)`        | Type guard — `true` if produced by `modelize()`      |
| `isStandardSchema(x)`   | Type guard — accepts objects AND functions (ArkType) |
| `ajvSchema(json, ajv?)` | From `./ajv` subpath — JSON Schema → Standard Schema |

### Error Types

```typescript
interface ValidationError {
	path: string; // JSON Pointer; "/" for root
	message: string;
	keyword?: string; // ajvSchema() only; key omitted otherwise
	params?: Record<string, unknown>; // ajvSchema() only; key omitted otherwise
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

- `@marianmeres/pubsub` - Change notification pub/sub (core)
- `ajv` - **optional peer dependency**, needed only for the `./ajv` subpath

### Development

- `@std/assert` - Deno test assertions
- `@marianmeres/npmbuild` - NPM build tooling
- `zod` - real-library Standard Schema interop tests only (never shipped)
- `@std/fs`, `@std/path` - used by npmbuild during `npm:build`

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

### AJV Instance (`./ajv` subpath only)

- Lazy-initialized module-level singleton (shared by default)
- Configured with `new Ajv({ allErrors: true })` — i.e. AJV **strict mode**. It THROWS on
  unknown keywords and, since no `ajv-formats` is registered, on any `format` keyword
  (`unknown format "email" ignored in schema at path ...` — a hard throw despite the
  wording). `strictTypes` warns when `minimum`/`maxLength`/etc. lack a sibling `type`.
  Escape hatches: `new Ajv({ allErrors: true, strict: false })`, or register
  `ajv-formats`. Covered by tests; documented in README/API.
- The default `Ajv` export is **draft-07 only**; pass `Ajv2020` from `ajv/dist/2020` for
  draft 2019-09 / 2020-12.
- AJV throws `no schema with key or ref` on non-canonical `$schema` URIs (e.g.
  `https://json-schema.org/draft-07/schema` — canonical is
  `http://json-schema.org/draft-07/schema#`)
- AJV compiles via `new Function`, so this subpath cannot run under a CSP without
  `unsafe-eval`. The core has zero codegen.
- Override by passing an instance as `ajvSchema(schema, ajv)`

### Validation Cache

- Result of `runValidation()` is cached on the modelize instance
- A thrown error is cached separately in `cachedFailure` and re-thrown on later reads
- Both invalidated on every set / delete / `__hydrate` / `__resetToInitial`
- `__isValid`, `__errors`, `__validate()` all share the same cache

## Type Exports

```typescript
import {
	isModelized,
	isStandardSchema,
	modelize,
	type Modelized,
	type ModelizedMethods,
	type ModelizeIssue,
	type ModelizeOptions,
	ModelizeValidationError,
	type StandardSchemaV1,
	type ValidationError,
} from "@marianmeres/modelize";

import { ajvSchema, type JSONSchema } from "@marianmeres/modelize/ajv";
```

## File Locations

| Purpose         | Path                     |
| --------------- | ------------------------ |
| Main entry      | `src/mod.ts`             |
| Core impl       | `src/modelize.ts`        |
| Standard Schema | `src/standard-schema.ts` |
| AJV subpath     | `src/ajv.ts`             |
| Tests           | `tests/modelize.test.ts` |
| Package config  | `deno.json`              |
| Build script    | `scripts/build-npm.ts`   |
| Human docs      | `README.md`, `API.md`    |

### Build gotcha

`scripts/build-npm.ts` installs `ajv` as a regular dependency so `tsc` can resolve its
types, then rewrites the emitted `package.json` to demote it to an optional peer.
Declaring it as an optional peer up front makes npm consider the install satisfied and
skip it, breaking compilation of `src/ajv.ts`.
