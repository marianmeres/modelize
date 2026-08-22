# API Reference

Complete API documentation for `@marianmeres/modelize`.

## Table of Contents

- [modelize()](#function-modelize)
- [isModelized()](#function-ismodelized)
- [isStandardSchema()](#function-isstandardschema)
- [ModelizeOptions](#interface-modelizeoptions)
- [Modelized](#type-modelized)
- [ModelizedMethods](#interface-modelizedmethods)
- [ValidationError](#interface-validationerror)
- [ModelizeValidationError](#class-modelizevalidationerror)
- [StandardSchemaV1](#interface-standardschemav1)
- [ModelizeIssue](#interface-modelizeissue)
- [Subpath: `@marianmeres/modelize/ajv`](#subpath-marianmeresmodelizeajv)
  - [ajvSchema()](#function-ajvschema)
  - [JSONSchema](#type-jsonschema)
- [Reserved Property Names](#reserved-property-names)

---

## Function: `modelize`

```typescript
function modelize<T extends object>(
	source: T,
	options?: ModelizeOptions<T>,
): Modelized<T>;
```

Wraps a source object with a Proxy that provides dirty tracking, validation, and
Svelte-compatible reactivity.

### Type Parameters

| Parameter | Constraint       | Description                                 |
| --------- | ---------------- | ------------------------------------------- |
| `T`       | `extends object` | The type of the source object being wrapped |

### Parameters

| Parameter | Type                 | Required | Description                                                                                                   |
| --------- | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `source`  | `T`                  | Yes      | The object to wrap. Can be a plain object or class instance. Must not contain properties with reserved names. |
| `options` | `ModelizeOptions<T>` | No       | Configuration for validation and strict mode                                                                  |

### Returns

`Modelized<T>` - A Proxy combining the original object type `T` with
`ModelizedMethods<T>`.

### Throws

- `Error` - If source contains reserved property names (`__dirty`, `__isValid`, etc.)
- `Error` - If strict mode is enabled and attempting to add/delete properties
- `TypeError` - If `options.schema` is not a Standard Schema. Checked eagerly at the
  `modelize()` call, with a message pointing at `ajvSchema()` for plain JSON Schema
  documents.

### Examples

**Basic usage:**

```typescript
const user = modelize({ name: "John", age: 30 });

user.name = "Jane";
console.log(user.__isDirty); // true
console.log(user.__dirty); // Set { "name" }

user.__reset();
console.log(user.__isDirty); // false
```

**With Standard Schema validation:**

```typescript
import { z } from "zod";

const user = modelize(
	{ name: "", age: 0 },
	{
		schema: z.object({
			name: z.string().min(1),
			age: z.number().min(0).max(150),
		}),
	},
);

user.age = -5;
console.log(user.__isValid); // false
console.log(user.__errors); // [{ path: "/age", message: "Too small: ..." }, ...]
```

**With JSON Schema validation:**

```typescript
import { ajvSchema } from "@marianmeres/modelize/ajv";

const user = modelize(
	{ name: "", age: 0 },
	{
		schema: ajvSchema({
			type: "object",
			properties: {
				name: { type: "string", minLength: 1 },
				age: { type: "number", minimum: 0, maximum: 150 },
			},
			required: ["name"],
		}),
	},
);

user.age = -5;
console.log(user.__isValid); // false
console.log(user.__errors); // [{ path: "/age", message: "must be >= 0", keyword: "minimum", ... }]
```

**With custom validator:**

```typescript
const form = modelize(
	{ password: "", confirmPassword: "" },
	{
		validate: (m) => m.password === m.confirmPassword ? true : "Passwords must match",
	},
);
```

**Svelte integration:**

```svelte
<script>
  import { modelize } from "@marianmeres/modelize";
  const user = modelize({ name: "John" });
</script>

<input bind:value={$user.name} />
{#if $user.__isDirty}
  <button on:click={() => $user.__resetToInitial()}>Cancel</button>
{/if}
```

---

## Function: `isModelized`

```typescript
function isModelized<T extends object = Record<string, unknown>>(
	x: unknown,
): x is Modelized<T>;
```

Type guard that returns `true` if `x` was produced by `modelize()`.

### Example

```typescript
import { isModelized, modelize } from "@marianmeres/modelize";

isModelized(modelize({ a: 1 })); // true
isModelized({ a: 1 }); // false
isModelized(null); // false
```

---

## Function: `isStandardSchema`

```typescript
function isStandardSchema(x: unknown): x is StandardSchemaV1;
```

Type guard that returns `true` if `x` implements the
[Standard Schema V1](https://standardschema.dev) interface — that is, it exposes a
`~standard` property whose `version` is `1` and whose `validate` is a function.

Accepts both objects and **functions**, because some libraries (notably ArkType) expose
callable schemas. Property access is guarded, so exotic proxies that throw on `get` return
`false` rather than propagating.

This is the same check `modelize()` performs on `options.schema`.

### Example

```typescript
import { isStandardSchema } from "@marianmeres/modelize";
import { z } from "zod";

isStandardSchema(z.object({ a: z.string() })); // true
isStandardSchema(type({ a: "string" })); // true (ArkType — callable)
isStandardSchema({ type: "object" }); // false (plain JSON Schema)
isStandardSchema(null); // false
```

---

## Interface: `ModelizeOptions`

```typescript
interface ModelizeOptions<T extends object> {
	schema?: StandardSchemaV1;
	validate?: (model: T) => true | string | ValidationError[];
	strict?: boolean;
	clone?: boolean;
}
```

Configuration options for the `modelize` function.

### Type Parameters

| Parameter | Description                                   |
| --------- | --------------------------------------------- |
| `T`       | The type of the source object being modelized |

### Properties

| Property   | Type                                                | Default | Description                                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`   | `StandardSchemaV1`                                  | -       | Optional [Standard Schema](https://standardschema.dev) validator. When provided, the model is validated against it whenever `__isValid`, `__errors`, or `__validate()` is accessed. Wrap plain JSON Schema with `ajvSchema()`.                         |
| `validate` | `(model: T) => true \| string \| ValidationError[]` | -       | Optional custom validator. Called after schema validation (if any) and receives the **unwrapped** source object. Return `true` if valid, an error-message string for a root-level error, or an array of `ValidationError`. An empty array means valid. |
| `strict`   | `boolean`                                           | `true`  | When `true`, prevents adding/deleting properties. Set to `false` to allow dynamic properties.                                                                                                                                                          |
| `clone`    | `boolean`                                           | `false` | When `true`, deep-clones the source before wrapping so the caller's original object is not mutated. `__source` refers to the internal clone.                                                                                                           |

### Notes on `schema`

- **Validator only.** Standard Schema's `validate()` returns a possibly transformed value;
  `modelize` discards it. Transforms, coercions and defaults are checked but never written
  back to the model. See [Schemas Do Not Transform](#schemas-do-not-transform).
- **Synchronous only.** A schema returning a `Promise` throws a `TypeError`. See
  [Synchronous Validation Only](#synchronous-validation-only).
- **Validated eagerly.** A non-Standard-Schema value throws a `TypeError` at the
  `modelize()` call rather than on first validation.

### Example

```typescript
const options: ModelizeOptions<User> = {
	schema: z.object({ age: z.number().min(0) }),
	validate: (m) => m.age >= 18 ? true : "Must be an adult",
	strict: true,
	clone: false,
};
```

---

## Type: `Modelized`

```typescript
type Modelized<T extends object> = T & ModelizedMethods<T>;
```

A modelized object that combines the original source type `T` with the `ModelizedMethods`
interface. This is the return type of the `modelize()` function.

### Type Parameters

| Parameter | Description                   |
| --------- | ----------------------------- |
| `T`       | The type of the source object |

### Example

```typescript
interface User {
	name: string;
	age: number;
}

const user: Modelized<User> = modelize({ name: "John", age: 30 });
user.name; // string (from User)
user.__isDirty; // boolean (from ModelizedMethods)
```

---

## Interface: `ModelizedMethods`

```typescript
interface ModelizedMethods<T extends object> {
	readonly __dirty: Set<keyof T>;
	readonly __isDirty: boolean;
	readonly __isValid: boolean;
	readonly __errors: ValidationError[];
	readonly __source: T;
	readonly __initial: T;
	__validate(): true;
	__reset(): void;
	__resetToInitial(): void;
	__hydrate(
		data: Partial<T>,
		options?: { resetDirty?: boolean; validate?: boolean },
	): void;
	subscribe(callback: (model: Modelized<T>) => void): () => void;
	subscribeKey<K extends keyof T>(
		key: K,
		callback: (value: T[K], previous: T[K]) => void,
	): () => void;
}
```

Methods and properties added to a modelized object. These use the `__` prefix convention
to avoid collision with user-defined properties.

### Read-only Properties

| Property    | Type                | Description                                                                                                                                                                                                                                                                       |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__dirty`   | `Set<keyof T>`      | Set of property keys that have been modified since creation or last reset. Always returns a Set (empty when clean, never null).                                                                                                                                                   |
| `__isDirty` | `boolean`           | Convenience boolean indicating whether any property has been modified. Equivalent to `__dirty.size > 0`.                                                                                                                                                                          |
| `__isValid` | `boolean`           | Returns `true` if the model passes all validation rules. Validation is lazy and cached — it runs on first access after any mutation, and subsequent reads of `__isValid`/`__errors`/`__validate()` reuse the cached result until the next mutation.                               |
| `__errors`  | `ValidationError[]` | Array of validation errors. Triggers (lazy, cached) validation so it is always consistent with `__isValid`.                                                                                                                                                                       |
| `__source`  | `T`                 | Reference to the unwrapped source. When `clone: true` was passed, this is the internal clone rather than the caller's object.                                                                                                                                                     |
| `__initial` | `T`                 | Deep clone of the source values at creation time. Used by `__resetToInitial()`. Uses the platform `structuredClone` when available (so `Date`, `Map`, `Set`, `RegExp`, typed arrays, and cycles are supported), falling back to a manual clone for payloads containing functions. |

### Methods

#### `__validate()`

```typescript
__validate(): true
```

Validates the model and throws `ModelizeValidationError` if invalid. Use this when you
want validation to halt execution on failure.

**Returns:** `true` if validation passes

**Throws:** `ModelizeValidationError` if validation fails, with `errors` array containing
details

**Example:**

```typescript
try {
	model.__validate();
	await saveToDatabase(model);
} catch (e) {
	if (e instanceof ModelizeValidationError) {
		showErrors(e.errors);
	}
}
```

#### `__reset()`

```typescript
__reset(): void
```

Clears the dirty state, marking all properties as "clean". Does NOT change any property
values. Triggers a subscriber notification **only if the dirty set was non-empty**.

Use this after successfully saving the model to indicate there are no longer unsaved
changes.

**Example:**

```typescript
await saveToDatabase(model);
model.__reset(); // Clear dirty flags after save
```

#### `__resetToInitial()`

```typescript
__resetToInitial(): void
```

Restores all properties to their initial values (from creation time) and clears the dirty
state. Under `strict: false`, any properties that were added after creation are removed.
Triggers a subscriber notification **only if the state actually changed**.

Use this to implement "cancel" or "revert changes" functionality.

**Example:**

```typescript
// User clicks "Cancel" button
model.__resetToInitial();
```

#### `__hydrate()`

```typescript
__hydrate(
  data: Partial<T>,
  options?: { resetDirty?: boolean; validate?: boolean },
): void
```

Atomic bulk update with a single subscriber notification.

- **Strict atomicity**: under `strict: true`, unknown keys in `data` are rejected
  **before** any mutation is applied.
- **Validated atomicity**: when `{ validate: true }` is set, the schema/custom validator
  is run against the candidate (post-merge) state. If invalid, the call throws
  `ModelizeValidationError` and nothing is mutated.
- **Notification gating**: subscribers are notified only if at least one value actually
  changed, or if `resetDirty` cleared a non-empty dirty set.

**Parameters:**

| Parameter            | Type         | Description                                                                                                   |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `data`               | `Partial<T>` | Object with properties to update                                                                              |
| `options.resetDirty` | `boolean`    | If `true`, clears dirty state after hydration                                                                 |
| `options.validate`   | `boolean`    | If `true`, validate the candidate state first and throw `ModelizeValidationError` without mutating on failure |

**Throws:**

- `Error` — if `strict` mode is enabled and `data` contains unknown properties
- `ModelizeValidationError` — if `{ validate: true }` and the candidate state is invalid

**Example:**

```typescript
// Update from API response, clear dirty
model.__hydrate(apiResponse, { resetDirty: true });

// Batch update without clearing dirty
model.__hydrate({ name: "Jane", age: 25 });

// Validate-before-apply (atomic): on failure the model is untouched
try {
	model.__hydrate(untrustedInput, { validate: true });
} catch (e) {
	if (e instanceof ModelizeValidationError) showErrors(e.errors);
}
```

#### `subscribe()`

```typescript
subscribe(callback: (model: Modelized<T>) => void): () => void
```

Subscribes to model changes. Follows the Svelte store contract:

- Callback is called immediately with the current value
- Callback is called on every subsequent change
- Returns an unsubscribe function

This method has no `__` prefix to maintain Svelte compatibility, allowing use of the
`$model` auto-subscription syntax.

**Parameters:**

| Parameter  | Type                            | Description                                   |
| ---------- | ------------------------------- | --------------------------------------------- |
| `callback` | `(model: Modelized<T>) => void` | Function called with the model on each change |

**Returns:** `() => void` - Unsubscribe function to stop receiving updates

**Example:**

```typescript
const unsubscribe = model.subscribe((m) => {
	console.log("Model changed:", m.name);
});

// Later, to stop listening:
unsubscribe();
```

#### `subscribeKey()`

```typescript
subscribeKey<K extends keyof T>(
  key: K,
  callback: (value: T[K], previous: T[K]) => void,
): () => void
```

Subscribes to changes of a specific property. The callback fires only when the given key's
value changes (by `===` identity) and receives `(newValue, previousValue)`.

Unlike `subscribe`, `subscribeKey` does **not** call back immediately at subscription time
(there is no "previous value" yet).

**Parameters:**

| Parameter  | Type                        | Description                       |
| ---------- | --------------------------- | --------------------------------- |
| `key`      | `keyof T`                   | Property key to watch             |
| `callback` | `(value, previous) => void` | Called on every change to the key |

**Returns:** `() => void` — unsubscribe function

**Example:**

```typescript
const off = model.subscribeKey("age", (next, prev) => {
	console.log(`age: ${prev} → ${next}`);
});
```

---

## Interface: `ValidationError`

```typescript
interface ValidationError {
	path: string;
	message: string;
	keyword?: string;
	params?: Record<string, unknown>;
}
```

Represents a single validation error with its location and message.

### Properties

| Property  | Type                                 | Description                                                                                                                                                                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | `string`                             | JSON Pointer path to the invalid property. Root-level errors use "/". Examples: `/name`, `/address/city`, `/`                                                                                                             |
| `message` | `string`                             | Human-readable description of the validation failure                                                                                                                                                                      |
| `keyword` | `string` (optional)                  | Schema keyword that failed (e.g. `"minimum"`, `"required"`, `"type"`). Populated by `ajvSchema()` only — other Standard Schema libraries don't report one. Absent for custom-validator errors unless you set it yourself. |
| `params`  | `Record<string, unknown>` (optional) | Structured details (e.g. `{ limit: 0, comparison: ">=" }`). Populated by `ajvSchema()` only; see `keyword`.                                                                                                               |

When absent, these keys are omitted from the object entirely rather than set to
`undefined`, so `"keyword" in error` is a reliable check.

### Path Format

`path` is a [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901). Standard Schema
reports issue paths as arrays whose segments are either bare keys or `{ key }` objects;
`modelize` normalizes both into a pointer string, escaping `~` as `~0` and `/` as `~1`. An
issue with no path maps to `"/"`.

```typescript
// Standard Schema issue        ->  ValidationError.path
{
	path: ["address", "city"];
} //  "/address/city"
{
	path: [{ key: "items" }, 0];
} //  "/items/0"
{
	path: ["a/b"];
} //  "/a~1b"
{/* no path */} //  "/"
```

### Example

```typescript
const error: ValidationError = {
	path: "/age",
	message: "must be >= 0",
	keyword: "minimum",
	params: { comparison: ">=", limit: 0 },
};
```

---

## Class: `ModelizeValidationError`

```typescript
class ModelizeValidationError extends Error {
	constructor(message: string, errors?: ValidationError[]);
	readonly errors: ValidationError[];
	name: string; // "ModelizeValidationError"
}
```

Error thrown when model validation fails. Extends the standard `Error` class with an array
of all validation errors for detailed error reporting.

### Constructor Parameters

| Parameter | Type                | Description                                                      |
| --------- | ------------------- | ---------------------------------------------------------------- |
| `message` | `string`            | The error message                                                |
| `errors`  | `ValidationError[]` | Array of field-level validation errors (defaults to empty array) |

### Properties

| Property  | Type                | Description                            |
| --------- | ------------------- | -------------------------------------- |
| `errors`  | `ValidationError[]` | Array of field-level validation errors |
| `name`    | `string`            | Always `"ModelizeValidationError"`     |
| `message` | `string`            | Inherited from Error                   |

### Example

```typescript
try {
	model.__validate();
} catch (e) {
	if (e instanceof ModelizeValidationError) {
		console.log(e.message); // "Validation failed"
		console.log(e.errors); // Array of ValidationError
	}
}
```

---

## Interface: `StandardSchemaV1`

```typescript
interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
```

The [Standard Schema V1](https://standardschema.dev) interface, vendored into this
package. The spec encourages copying the types rather than depending on
`@standard-schema/spec`, so `modelize` has no type or runtime dependency while still
interoperating with every library implementing the standard.

The `StandardSchemaV1` namespace also exports `Props`, `Options`, `Result`,
`SuccessResult`, `FailureResult`, `Issue`, `PathSegment`, `Types`, `InferInput` and
`InferOutput`, matching the published spec.

You rarely need this type directly — pass your schema library's value to `options.schema`
and it will structurally match.

### Example — implementing it yourself

```typescript
import type { StandardSchemaV1 } from "@marianmeres/modelize";

const positive: StandardSchemaV1 = {
	"~standard": {
		version: 1,
		vendor: "my-app",
		validate(value) {
			const v = value as { age: number };
			return v.age >= 0
				? { value: v }
				: { issues: [{ message: "must be >= 0", path: ["age"] }] };
		},
	},
};

modelize({ age: 5 }, { schema: positive });
```

---

## Interface: `ModelizeIssue`

```typescript
interface ModelizeIssue extends StandardSchemaV1.Issue {
	readonly keyword?: string;
	readonly params?: Record<string, unknown>;
}
```

A Standard Schema issue optionally carrying the extra diagnostic fields `modelize`
surfaces on `ValidationError`.

The spec defines only `message` and `path`; additional properties are structurally
permitted and ignored by consumers that don't know about them. `ajvSchema()` uses this to
preserve AJV's `keyword` and `params` without stepping outside the standard, and any
custom Standard Schema implementation can do the same.

---

## Subpath: `@marianmeres/modelize/ajv`

JSON Schema support, backed by [AJV](https://ajv.js.org). This is the only module that
imports `ajv`, which is declared as an **optional peer dependency** — install it
explicitly if you use this subpath.

```typescript
import { ajvSchema, type JSONSchema } from "@marianmeres/modelize/ajv";
```

> **Content Security Policy:** AJV compiles schemas into JavaScript with `new Function`,
> so this subpath cannot run under a CSP without `unsafe-eval`. The core has no codegen —
> use a non-`eval` Standard Schema validator in that environment.

### Function: `ajvSchema`

```typescript
function ajvSchema<T = unknown>(
	schema: JSONSchema,
	ajv?: Ajv,
): StandardSchemaV1<T, T>;
```

Wraps a JSON Schema document into a Standard Schema validator suitable for
`options.schema`.

The schema is compiled **eagerly**, so an invalid schema throws here — at the definition
site — rather than later from a property read.

Validation errors preserve AJV's `keyword` and `params`, and AJV's `instancePath` is
round-tripped exactly (including RFC 6901 escaping), so `ValidationError.path` is
identical to what modelize 2.x produced.

#### Parameters

| Parameter | Type         | Required | Description                                                                                                                                                                                                 |
| --------- | ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`  | `JSONSchema` | Yes      | The JSON Schema document to compile                                                                                                                                                                         |
| `ajv`     | `Ajv`        | No       | AJV instance to compile with. When omitted, a lazily created module-level singleton configured as `new Ajv({ allErrors: true })` is used. Inject your own for custom formats/keywords or an isolated cache. |

#### Returns

`StandardSchemaV1<T, T>` — with `vendor: "ajv"`. The type parameter is documentary only;
the model's type comes from the source object.

#### Throws

- `Error` — if AJV cannot compile the schema.

#### Examples

```typescript
const user = modelize({ age: 25 }, {
	schema: ajvSchema({
		type: "object",
		properties: { age: { type: "number", minimum: 0 } },
	}),
});
```

**Custom formats** — the default instance runs AJV's strict mode with no `ajv-formats`, so
_any_ `format` keyword makes `ajvSchema()` **throw**
(`unknown format "email" ignored in schema at path "..."` — a hard error despite the
wording). Register formats on your own instance to enforce them:

```typescript
import { Ajv } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

modelize(data, { schema: ajvSchema(mySchema, ajv) });
```

### Type: `JSONSchema`

```typescript
type JSONSchema = Record<string, unknown>;
```

A JSON Schema document, as understood by AJV.

The default `Ajv` export supports **draft-07 only**. For draft 2019-09 or 2020-12,
construct the matching class yourself and pass it in:

```typescript
import Ajv2020 from "ajv/dist/2020";

modelize(data, { schema: ajvSchema(mySchema, new Ajv2020({ allErrors: true })) });
```

```typescript
const schema: JSONSchema = {
	type: "object",
	properties: {
		name: { type: "string", minLength: 1 },
		age: { type: "number", minimum: 0 },
	},
	required: ["name"],
};
```

> **Note:** AJV throws `no schema with key or ref` for a `$schema` value it doesn't
> recognize as a meta-schema. That covers both near-miss spellings of a supported draft —
> e.g. `https://json-schema.org/draft-07/schema`, where the canonical URI is
> `http://json-schema.org/draft-07/schema#` — and genuinely newer drafts that the default
> `Ajv` class doesn't implement. Use a canonical URI, pass the matching `Ajv` class, or
> strip the key before calling `ajvSchema()`.

### AJV Strict Mode

The default instance runs AJV's strict mode. It **throws** on unknown keywords and on any
`format` keyword (no `ajv-formats` is registered), and warns via `strictTypes` when a
numeric or string keyword has no sibling `type`:

```typescript
ajvSchema({ type: "object", notAKeyword: 1 });
// Error: strict mode: unknown keyword: "notAKeyword"

ajvSchema({ type: "object", properties: { e: { type: "string", format: "email" } } });
// Error: unknown format "email" ignored in schema at path "#/properties/e"

ajvSchema({ type: "object", properties: { age: { minimum: 0 } } });
// warns: strict mode: missing type "number" for keyword "minimum" (strictTypes)
```

Pass `new Ajv({ allErrors: true, strict: false })` to relax all of it, or register
`ajv-formats` to make `format` enforced rather than fatal.

---

## Reserved Property Names

The following property names are reserved and cannot be used in source objects passed to
`modelize()`:

| Name               | Purpose                               |
| ------------------ | ------------------------------------- |
| `__dirty`          | Set of modified property keys         |
| `__isDirty`        | Boolean dirty state indicator         |
| `__isValid`        | Boolean validation result             |
| `__source`         | Reference to original object          |
| `__initial`        | Deep clone of initial values          |
| `__errors`         | Array of validation errors            |
| `__validate`       | Validation method                     |
| `__reset`          | Reset dirty state method              |
| `__resetToInitial` | Reset to initial values method        |
| `__hydrate`        | Bulk update method                    |
| `subscribe`        | Svelte-compatible subscription method |
| `subscribeKey`     | Per-property subscription method      |

Attempting to use these names will throw an error:

```typescript
// Throws: Property "__dirty" is reserved and cannot be used in modelized objects
const model = modelize({ __dirty: "value" });

// Throws: Cannot set reserved property "__dirty"
model.__dirty = new Set();
```

---

## Behavior Notes

### Shallow Tracking

Only direct property changes are tracked. Nested object mutations do not trigger dirty
state on the parent:

```typescript
const model = modelize({ user: { name: "John" } });
model.user.name = "Jane"; // Does NOT mark model as dirty
model.user = { name: "Jane" }; // DOES mark model as dirty
```

### Lazy, Cached Validation

Validation runs on first access to `__isValid`, `__errors`, or `__validate()` after any
data mutation (set / delete / `__hydrate` / `__resetToInitial`). The result is cached and
reused for subsequent reads until the next mutation:

```typescript
const model = modelize({ age: -5 }, { schema: z.object({ age: z.number().min(0) }) });

model.__isValid; // runs validation
model.__errors; // uses cached result (no re-run)
model.__validate(); // uses cached result

model.age = 10; // mutation invalidates the cache
model.__isValid; // re-runs validation
```

A validator that _throws_ (rather than reporting issues) has its error cached the same
way, so repeated reads don't re-run it. The cache clears on the next mutation.

### Schemas Do Not Transform

Standard Schema's `validate()` returns a possibly transformed value. `modelize` reads only
`issues` and **discards the value**, so the model always holds exactly what you put in it.

```typescript
const model = modelize({ age: "42" }, { schema: z.object({ age: z.coerce.number() }) });

model.__isValid; // true  — the schema coerces "42" and accepts it
model.age; // "42" — still a string
```

```typescript
const model = modelize({ a: "y" }, {
	schema: z.object({ a: z.string(), b: z.string().default("x") }),
});

model.__isValid; // true — the schema fills in the default
model.b; // undefined — and under strict mode it can never be added
```

This is a deliberate constraint of the design, not an oversight: validation is triggered
by reading `__isValid` / `__errors`, and a getter must not mutate the model. Defaults
adding keys would also violate strict mode. If you need the parsed output, parse before
wrapping: `modelize(schema.parse(rawInput))`.

### Synchronous Validation Only

`validate()` may return a `Promise` under the spec, but `modelize` runs validation inside
the synchronous `__isValid` / `__errors` / `__validate()` accessors. A schema that
validates asynchronously (e.g. a Zod `async` refinement) throws a `TypeError` naming the
vendor:

```typescript
const model = modelize({ a: "x" }, {
	schema: z.object({ a: z.string().refine(async () => true) }),
});

model.__isValid; // throws TypeError: modelize: schema validation must be synchronous...
```

Note that this surfaces on first _read_, not at the `modelize()` call, since whether a
schema validates asynchronously can depend on the data. The spec explicitly sanctions
sync-only consumers rejecting Promises this way.

### Subscriber Notifications

Subscribers are notified when:

- A property value actually changes (new value `!==` old value)
- A property is deleted (non-strict mode) — also marks the key dirty
- `__reset()` is called **and** the dirty set was non-empty
- `__resetToInitial()` is called **and** the state actually changed
- `__hydrate()` is called **and** at least one value changed (or `resetDirty` cleared a
  non-empty dirty set) — single notification for the batch

### Custom Validator Receives the Unwrapped Source

The custom `validate` function is invoked with the raw source object (or the internal
clone, when `clone: true` was used) — never the proxy. This avoids circular validation if
a validator were to access `model.__isValid`. Use the argument directly:

```typescript
validate: ((m) => m.password === m.confirmPassword ? true : "Passwords must match");
```

### Custom Validator Return Values

| Return              | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `true`              | Valid                                                             |
| `string`            | Invalid — one error at path `"/"` with that message               |
| `ValidationError[]` | Invalid — those errors verbatim, including any `keyword`/`params` |
| `[]` (empty array)  | Valid                                                             |

Errors from the schema come first, then the custom validator's.

### `in` Operator and Reserved Names

The proxy implements a `has` trap so that `"__dirty" in model`, `"subscribe" in model`,
etc. all return `true`, matching what's observable via the `get` trap. Source keys behave
as expected.
