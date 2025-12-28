# API Reference

Complete API documentation for `@marianmeres/modelize`.

## Table of Contents

- [modelize()](#function-modelize)
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
  options?: ModelizeOptions<T>
): Modelized<T>
```

Wraps a source object with a Proxy that provides dirty tracking, validation, and Svelte-compatible reactivity.

### Type Parameters

| Parameter | Constraint | Description |
|-----------|------------|-------------|
| `T` | `extends object` | The type of the source object being wrapped |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | `T` | Yes | The object to wrap. Can be a plain object or class instance. Must not contain properties with reserved names. |
| `options` | `ModelizeOptions<T>` | No | Configuration for validation and strict mode |

### Returns

`Modelized<T>` - A Proxy combining the original object type `T` with `ModelizedMethods<T>`.

### Throws

- `Error` - If source contains reserved property names (`__dirty`, `__isValid`, etc.)
- `Error` - If strict mode is enabled and attempting to add/delete properties

### Examples

**Basic usage:**
```typescript
const user = modelize({ name: "John", age: 30 });

user.name = "Jane";
console.log(user.__isDirty);  // true
console.log(user.__dirty);    // Set { "name" }

user.__reset();
console.log(user.__isDirty);  // false
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
        age: { type: "number", minimum: 0, maximum: 150 }
      },
      required: ["name"]
    }
  }
);

