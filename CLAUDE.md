# @marianmeres/modelize

Proxy wrapper for objects with dirty tracking, validation, and Svelte reactivity.

## Quick Reference

```typescript
import { modelize } from "@marianmeres/modelize";

const model = modelize({ name: "John" }, {
  schema: { properties: { name: { minLength: 1 } } },
  validate: (m) => m.name !== "admin" || "Reserved name",
  strict: true  // default
});

model.name = "Jane";
model.__isDirty;        // true
model.__dirty;          // Set { "name" }
model.__isValid;        // true/false (triggers validation)
model.__errors;         // ValidationError[]
model.__validate();     // throws ModelizeValidationError if invalid
model.__reset();        // clear dirty, keep values
model.__resetToInitial(); // restore initial values
model.__hydrate(data, { resetDirty: true }); // bulk update
model.subscribe(cb);    // Svelte-compatible
```

## Structure

- `src/mod.ts` - Entry point
- `src/modelize.ts` - All implementation
- `tests/modelize.test.ts` - 42 tests

## Key Behaviors

- **Shallow tracking**: nested mutations don't trigger dirty
- **Lazy validation**: only on `__isValid` or `__validate()`
- **Strict mode**: prevents add/delete properties (default on)

## Commands

```bash
deno task test          # run tests
deno task npm:build     # build npm package
deno task publish       # publish to JSR + NPM
```

## Dependencies

- `@marianmeres/pubsub` - change notifications
- `ajv` - JSON Schema validation
