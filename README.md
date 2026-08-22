# @marianmeres/modelize

[![NPM version](https://img.shields.io/npm/v/@marianmeres/modelize.svg)](https://www.npmjs.com/package/@marianmeres/modelize)
[![JSR version](https://jsr.io/badges/@marianmeres/modelize)](https://jsr.io/@marianmeres/modelize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight utility that wraps any object with a proxy to track changes, validate, and
provide Svelte-compatible reactivity.

## Installation

```bash
deno add jsr:@marianmeres/modelize
```

```bash
npm install @marianmeres/modelize
```

The core ships **no validator**. Bring your own
[Standard Schema](https://standardschema.dev) library (Zod, Valibot, ArkType, …), or
install `ajv` alongside if you want to validate with plain JSON Schema documents:

```bash
npm install @marianmeres/modelize ajv
```

## Quick Example

```typescript
import { modelize } from "@marianmeres/modelize";

const user = modelize({ name: "John", age: 30 });

// Track changes
user.name = "Jane";
user.__isDirty; // true
user.__dirty; // Set { 'name' }

// Reset dirty state (keeps values)
user.__reset();
user.__isDirty; // false

// Reset to initial values
user.__resetToInitial();
user.name; // 'John'
```

## Features

- **Dirty tracking** - know which properties have changed
- **Validation** - any Standard Schema validator and/or custom validator functions
- **Field-level errors** - detailed validation error reports
- **Reset to initial** - restore original values
- **Svelte-compatible** - works with `$` auto-subscription
- **Lightweight** - ~3 KB gzipped, no bundled validator, no `eval`

## Main API

### `modelize(source, options?)`

Wraps `source` object with a proxy.

```typescript
interface ModelizeOptions<T> {
	schema?: StandardSchemaV1; // Any Standard Schema validator
	validate?: (model: T) => true | string | ValidationError[]; // Custom validator
	strict?: boolean; // Disallow new properties (default: true)
	clone?: boolean; // Deep-clone source so the original is not mutated (default: false)
}
```

### Properties (read-only)

| Property    | Type                | Description                                      |
| ----------- | ------------------- | ------------------------------------------------ |
| `__dirty`   | `Set<keyof T>`      | Set of modified property keys (empty when clean) |
| `__isDirty` | `boolean`           | `true` if any property has been modified         |
| `__isValid` | `boolean`           | `true` if model passes validation                |
| `__errors`  | `ValidationError[]` | Last validation errors (empty if valid)          |
| `__source`  | `T`                 | The original unwrapped source object             |
| `__initial` | `T`                 | Deep clone of original values (for reset)        |

### Methods

| Method                        | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `__validate()`                | Throws `ModelizeValidationError` if invalid, returns `true` if valid                         |
| `__reset()`                   | Clears dirty state (values unchanged)                                                        |
| `__resetToInitial()`          | Restores all properties to initial values and clears dirty state                             |
| `__hydrate(data, options?)`   | Atomic bulk update. Options: `{ resetDirty?: boolean; validate?: boolean }`                  |
| `subscribe(callback)`         | Svelte-compatible subscription. Returns unsubscribe function                                 |
| `subscribeKey(key, callback)` | Per-property subscription; `callback(newValue, previousValue)`. Returns unsubscribe function |

### Utility

| Function              | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `isModelized(x)`      | Type guard — `true` if `x` was produced by `modelize()`        |
| `isStandardSchema(x)` | Type guard — `true` if `x` implements Standard Schema V1       |
| `ajvSchema(json)`     | From `@marianmeres/modelize/ajv` — wraps a JSON Schema for use |

## Dirty Tracking

```typescript
const model = modelize({ name: "John", age: 30 });

model.name = "Jane";

model.__isDirty; // true
model.__dirty; // Set { 'name' }
model.__dirty.has("name"); // true
model.__dirty.has("age"); // false

// Clear dirty state (values stay changed)
model.__reset();
model.__isDirty; // false
model.name; // 'Jane' (still changed)

// Or reset to initial values
model.name = "Modified";
model.__resetToInitial();
model.name; // 'John' (original value)
model.__isDirty; // false
```

## Validation

`modelize` validates through the [Standard Schema](https://standardschema.dev) interface,
so it works with any library implementing it — Zod, Valibot, ArkType, yup, joi and
[many more](https://standardschema.dev) — without depending on any of them.

### Standard Schema

```typescript
import { z } from "zod";

const user = modelize({ age: 25 }, {
	schema: z.object({ age: z.number().min(0) }),
});

user.age = -5;
user.__isValid; // false
user.__errors; // [{ path: '/age', message: 'Too small: expected number to be >=0' }]

try {
	user.__validate();
} catch (e) {
	// ModelizeValidationError with e.errors array
}
```

### JSON Schema

Plain JSON Schema documents go through the AJV adapter on the `/ajv` subpath. This is the
only place `ajv` is imported, so it costs nothing unless you use it.

```typescript
import { modelize } from "@marianmeres/modelize";
import { ajvSchema } from "@marianmeres/modelize/ajv";

const user = modelize({ age: 25 }, {
	schema: ajvSchema({
		type: "object",
		properties: { age: { type: "number", minimum: 0 } },
	}),
});

user.age = -5;
user.__errors; // [{ path: '/age', message: 'must be >= 0', keyword: 'minimum', params: {...} }]
```

`ajvSchema(schema, ajv?)` accepts an optional AJV instance — use it to register custom
formats or keywords, or to isolate the compiled-schema cache:

```typescript
import { Ajv } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

modelize(data, { schema: ajvSchema(mySchema, ajv) });
```

### Custom Validator

Return `true` when valid, a string for a single root-level error, or an array of
`ValidationError` for field-level reporting:

```typescript
const form = modelize(
	{ password: "", confirmPassword: "" },
	{
		validate: (m) => m.password === m.confirmPassword ? true : "Passwords must match",
	},
);

form.password = "secret";
form.confirmPassword = "different";
form.__isValid; // false
form.__errors; // [{ path: '/', message: 'Passwords must match' }]
```

```typescript
const form = modelize({ email: "nope", age: -1 }, {
	validate: (m) => {
		const errors: ValidationError[] = [];
		if (!m.email.includes("@")) {
			errors.push({ path: "/email", message: "Invalid email" });
		}
		if (m.age < 0) errors.push({ path: "/age", message: "Must be >= 0" });
		return errors.length ? errors : true;
	},
});
```

An empty array means valid.

### Combined Validation

Both a schema and a custom validator can be used together. All errors are collected,
schema errors first.

```typescript
const user = modelize(
	{ age: -5, status: "invalid" },
	{
		schema: z.object({ age: z.number().min(0) }),
		validate: (m) =>
			["active", "inactive"].includes(m.status) ? true : "Invalid status",
	},
);

user.__errors; // Contains both schema and custom validation errors
```

## Choosing a Validator

Both paths satisfy the same `schema` option, so this is mostly about your input and your
runtime.

|                       | Standard Schema (Zod, Valibot, …) | `ajvSchema()` (JSON Schema)              |
| --------------------- | --------------------------------- | ---------------------------------------- |
| Schema is written as  | TypeScript code                   | Portable JSON data                       |
| Static type inference | Yes                               | No                                       |
| `keyword` / `params`  | Not reported                      | Reported                                 |
| Runs under strict CSP | Yes (no `eval`)                   | **No** — AJV compiles via `new Function` |
| Extra install         | Your schema library               | `ajv`                                    |

Pick JSON Schema when the schema must be data — stored in a file or database, sent over
the wire, shared with other languages, or used as a `$schema` reference for editor
autocomplete. Pick a Standard Schema library when the schema lives in your code and you
want the types derived from it.

**Content Security Policy:** AJV validates by generating JavaScript and calling
`new Function` on it, so `ajvSchema()` cannot run under a CSP without `unsafe-eval` (the
default in browser extensions and many hardened web apps). In that environment use a
Standard Schema validator instead — the core has no codegen at all.

If you hold a JSON Schema _and_ need to avoid `eval`, Zod can convert one for you. Note
that `z.fromJSONSchema()` is experimental and **silently drops** several constraints —
`uniqueItems`, `contains`/`minContains`/`maxContains`, `propertyNames`, draft-07
`dependencies`, `minProperties`/`maxProperties`, and `minItems`/`maxItems` without a
sibling `items` — converting without error and then not enforcing them. It also enforces
`format` (where AJV's default strict instance rejects the schema outright), treats `const`
with an object value as unsatisfiable, and resolves `$ref` based on the `$schema` string
rather than as a JSON pointer. Check your schema against that list before relying on it:

```typescript
import * as z from "zod";

// The throwaway registry is important: fromJSONSchema otherwise writes every
// unrecognized key of your schema into Zod's process-global registry.
const schema = z.fromJSONSchema(myJsonSchema, { registry: z.registry() });
modelize(data, { schema });
```

## Schemas Validate, They Don't Transform

Standard Schema's `validate()` returns a possibly transformed value. **`modelize` discards
it** — the schema is used purely as a validator, so the model always holds exactly what
you put in it.

This matters for Zod features that rewrite data:

```typescript
const model = modelize({ age: "42" }, { schema: z.object({ age: z.coerce.number() }) });

model.__isValid; // true  — the schema coerces "42" and accepts it
model.age; // "42" — still a string; the coerced number was discarded
```

```typescript
const model = modelize({ a: "y" }, {
	schema: z.object({ a: z.string(), b: z.string().default("x") }),
});

model.__isValid; // true — the schema fills in the default
model.b; // undefined — and under strict mode (the default) it can never be added
```

If you need the parsed output, parse before wrapping:

```typescript
const model = modelize(schema.parse(rawInput));
```

## Validation Is Synchronous

Validation runs inside the `__isValid` / `__errors` / `__validate()` accessors, which are
synchronous getters. A schema whose `validate()` returns a Promise — a Zod `async`
refinement, for example — throws a `TypeError` naming the vendor, on first read rather
than at `modelize()` time. Remove the async refinement, or validate outside `modelize`.

## Bulk Updates with `__hydrate`

`__hydrate` is atomic: if `strict: true` and `data` contains an unknown key, no mutation
happens. If `{ validate: true }` is set and the post-update state would be invalid, the
call throws `ModelizeValidationError` and nothing is applied. Subscribers are notified
once, and only if at least one value actually changed (or `resetDirty` cleared a non-empty
dirty set).

```typescript
const model = modelize({ name: "John", age: 30, city: "NYC" });

// Update multiple properties at once (single notification)
model.__hydrate({ name: "Jane", age: 25 });

// Hydrate and clear dirty state
model.__hydrate({ name: "Bob" }, { resetDirty: true });
model.__isDirty; // false

// Reject on validation failure (nothing is applied)
try {
	model.__hydrate(apiResponse, { validate: true });
} catch (e) {
	// e instanceof ModelizeValidationError, model state unchanged
}
```

## Per-property Subscriptions with `subscribeKey`

`subscribe` fires on every change. When you only care about one field:

```typescript
const model = modelize({ name: "John", age: 30 });

const off = model.subscribeKey("age", (next, prev) => {
	console.log(`age: ${prev} → ${next}`);
});

model.name = "Jane"; // nothing logged
model.age = 31; // logs "age: 30 → 31"

off();
```

Note: `subscribeKey` does **not** call back immediately (there is no "previous value" at
subscription time). If you need the initial value, read it directly.

## Type Guards

```typescript
import { isModelized, isStandardSchema, modelize } from "@marianmeres/modelize";

isModelized(modelize({ a: 1 })); // true
isModelized({ a: 1 }); // false

isStandardSchema(z.object({ a: z.string() })); // true
isStandardSchema({ type: "object" }); // false (plain JSON Schema)
```

## Strict Mode

By default, adding new properties is not allowed:

```typescript
const model = modelize({ name: "John" });
model.extra = "value"; // throws Error

// Allow dynamic properties
const flexible = modelize({ name: "John" }, { strict: false });
flexible.extra = "value"; // works
delete flexible.name; // works — and marks `name` as dirty
```

Under `strict: false`, `__resetToInitial()` also removes any keys that were added after
creation, fully restoring the initial shape.

## Non-mutating Wrapping

By default, `modelize` wraps the source object directly — mutations through the proxy
update the original object. Pass `{ clone: true }` to deep-clone the source up front:

```typescript
const apiResponse = { name: "John", age: 30 };
const model = modelize(apiResponse, { clone: true });

model.name = "Jane";
apiResponse.name; // "John" (unchanged)
model.__source === apiResponse; // false (internal clone)
```

## Types

```typescript
import type {
	Modelized,
	ModelizedMethods,
	ModelizeIssue,
	ModelizeOptions,
	StandardSchemaV1,
	ValidationError,
} from "@marianmeres/modelize";

import {
	isModelized,
	isStandardSchema,
	modelize,
	ModelizeValidationError,
} from "@marianmeres/modelize";

import { ajvSchema, type JSONSchema } from "@marianmeres/modelize/ajv";
```

## Why the `__` Prefix?

You'll notice that most methods and properties added by `modelize` use a double underscore
prefix (e.g., `__isDirty`, `__validate()`). This is intentional:

1. **Avoid collisions**: Your source object might have properties like `dirty`, `valid`,
   or `reset`. The `__` prefix ensures our meta-properties never conflict with your data.

2. **Clear distinction**: When reading code, `model.name` is obviously your data, while
   `model.__isDirty` is clearly a framework feature.

The only exception is `subscribe`, which has no prefix to maintain compatibility with the
Svelte store contract (allowing `$model` auto-subscription syntax).

## Notes

- **Shallow tracking**: Only direct property changes are tracked. Nested object mutations
  (e.g., `model.nested.prop = x`) don't trigger dirty state on the parent.
- **Reserved names**: Properties `__dirty`, `__isDirty`, `__isValid`, `__source`,
  `__initial`, `__errors`, `__validate`, `__reset`, `__resetToInitial`, `__hydrate`,
  `subscribe`, and `subscribeKey` are reserved and cannot be used in source objects.
- **Validation is lazy and cached**: Runs on first access after any mutation and the
  result is reused by subsequent reads of `__isValid`, `__errors`, and `__validate()`
  until the next mutation.
- **The default AJV instance is strict**: `ajvSchema()`'s built-in instance is
  `new Ajv({ allErrors: true })`, which runs AJV's strict mode. It **throws** on unknown
  keywords, and — because no `ajv-formats` is registered — on _any_ `format` keyword:
  `unknown format "email" ignored in schema at path "#/properties/e"`. Despite the word
  "ignored" in AJV's message, this is a hard throw at the `ajvSchema()` call. Strict mode
  also warns when a numeric/string keyword has no sibling `type` (`strictTypes`). Two ways
  out: register `ajv-formats` on your own instance to _enforce_ formats, or pass
  `new Ajv({ allErrors: true, strict: false })` to genuinely ignore them.
- **AJV rejects unknown `$schema` URIs**: AJV throws `no schema with key or ref` for a
  `$schema` value it doesn't recognize as a meta-schema, including near-miss spellings
  like `https://json-schema.org/draft-07/schema` (the canonical draft-07 URI is
  `http://json-schema.org/draft-07/schema#`). Either use a canonical URI or strip the key
  before calling `ajvSchema()`.
- **Deep clone prefers `structuredClone`**: `__initial` and `__resetToInitial()` handle
  `Date`, `Map`, `Set`, `RegExp`, typed arrays, and cyclic objects when the runtime
  provides `structuredClone` (Deno, Node ≥ 17, modern browsers). Objects containing
  functions fall back to the manual clone, which coerces those values away.
- **Custom validator receives the unwrapped source**, not the proxy, to avoid recursion
  through `__isValid`.

## Migration from 2.x to 3.0

3.0 removes the bundled AJV dependency from the core. Validation now goes through the
Standard Schema interface, and JSON Schema support moved to the `/ajv` subpath.

**If you pass a JSON Schema**, wrap it with `ajvSchema()`:

```diff
+ import { ajvSchema } from "@marianmeres/modelize/ajv";

  modelize(data, {
-   schema: { type: "object", properties: { age: { type: "number", minimum: 0 } } },
+   schema: ajvSchema({ type: "object", properties: { age: { type: "number", minimum: 0 } } }),
  });
```

**If you injected an AJV instance** via `options.ajv`, pass it to `ajvSchema()` instead:

```diff
- modelize(data, { ajv: myAjv, schema: mySchema });
+ modelize(data, { schema: ajvSchema(mySchema, myAjv) });
```

**On npm**, `ajv` is now an optional peer dependency — install it explicitly if you use
the `/ajv` subpath.

Passing a plain JSON Schema object to `schema` now throws a `TypeError` at the
`modelize()` call with these instructions, so the break is loud rather than silent.
Everything else — dirty tracking, subscriptions, `__hydrate`, strict mode, error shapes
from `ajvSchema()` (including `keyword` and `params`) — is unchanged. See
[CHANGELOG.md](./CHANGELOG.md) for the full list.

---

For complete API specification, see [API.md](./API.md).

## License

MIT