user.age = -5;
console.log(user.__isValid);  // false
console.log(user.__errors);   // [{ path: "/age", message: "must be >= 0" }]
```

**With custom validator:**
```typescript
const form = modelize(
  { password: "", confirmPassword: "" },
  {
    validate: (m) => m.password === m.confirmPassword
      ? true
      : "Passwords must match"
  }
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

## Interface: `ModelizeOptions`

```typescript
interface ModelizeOptions<T extends object> {
  schema?: JSONSchema;
  validate?: (model: T) => true | string;
  strict?: boolean;
}
```

Configuration options for the `modelize` function.

### Type Parameters

| Parameter | Description |
|-----------|-------------|
| `T` | The type of the source object being modelized |

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `schema` | `JSONSchema` | - | Optional JSON Schema for validation. When provided, the model will be validated against this schema whenever `__isValid` is accessed or `__validate()` is called. Uses AJV (Another JSON Validator) internally. |
| `validate` | `(model: T) => true \| string` | - | Optional custom validator function. Called after JSON Schema validation (if any). Return `true` if valid, or an error message string if invalid. |
| `strict` | `boolean` | `true` | When `true`, prevents adding properties that don't exist on the original source object. Set to `false` to allow dynamic properties. |

### Example

```typescript
const options: ModelizeOptions<User> = {
  schema: { type: "object", properties: { age: { minimum: 0 } } },
  validate: (m) => m.age >= 18 ? true : "Must be an adult",
  strict: true
};
```

---

## Type: `Modelized`

```typescript
type Modelized<T extends object> = T & ModelizedMethods<T>;
```

A modelized object that combines the original source type `T` with the `ModelizedMethods` interface. This is the return type of the `modelize()` function.

### Type Parameters

| Parameter | Description |
|-----------|-------------|
| `T` | The type of the source object |

### Example

```typescript
interface User {
  name: string;
  age: number;
}

const user: Modelized<User> = modelize({ name: "John", age: 30 });
user.name;      // string (from User)
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
  __hydrate(data: Partial<T>, options?: { resetDirty?: boolean }): void;
  subscribe(callback: (model: Modelized<T>) => void): () => void;
}
```

Methods and properties added to a modelized object. These use the `__` prefix convention to avoid collision with user-defined properties.

### Read-only Properties

| Property | Type | Description |
|----------|------|-------------|
| `__dirty` | `Set<keyof T>` | Set of property keys that have been modified since creation or last reset. Always returns a Set (empty when clean, never null). |
| `__isDirty` | `boolean` | Convenience boolean indicating whether any property has been modified. Equivalent to `__dirty.size > 0`. |
| `__isValid` | `boolean` | Returns `true` if the model passes all validation rules. Runs validation lazily when accessed (not on every property change). Updates `__errors` with the validation results. |
| `__errors` | `ValidationError[]` | Array of validation errors from the last validation check. Empty array if the model is valid or hasn't been validated yet. |
| `__source` | `T` | Reference to the original unwrapped source object. Changes to the modelized object are reflected here. |
| `__initial` | `T` | Deep clone of the original source values at creation time. Used by `__resetToInitial()` to restore the model to its initial state. This snapshot is immutable. |

### Methods

#### `__validate()`

```typescript
__validate(): true
```

Validates the model and throws `ModelizeValidationError` if invalid. Use this when you want validation to halt execution on failure.

**Returns:** `true` if validation passes

**Throws:** `ModelizeValidationError` if validation fails, with `errors` array containing details

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

Clears the dirty state, marking all properties as "clean". Does NOT change any property values. Triggers a subscriber notification.

Use this after successfully saving the model to indicate there are no longer unsaved changes.

**Example:**
```typescript
await saveToDatabase(model);
model.__reset(); // Clear dirty flags after save
```

#### `__resetToInitial()`

```typescript
__resetToInitial(): void
```

Restores all properties to their initial values (from creation time) and clears the dirty state. Triggers a subscriber notification.

Use this to implement "cancel" or "revert changes" functionality.

**Example:**
```typescript
// User clicks "Cancel" button
model.__resetToInitial();
```

#### `__hydrate()`

```typescript
__hydrate(data: Partial<T>, options?: { resetDirty?: boolean }): void
```

Updates multiple properties in a single operation with one subscriber notification. More efficient than setting properties individually when updating many values.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Partial<T>` | Object with properties to update |
| `options.resetDirty` | `boolean` | If `true`, clears dirty state after hydration |

**Throws:** `Error` if `strict` mode is enabled and data contains unknown properties

**Example:**
```typescript
// Update from API response
model.__hydrate(apiResponse, { resetDirty: true });

// Batch update without clearing dirty
model.__hydrate({ name: "Jane", age: 25 });
```

#### `subscribe()`

```typescript
subscribe(callback: (model: Modelized<T>) => void): () => void
```

Subscribes to model changes. Follows the Svelte store contract:
- Callback is called immediately with the current value
- Callback is called on every subsequent change
- Returns an unsubscribe function

This method has no `__` prefix to maintain Svelte compatibility, allowing use of the `$model` auto-subscription syntax.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
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

---

## Interface: `ValidationError`

```typescript
interface ValidationError {
  path: string;
  message: string;
}
```

Represents a single validation error with its location and message.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | JSON Pointer path to the invalid property. Root-level errors use "/". Examples: `/name`, `/address/city`, `/` |
| `message` | `string` | Human-readable description of the validation failure |

### Example

```typescript
const error: ValidationError = {
  path: "/age",
  message: "must be >= 0"
};
```

---

## Class: `ModelizeValidationError`

```typescript
class ModelizeValidationError extends Error {
  constructor(message: string, errors?: ValidationError[]);
  errors: ValidationError[];
  name: string; // "ModelizeValidationError"
}
```

Error thrown when model validation fails. Extends the standard `Error` class with an array of all validation errors for detailed error reporting.

### Constructor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | The error message |
| `errors` | `ValidationError[]` | Array of field-level validation errors (defaults to empty array) |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `errors` | `ValidationError[]` | Array of field-level validation errors |
| `name` | `string` | Always `"ModelizeValidationError"` |
| `message` | `string` | Inherited from Error |

### Example

```typescript
try {
  model.__validate();
} catch (e) {
  if (e instanceof ModelizeValidationError) {
    console.log(e.message);  // "Validation failed"
    console.log(e.errors);   // Array of ValidationError
  }
}
```

---

## Type: `JSONSchema`

```typescript
type JSONSchema = Record<string, unknown>;
```

A JSON Schema object used for validation. Follows the JSON Schema specification (draft-07 or later supported by AJV).

### Example

```typescript
const schema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "number", minimum: 0 }
  },
  required: ["name"]
};
```

---

## Reserved Property Names

The following property names are reserved and cannot be used in source objects passed to `modelize()`:

| Name | Purpose |
|------|---------|
| `__dirty` | Set of modified property keys |
| `__isDirty` | Boolean dirty state indicator |
| `__isValid` | Boolean validation result |
| `__source` | Reference to original object |
| `__initial` | Deep clone of initial values |
| `__errors` | Array of validation errors |
| `__validate` | Validation method |
| `__reset` | Reset dirty state method |
| `__resetToInitial` | Reset to initial values method |
| `__hydrate` | Bulk update method |
| `subscribe` | Svelte-compatible subscription method |

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

Only direct property changes are tracked. Nested object mutations do not trigger dirty state on the parent:

```typescript
const model = modelize({ user: { name: "John" } });
model.user.name = "Jane";     // Does NOT mark model as dirty
model.user = { name: "Jane" }; // DOES mark model as dirty
```

### Lazy Validation

Validation only runs when you access `__isValid` or call `__validate()`. It does not run on every property change:

```typescript
const model = modelize({ age: -5 }, { schema: { properties: { age: { minimum: 0 } } } });
// No validation has run yet

model.__isValid;  // NOW validation runs, returns false
model.__errors;   // Contains the validation errors
```

### Subscriber Notifications

Subscribers are notified when:
- A property value changes (only if the new value differs from the old value)
- `__reset()` is called
- `__resetToInitial()` is called
- `__hydrate()` is called (single notification for all changes)
