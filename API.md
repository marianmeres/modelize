# API Reference

Complete API documentation for `@marianmeres/modelize`.

## Table of Contents

- [modelize()](#function-modelize)
- [isModelized()](#function-ismodelized)
- [ModelizeOptions](#interface-modelizeoptions)
- [Modelized](#type-modelized)
- [ModelizedMethods](#interface-modelizedmethods)
- [ValidationError](#interface-validationerror)
- [ModelizeValidationError](#class-modelizevalidationerror)
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

**With JSON Schema validation:**

```typescript
const user = modelize(
	{ name: "", age: 0 },
	{
		schema: {
			type: "object",
			properties: {
				name: { type: "string", minLength: 1 },
				age: { type: "number", minimum: 0, maximum: 150 },
			},
			required: ["name"],
		},
	},
);

user.age = -5;
console.log(user.__isValid); // false
console.log(user.__errors); // [{ path: "/age", message: "must be >= 0" }]
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

## Interface: `ModelizeOptions`

```typescript
interface ModelizeOptions<T extends object> {
	schema?: JSONSchema;
	validate?: (model: T) => true | string;
	strict?: boolean;
	clone?: boolean;
	ajv?: Ajv;
}
```

Configuration options for the `modelize` function.

### Type Parameters

| Parameter | Description                                   |
| --------- | --------------------------------------------- |
| `T`       | The type of the source object being modelized |

### Properties

| Property   | Type                           | Default | Description                                                                                                                                                                                                |
| ---------- | ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`   | `JSONSchema`                   | -       | Optional JSON Schema for validation. When provided, the model is validated against this schema whenever `__isValid`, `__errors`, or `__validate()` is accessed. Uses AJV internally.                       |
| `validate` | `(model: T) => true \| string` | -       | Optional custom validator. Called after JSON Schema validation (if any) and receives the **unwrapped** source object. Return `true` if valid or an error-message string.                                   |
| `strict`   | `boolean`                      | `true`  | When `true`, prevents adding/deleting properties. Set to `false` to allow dynamic properties.                                                                                                              |
| `clone`    | `boolean`                      | `false` | When `true`, deep-clones the source before wrapping so the caller's original object is not mutated. `__source` refers to the internal clone.                                                               |
| `ajv`      | `Ajv`                          | -       | Optional AJV instance used to compile the schema. When omitted, a module-level singleton is used. Inject your own to register custom formats/keywords or to isolate schema caches in long-lived processes. |

### Example

```typescript
const options: ModelizeOptions<User> = {
	schema: { type: "object", properties: { age: { minimum: 0 } } },
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

| Property  | Type                                 | Description                                                                                                   |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `path`    | `string`                             | JSON Pointer path to the invalid property. Root-level errors use "/". Examples: `/name`, `/address/city`, `/` |
| `message` | `string`                             | Human-readable description of the validation failure                                                          |
| `keyword` | `string` (optional)                  | AJV keyword that failed (e.g. `"minimum"`, `"required"`, `"type"`). Absent for custom-validator errors.       |
| `params`  | `Record<string, unknown>` (optional) | Structured AJV details (e.g. `{ limit: 0, comparison: ">=" }`). Absent for custom-validator errors.           |

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

## Type: `JSONSchema`

```typescript
type JSONSchema = Record<string, unknown>;
```

A JSON Schema object used for validation. Follows the JSON Schema specification (draft-07
or later supported by AJV).

### Example

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
const model = modelize({ age: -5 }, { schema: { properties: { age: { minimum: 0 } } } });

model.__isValid; // runs validation
model.__errors; // uses cached result (no re-run)
model.__validate(); // uses cached result

model.age = 10; // mutation invalidates the cache
model.__isValid; // re-runs validation
```

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

### `in` Operator and Reserved Names

The proxy implements a `has` trap so that `"__dirty" in model`, `"subscribe" in model`,
etc. all return `true`, matching what's observable via the `get` trap. Source keys behave
as expected.
