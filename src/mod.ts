/**
 * @module modelize
 *
 * A lightweight utility that wraps any JavaScript/TypeScript object with a Proxy
 * to provide dirty tracking, validation, and Svelte-compatible reactivity.
 *
 * ## Features
 * - **Dirty tracking** - Know which properties have changed via `__dirty` and `__isDirty`
 * - **Validation** - Any [Standard Schema](https://standardschema.dev) validator
 *   (Zod, Valibot, ArkType, …) and/or custom validator functions
 * - **Field-level errors** - Detailed validation error reporting
 * - **Reset capabilities** - Clear dirty state or restore initial values
 * - **Svelte-compatible** - Implements the Svelte store contract for `$` auto-subscription
 * - **No validation dependency** - the core ships without a bundled validator
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
 * ## Validation
 * ```typescript
 * import { z } from "zod";
 *
 * const user = modelize({ age: 25 }, {
 *   schema: z.object({ age: z.number().min(0) }),
 * });
 * ```
 *
 * For plain JSON Schema documents, use the AJV adapter from the
 * `@marianmeres/modelize/ajv` subpath (requires the optional `ajv` peer
 * dependency).
 *
 * ## Exports
 * - {@link modelize} - Main function to wrap objects
 * - {@link Modelized} - Return type of modelize()
 * - {@link ModelizedMethods} - Methods/properties added to wrapped objects
 * - {@link ModelizeOptions} - Configuration options
 * - {@link ModelizeValidationError} - Error thrown on validation failure
 * - {@link ValidationError} - Validation error interface
 * - {@link isModelized} - Type guard for modelized objects
 * - {@link StandardSchemaV1} - The vendored Standard Schema V1 interface
 * - {@link isStandardSchema} - Type guard for Standard Schema validators
 */
export * from "./modelize.ts";
export {
	isStandardSchema,
	type ModelizeIssue,
	type StandardSchemaV1,
} from "./standard-schema.ts";
