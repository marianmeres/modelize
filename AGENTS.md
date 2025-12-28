# Agent Context: @marianmeres/modelize

## Package Identity

- **Name**: `@marianmeres/modelize`
- **Version**: 2.0.2
- **License**: MIT
- **Registry**: JSR (primary), NPM (secondary)
- **Runtime**: Deno, Node.js, Browser

## Purpose

Lightweight proxy wrapper for JavaScript/TypeScript objects providing:
1. Dirty tracking (which properties changed)
2. Validation (JSON Schema via AJV + custom validators)
3. Svelte store compatibility (reactive `$` syntax)

## Architecture

```
src/
├── mod.ts           # Entry point, re-exports modelize.ts
└── modelize.ts      # Single-file implementation (~689 lines)

tests/
└── modelize.test.ts # Comprehensive test suite (42 tests)
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

### Validation
- Two-stage: JSON Schema (AJV) → Custom validator
- Lazy execution: only runs on `__isValid` access or `__validate()` call
- Errors accumulated from both sources into `__errors` array

### Svelte Integration
- `subscribe(callback)` follows Svelte store contract
- Callback called immediately with current value
- Returns unsubscribe function
- Enables `$model` auto-subscription syntax

## Public API Summary

### Main Function
```typescript
modelize<T extends object>(source: T, options?: ModelizeOptions<T>): Modelized<T>
```

### Configuration (ModelizeOptions)
```typescript
{
  schema?: JSONSchema,           // AJV JSON Schema
  validate?: (m: T) => true | string,  // Custom validator
  strict?: boolean               // Default true: prevent new props
}
```

### Modelized Object Properties (readonly)
| Property | Type | Description |
|----------|------|-------------|
| `__dirty` | `Set<keyof T>` | Modified property keys |
| `__isDirty` | `boolean` | `dirty.size > 0` |
| `__isValid` | `boolean` | Validation result (triggers validation) |
| `__errors` | `ValidationError[]` | Last validation errors |
| `__source` | `T` | Original unwrapped object |
| `__initial` | `T` | Deep clone at creation time |

### Modelized Object Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `__validate()` | `true` | Throws `ModelizeValidationError` if invalid |
| `__reset()` | `void` | Clear dirty state, keep values |
| `__resetToInitial()` | `void` | Restore initial values, clear dirty |
| `__hydrate(data, opts?)` | `void` | Bulk update, single notification |
| `subscribe(cb)` | `() => void` | Svelte-compatible subscription |

### Error Types
```typescript
interface ValidationError { path: string; message: string; }
class ModelizeValidationError extends Error { errors: ValidationError[]; }
```

## Reserved Property Names

Cannot be used in source objects:
```
__dirty, __isDirty, __isValid, __source, __initial, __errors,
__validate, __reset, __resetToInitial, __hydrate, subscribe
```

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
- `__hydrate()` also respects strict mode

### Deep Clone for Initial State
- Uses recursive clone supporting objects and arrays
- Enables reliable `__resetToInitial()` behavior
- Does not handle special objects (Date, Map, Set, etc.)

### Subscriber Notifications
Triggered by:
- Property value change (if actually different)
- `__reset()`
- `__resetToInitial()`
- `__hydrate()` (single notification for batch)

### AJV Instance
- Lazy-initialized singleton
- Configured with `allErrors: true`
- Schema validators are compiled and cached

## Type Exports

```typescript
import {
  modelize,
  type Modelized,
  type ModelizedMethods,
  type ModelizeOptions,
  type ValidationError,
  type JSONSchema,
  ModelizeValidationError,
} from "@marianmeres/modelize";
```

## File Locations

| Purpose | Path |
|---------|------|
| Entry point | `src/mod.ts` |
| Implementation | `src/modelize.ts` |
| Tests | `tests/modelize.test.ts` |
| Package config | `deno.json` |
| Build script | `scripts/build-npm.ts` |
| Human docs | `README.md`, `API.md` |
