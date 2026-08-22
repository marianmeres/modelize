# Changelog

## 3.0.0 — Standard Schema, AJV unbundled

**Breaking.** The core no longer bundles a validator. Validation goes through the
[Standard Schema](https://standardschema.dev) interface — the common contract implemented
by Zod, Valibot, ArkType, yup, joi and many others — and JSON Schema support moves to a
`/ajv` subpath.

The core bundle drops from ~36 KB gzipped (AJV alone) to **~3 KB gzipped**, and contains
no `new Function` / `eval`, so `modelize` now works under a strict Content Security
Policy.

### Breaking changes

- **`options.schema` now takes a Standard Schema, not a JSON Schema.** Wrap JSON Schema
  documents with `ajvSchema()` from `@marianmeres/modelize/ajv`:

  ```diff
  + import { ajvSchema } from "@marianmeres/modelize/ajv";

    modelize(data, {
  -   schema: { type: "object", properties: { age: { type: "number", minimum: 0 } } },
  +   schema: ajvSchema({ type: "object", properties: { age: { type: "number", minimum: 0 } } }),
    });
  ```

  Passing a plain object throws a `TypeError` at the `modelize()` call, with these
  instructions in the message — the break is loud, not silent.

- **`options.ajv` removed.** Pass the instance to the adapter instead:

  ```diff
  - modelize(data, { ajv: myAjv, schema: mySchema });
  + modelize(data, { schema: ajvSchema(mySchema, myAjv) });
  ```

- **`ajv` is now an optional peer dependency** on npm, not a dependency. Install it
  explicitly if you use the `/ajv` subpath. On JSR it is pulled in only by that subpath.

- **`JSONSchema` moved** from the main entry point to `@marianmeres/modelize/ajv`. The
  core no longer has a JSON Schema concept.

- **Schemas compile eagerly.** `ajvSchema()` compiles when called, so a malformed schema
  throws at the definition site rather than on first validation.

### Added

- **`options.validate` may now return `ValidationError[]`** in addition to
  `true | string`, so custom validators can report field-level errors instead of one
  root-level message. An empty array means valid. This closes the long-standing gap where
  a custom validator could only produce a single error at `"/"`.

- **`isStandardSchema(x)`** type guard, exported from the main entry. Accepts callable
  schemas (ArkType) as well as objects, and guards against proxies that throw on property
  access.

- **`StandardSchemaV1`** and **`ModelizeIssue`** types, exported from the main entry. The
  spec interface is vendored (as the spec encourages), so there is no new dependency.

- **`ajvSchema(schema, ajv?)`** on the `@marianmeres/modelize/ajv` subpath.

### Hardening

- **Async detection duck-types `.then`** instead of `instanceof Promise`, so a thenable
  from another realm or a custom Promise implementation is rejected rather than silently
  treated as a successful result.
- **A custom validator returning an unsupported value now throws a clear `TypeError`**
  naming the mistake, instead of `result is not iterable`. Forgetting `return true` is the
  usual cause.
- **`__hydrate({ validate: true })` now validates a faithful candidate**: the pre-apply
  object preserves the target's prototype and property descriptors, so `instanceof` still
  holds and accessors recompute from the candidate state instead of being frozen at their
  pre-update values.
- **`__hydrate` rejects reserved property names**, matching the `set` trap. Previously,
  under `strict: false`, a reserved key could be written straight onto the source where
  the proxy would then permanently shadow it.
- **The sticky validation-failure cache no longer misses on falsy throws** (`throw null`).

### Behavior notes

- **Schemas validate; they do not transform.** Standard Schema returns a possibly
  transformed value and `modelize` discards it, so Zod `.default()`, `.transform()` and
  `z.coerce` are _checked_ but never written back to the model. A getter cannot mutate the
  model, and defaults adding keys would violate strict mode, so this is forced by the
  design rather than a compromise. Documented in the README and API reference, and locked
  down by tests.

- **Async schemas throw.** A `validate()` returning a `Promise` (e.g. a Zod `async`
  refinement) raises a `TypeError` naming the vendor, on first read of
  `__isValid`/`__errors`/`__validate()`. The spec explicitly sanctions sync-only consumers
  rejecting Promises. The thrown error is cached per state, so a repeated read does not
  restart and abandon the async work.

- **Error shape is unchanged for the AJV path.** `ajvSchema()` round-trips AJV's
  `instancePath` exactly (including RFC 6901 `~0`/`~1` escaping) and preserves `keyword`
  and `params`, so migrated code sees identical `ValidationError` values. Other Standard
  Schema libraries do not report a keyword; those fields are then omitted from the object
  entirely rather than set to `undefined`.

- **Issue paths are normalized.** Standard Schema allows path segments to be bare keys or
  `{ key }` objects, and permits an absent path; all three map correctly to a JSON
  Pointer, with symbol keys stringified.

### Documentation

- New README sections: _Choosing a Validator_ (including the CSP tradeoff), _Schemas
  Validate, They Don't Transform_, and a 2.x → 3.0 migration guide.
- Documented two long-standing behaviors that were never written down: the default AJV
  instance has no `ajv-formats`, so `format` keywords are **accepted and ignored**; and
  AJV throws `no schema with key or ref` for non-canonical `$schema` URIs.
- Guidance on `z.fromJSONSchema()` for JSON Schema holders who need a CSP-safe path,
  including the constraints it silently drops.

## 2.1.0 — Correctness & ergonomics pass

This release is a comprehensive bug-fix and polish pass. It is **behavior-compatible for
typical usage** (all 42 pre-existing tests still pass unchanged), but contains several
deliberate, correctness-driven behavior changes that may be observable in edge cases.
Those are flagged **"BC-note"** below.

### Bug fixes

- **`__hydrate` is now atomic under `strict: true`.** Previously, when `data` contained an
  unknown key, the method threw mid-iteration — leaving the model in a half-applied state
  with partial dirty tracking. Unknown keys are now rejected in a pre-check, and the call
  throws before any mutation occurs. **BC-note:** callers that relied on the
  partial-write-then-throw behavior (unlikely but possible) will see all-or-nothing
  semantics instead.

- **`__resetToInitial()` in `strict: false` mode now actually restores the initial
  shape.** Previously it only re-assigned initial keys but did not remove keys that had
  been added after creation, so the model did not return to its true initial state.
  **BC-note:** any extras added under `strict: false` are now deleted on reset. If you
  were depending on them being preserved, switch to strict mode or hold those fields
  elsewhere.

- **`delete model.prop` in non-strict mode now marks the property dirty.** Previously a
  delete emitted a subscriber notification but left `__dirty` and `__isDirty` unchanged,
  inconsistent with `set`. The key is now added to `__dirty` and `__isDirty` reports the
  deletion. **BC-note:** observable via `__isDirty`/`__dirty` after a delete. The behavior
  is now consistent with property assignment.

- **`ModelizeValidationError.errors` is declared `readonly`** at the type level. Runtime
  behavior is unchanged; this only tightens the TypeScript contract.

- **`__errors` is now consistent with the current state** without needing a prior
  `__isValid` read. Reading `__errors` lazily triggers validation (cached) exactly like
  `__isValid`, so stale errors can no longer leak between mutations and reads.
  **BC-note:** code that read `__errors` expecting `[]` until `__isValid` was accessed
  will now get live errors. For almost all callers this is what they wanted.

- **Deep clone now handles `Date`, `Map`, `Set`, `RegExp`, typed arrays, and cycles** by
  preferring the platform `structuredClone` (Deno, Node ≥ 17, all modern browsers). Falls
  back to a cycle-safe manual clone for payloads `structuredClone` rejects (e.g. objects
  containing functions). This fixes `__initial` / `__resetToInitial` silently losing
  `Date` and similar values, which previously degraded to `{}`. **BC-note:** objects
  containing functions are still stripped by the fallback clone; unchanged from before.

- **`__reset()` and `__resetToInitial()` now notify only when state actually changed.** A
  `__reset()` on an already-clean model, or a `__resetToInitial()` on a model already at
  its initial state, does not emit a subscriber notification. **BC-note:** Svelte code
  that re-rendered on every no-op reset will re-render less. Two old tests already covered
  the correct (changed) case and still pass; behavior on no-op resets is the one that
  tightened.

- **`__hydrate` notifies only when something actually changed.** An empty `__hydrate({})`,
  or one where every value matches the current value, no longer fires a subscriber
  notification. **BC-note:** same category as `__reset` — reduces spurious renders.

- **`'key' in model` is now consistent with `model.key`** for reserved names. Added a
  `has` trap that returns `true` for the reserved names that are accessible through `get`.
  Previously `"__dirty" in model` returned `false` while `model.__dirty` returned the Set.
  **BC-note:** code that used `"subscribe" in model` as a negative signal to detect "plain
  object" will need another signal; use `isModelized(model)` instead.

### New features

- **`isModelized(x)` type guard.** Returns `true` for proxies produced by `modelize()`.
  Uses a `Symbol.for` tag so it works across realms.

- **`subscribeKey(key, callback)`** — per-property subscription. Callback receives
  `(newValue, previousValue)` and fires only on actual change of the watched key. Unlike
  `subscribe`, it is not called at subscription time (there is no meaningful "previous
  value" yet). Works for direct sets, non-strict deletes, `__hydrate`, and
  `__resetToInitial`.

- **`__hydrate(data, { validate: true })`** — validates the candidate (post-merge) state
  against the schema and custom validator first, and throws `ModelizeValidationError`
  **without mutating** on failure. Enables safe "apply untrusted input" flows.

- **`ModelizeOptions.clone: boolean`** — when `true`, the source is deep-cloned before
  wrapping so mutations do not affect the caller's object. `__source` then refers to the
  internal clone.

- **`ModelizeOptions.ajv: Ajv`** — inject your own AJV instance (to register custom
  formats/keywords, or to isolate schema caches in long-lived servers).

- **`ValidationError.keyword` / `ValidationError.params`** — AJV's keyword and params are
  now forwarded into schema-validation errors (absent on custom-validator errors). Purely
  additive: existing readers that only used `path` / `message` are unaffected.

- **Validation is now cached.** `__isValid`, `__errors`, and `__validate()` share a single
  cached result that is invalidated on any mutation (set / delete / `__hydrate` /
  `__resetToInitial`). Repeated reads no longer re-run AJV. **BC-note:** custom validators
  with side effects (logging, counters, external I/O) will fire less often. Custom
  validators should be pure.

- **`subscribeKey` is a new reserved name** — cannot appear on source objects. If your
  source object has a `subscribeKey` property, creating the model now throws, matching the
  existing reserved-name contract. **BC-note:** this is the only strictly
  source-incompatible change. Users already protected via TypeScript rarely hit this in
  practice.

### Minor / internal

- `subscribe(cb)` now throws a clear `TypeError` if `cb` is not a function (previously it
  crashed deep inside the immediate call).
- Every per-key notifier is wrapped so one listener's throw cannot break another listener,
  matching `@marianmeres/pubsub` semantics.

### Summary of BC notes (quick reference)

| Area                                      | Before                      | After                            |
| ----------------------------------------- | --------------------------- | -------------------------------- |
| `__hydrate` strict + unknown key          | partial mutation then throw | atomic: throw first, no mutation |
| `__resetToInitial` + non-strict extras    | keys remained               | keys are removed                 |
| `delete` in non-strict                    | no dirty change             | marks key dirty                  |
| `__reset` / `__resetToInitial` no-op      | always notify               | no notify when unchanged         |
| `__hydrate` with no actual changes        | always notify               | no notify when unchanged         |
| `__errors` before `__isValid`             | stale / empty               | live (cached)                    |
| `"key" in model` (reserved names)         | `false`                     | `true`                           |
| Custom validator side effects             | ran on every read           | runs once per mutation           |
| `subscribeKey` reserved                   | usable as source key        | reserved (throws)                |
| `Date` / `Map` / `Set` / cyclic in source | stripped                    | preserved                        |

## 2.0.3 and earlier

See git history.
