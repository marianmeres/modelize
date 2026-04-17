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
- **Validation** - JSON Schema and/or custom validator functions
- **Field-level errors** - detailed validation error reports
- **Reset to initial** - restore original values
- **Svelte-compatible** - works with `$` auto-subscription
- **Lightweight** - minimal API, no magic

## Main API

### `modelize(source, options?)`

Wraps `source` object with a proxy.

```typescript
interface ModelizeOptions<T> {
	schema?: JSONSchema; // JSON Schema for validation
	validate?: (model: T) => true | string; // Custom validator
	strict?: boolean; // Disallow new properties (default: true)
	clone?: boolean; // Deep-clone source so the original is not mutated (default: false)
	ajv?: Ajv; // Inject a custom AJV instance (optional)
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

| Function         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `isModelized(x)` | Type guard — `true` if `x` was produced by `modelize()` |

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

### JSON Schema

```typescript
const user = modelize(
	{ age: 25 },
	{
		schema: {
			type: "object",
			properties: {
				age: { type: "number", minimum: 0, maximum: 120 },
			},
		},
	},
);

user.age = -5;
user.__isValid; // false
user.__errors; // [{ path: '/age', message: 'must be >= 0' }]

try {
	user.__validate();
} catch (e) {
	// ModelizeValidationError with e.errors array
}
```

### Custom Validator

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

### Combined Validation

Both JSON Schema and custom validator can be used together. All errors are collected.

```typescript
const user = modelize(
	{ age: -5, status: "invalid" },
	{
		schema: {
			type: "object",
			properties: { age: { minimum: 0 } },
		},
		validate: (m) =>
			["active", "inactive"].includes(m.status) ? true : "Invalid status",
	},
);

user.__errors; // Contains both schema and custom validation errors
```

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

## `isModelized()` Type Guard

```typescript
import { isModelized, modelize } from "@marianmeres/modelize";

isModelized(modelize({ a: 1 })); // true
isModelized({ a: 1 }); // false
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
	JSONSchema,
	Modelized,
	ModelizedMethods,
	ModelizeOptions,
	ValidationError,
} from "@marianmeres/modelize";

import { isModelized, modelize, ModelizeValidationError } from "@marianmeres/modelize";
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
  until the next mutation. Custom validators with side effects will therefore fire less
  often than in v2.0.x.
- **Deep clone prefers `structuredClone`**: `__initial` and `__resetToInitial()` handle
  `Date`, `Map`, `Set`, `RegExp`, typed arrays, and cyclic objects when the runtime
  provides `structuredClone` (Deno, Node ≥ 17, modern browsers). Objects containing
  functions fall back to the manual clone, which coerces those values away.
- **Custom validator receives the unwrapped source**, not the proxy, to avoid recursion
  through `__isValid`.

## Migration from 2.0.x to 2.1.0

2.1.0 is **behavior-compatible** for typical usage but introduces a few deliberate,
correctness-driven changes. See [CHANGELOG.md](./CHANGELOG.md) for the full list. Most
users will not need to change anything.

---

For complete API specification, see [API.md](./API.md).

## License

MIT
