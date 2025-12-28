/**
 * @module modelize
 *
 * A lightweight utility that wraps any JavaScript/TypeScript object with a Proxy
 * to provide dirty tracking, validation, and Svelte-compatible reactivity.
 *
 * ## Features
 * - **Dirty tracking** - Know which properties have changed via `__dirty` and `__isDirty`
 * - **Validation** - JSON Schema (via AJV) and/or custom validator functions
 * - **Field-level errors** - Detailed validation error reporting
 * - **Reset capabilities** - Clear dirty state or restore initial values
 * - **Svelte-compatible** - Implements the Svelte store contract for `$` auto-subscription
 *
 * ## Quick Example
 * ```typescript
 * import { modelize } from "@marianmeres/modelize";
 *
 * const user = modelize({ name: "John", age: 30 });
 *
 * user.name = "Jane";
 * user.__isDirty;  // true
 * user.__dirty;    // Set { "name" }
 *
 * user.__reset();
 * user.__isDirty;  // false
 * ```
 *
 * ## Exports
 * - {@link modelize} - Main function to wrap objects
 * - {@link Modelized} - Return type of modelize()
 * - {@link ModelizedMethods} - Methods/properties added to wrapped objects
 * - {@link ModelizeOptions} - Configuration options
 * - {@link ModelizeValidationError} - Error thrown on validation failure
 * - {@link ValidationError} - Validation error interface
 * - {@link JSONSchema} - JSON Schema type alias
 */
export * from "./modelize.ts";
