import { createPubSub } from "@marianmeres/pubsub";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

/**
 * A JSON Schema object used for validation.
 * Follows the JSON Schema specification (draft-07 or later supported by AJV).
 *
 * @example
 * ```typescript
 * const schema: JSONSchema = {
 *   type: "object",
 *   properties: {
 *     name: { type: "string", minLength: 1 },
 *     age: { type: "number", minimum: 0 }
 *   },
 *   required: ["name"]
 * };
 * ```
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Configuration options for the `modelize` function.
 *
 * @template T - The type of the source object being modelized
 *
 * @example
 * ```typescript
 * const options: ModelizeOptions<User> = {
 *   schema: { type: "object", properties: { age: { minimum: 0 } } },
 *   validate: (m) => m.age >= 18 ? true : "Must be an adult",
 *   strict: true
 * };
 * ```
 */
export interface ModelizeOptions<T extends object> {
	/**
	 * Optional JSON Schema for validation.
	 * When provided, the model will be validated against this schema
	 * whenever `__isValid` is accessed or `__validate()` is called.
	 * Uses AJV (Another JSON Validator) internally.
	 */
	schema?: JSONSchema;

	/**
	 * Optional custom validator function.
	 * Called after JSON Schema validation (if any).
	 *
	 * @param model - The current model state
	 * @returns `true` if valid, or an error message string if invalid
	 *
	 * @example
	 * ```typescript
	 * validate: (m) => m.password === m.confirmPassword
	 *   ? true
	 *   : "Passwords must match"
	 * ```
	 */
	validate?: (model: T) => true | string;

	/**
	 * When `true` (default), prevents adding properties that don't exist
	 * on the original source object. Set to `false` to allow dynamic properties.
	 *
	 * @default true
	 */
	strict?: boolean;
}

/**
 * Represents a single validation error with its location and message.
 *
 * @example
 * ```typescript
 * const error: ValidationError = {
 *   path: "/age",
 *   message: "must be >= 0"
 * };
 * ```
 */
export interface ValidationError {
	/**
	 * JSON Pointer path to the invalid property.
	 * Root-level errors use "/".
	 *
	 * @example "/name", "/address/city", "/"
	 */
	path: string;

	/**
	 * Human-readable description of the validation failure.
	 */
	message: string;
}

/**
 * Error thrown when model validation fails.
 * Contains an array of all validation errors for detailed error reporting.
 *
 * @extends Error
 *
 * @example
 * ```typescript
 * try {
 *   model.__validate();
 * } catch (e) {
 *   if (e instanceof ModelizeValidationError) {
 *     console.log(e.errors); // Array of ValidationError
 *   }
 * }
 * ```
 */
export class ModelizeValidationError extends Error {
	/**
	 * Creates a new ModelizeValidationError.
	 *
	 * @param message - The error message
	 * @param errors - Array of field-level validation errors
	 */
	constructor(
		message: string,
		public errors: ValidationError[] = [],
	) {
		super(message);
		this.name = "ModelizeValidationError";
	}
}

/**
 * Methods and properties added to a modelized object.
 * These are accessed via the proxy and use the `__` prefix convention
 * to avoid collision with user-defined properties.
 *
 * The `__` (double underscore) prefix is used intentionally to:
 * 1. Clearly distinguish framework methods from user data properties
 * 2. Minimize the chance of naming collisions with source object properties
 * 3. Signal that these are "internal" or "meta" properties of the wrapper
 *
 * The only exception is `subscribe`, which has no prefix to maintain
 * compatibility with the Svelte store contract.
 *
 * @template T - The type of the source object
 */
export interface ModelizedMethods<T extends object> {
	/**
	 * Set of property keys that have been modified since creation or last reset.
	 * Always returns a Set (empty when clean, never null).
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * model.name = "Jane";
	 * model.__dirty.has("name"); // true
	 * model.__dirty.size;        // 1
	 * ```
	 */
	readonly __dirty: Set<keyof T>;

	/**
	 * Convenience boolean indicating whether any property has been modified.
	 * Equivalent to `__dirty.size > 0`.
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * if (model.__isDirty) {
	 *   console.log("Model has unsaved changes");
	 * }
	 * ```
	 */
	readonly __isDirty: boolean;

	/**
	 * Returns `true` if the model passes all validation rules.
	 * Runs validation lazily when accessed (not on every property change).
	 * Updates `__errors` with the validation results.
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * if (!model.__isValid) {
	 *   console.log("Errors:", model.__errors);
	 * }
	 * ```
	 */
	readonly __isValid: boolean;

	/**
	 * Reference to the original unwrapped source object.
	 * Changes to the modelized object are reflected here.
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * const source = { name: "John" };
	 * const model = modelize(source);
	 * model.name = "Jane";
	 * console.log(source.name); // "Jane"
	 * console.log(model.__source === source); // true
	 * ```
	 */
	readonly __source: T;

	/**
	 * Deep clone of the original source values at creation time.
	 * Used by `__resetToInitial()` to restore the model to its initial state.
	 * This snapshot is immutable and not affected by subsequent changes.
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * const model = modelize({ name: "John" });
	 * model.name = "Jane";
	 * console.log(model.__initial.name); // "John" (unchanged)
	 * ```
	 */
	readonly __initial: T;

	/**
	 * Array of validation errors from the last validation check.
	 * Empty array if the model is valid or hasn't been validated yet.
	 * Updated whenever `__isValid` is accessed or `__validate()` is called.
	 *
	 * @readonly
	 *
	 * @example
	 * ```typescript
	 * model.__isValid; // triggers validation
	 * for (const error of model.__errors) {
	 *   console.log(`${error.path}: ${error.message}`);
	 * }
	 * ```
	 */
	readonly __errors: ValidationError[];

	/**
	 * Validates the model and throws `ModelizeValidationError` if invalid.
	 * Use this when you want validation to halt execution on failure.
	 *
	 * @returns `true` if validation passes
	 * @throws {ModelizeValidationError} If validation fails, with `errors` array containing details
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   model.__validate();
	 *   await saveToDatabase(model);
	 * } catch (e) {
	 *   if (e instanceof ModelizeValidationError) {
	 *     showErrors(e.errors);
	 *   }
	 * }
	 * ```
	 */
	__validate(): true;

	/**
	 * Clears the dirty state, marking all properties as "clean".
	 * Does NOT change any property values.
	 * Triggers a subscriber notification.
	 *
	 * Use this after successfully saving the model to indicate
	 * there are no longer unsaved changes.
	 *
	 * @example
	 * ```typescript
	 * await saveToDatabase(model);
	 * model.__reset(); // Clear dirty flags after save
	 * ```
	 */
	__reset(): void;

	/**
	 * Restores all properties to their initial values (from creation time)
	 * and clears the dirty state.
	 * Triggers a subscriber notification.
	 *
	 * Use this to implement "cancel" or "revert changes" functionality.
	 *
	 * @example
	 * ```typescript
	 * // User clicks "Cancel" button
	 * model.__resetToInitial();
	 * ```
	 */
	__resetToInitial(): void;

	/**
	 * Updates multiple properties in a single operation with one subscriber notification.
	 * More efficient than setting properties individually when updating many values.
	 *
	 * @param data - Partial object with properties to update
	 * @param options - Optional configuration
	 * @param options.resetDirty - If `true`, clears dirty state after hydration
	 *
	 * @throws {Error} If `strict` mode is enabled and data contains unknown properties
	 *
	 * @example
	 * ```typescript
	 * // Update from API response
	 * model.__hydrate(apiResponse, { resetDirty: true });
	 *
	 * // Batch update without clearing dirty
	 * model.__hydrate({ name: "Jane", age: 25 });
	 * ```
	 */
	__hydrate(data: Partial<T>, options?: { resetDirty?: boolean }): void;

	/**
	 * Subscribes to model changes. Follows the Svelte store contract:
	 * - Callback is called immediately with the current value
	 * - Callback is called on every subsequent change
	 * - Returns an unsubscribe function
	 *
	 * This method has no `__` prefix to maintain Svelte compatibility,
	 * allowing use of the `$model` auto-subscription syntax.
	 *
	 * @param callback - Function called with the model on each change
	 * @returns Unsubscribe function to stop receiving updates
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = model.subscribe((m) => {
	 *   console.log("Model changed:", m.name);
	 * });
	 *
	 * // Later, to stop listening:
	 * unsubscribe();
	 * ```
	 *
	 * @example Svelte usage
	 * ```svelte
	 * <script>
	 *   const user = modelize({ name: "John" });
	 * </script>
	 *
	 * <input bind:value={$user.name} />
	 * ```
	 */
	subscribe(callback: (model: Modelized<T>) => void): () => void;
}

/**
 * A modelized object that combines the original source type `T`
 * with the `ModelizedMethods` interface.
 *
 * This is the return type of the `modelize()` function.
 *
 * @template T - The type of the source object
 *
 * @example
 * ```typescript
 * interface User {
 *   name: string;
 *   age: number;
 * }
 *
 * const user: Modelized<User> = modelize({ name: "John", age: 30 });
 * user.name;      // string (from User)
 * user.__isDirty; // boolean (from ModelizedMethods)
 * ```
 */
export type Modelized<T extends object> = T & ModelizedMethods<T>;

// AJV instance (lazy initialized)
let ajv: Ajv | null = null;

function getAjv(): Ajv {
	if (!ajv) {
		ajv = new Ajv({ allErrors: true });
	}
	return ajv;
}

function ajvErrorsToValidationErrors(
	errors: ErrorObject[] | null | undefined,
): ValidationError[] {
	if (!errors) return [];
	return errors.map((e) => ({
		path: e.instancePath || "/",
		message: e.message || "Unknown validation error",
	}));
}

function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(deepClone) as T;
	const cloned = {} as T;
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			cloned[key] = deepClone(obj[key]);
		}
	}
	return cloned;
}

/** Reserved property names that cannot be used in source objects */
const RESERVED_NAMES = new Set([
	"__dirty",
	"__isDirty",
	"__isValid",
	"__source",
	"__initial",
	"__errors",
	"__validate",
	"__reset",
	"__resetToInitial",
	"__hydrate",
	"subscribe",
]);

/**
 * Wraps a source object with a Proxy that provides:
 * - **Dirty tracking**: Know which properties have changed via `__dirty` and `__isDirty`
 * - **Validation**: JSON Schema and/or custom validator with field-level error reporting
 * - **Reset capabilities**: Clear dirty state or restore initial values
 * - **Svelte compatibility**: `subscribe` method follows the Svelte store contract
 *
 * The returned object behaves like the original but with additional methods/properties
 * prefixed with `__` (except `subscribe` for Svelte compatibility).
 *
 * @template T - The type of the source object (must be an object type)
 *
 * @param source - The object to wrap. Can be a plain object, class instance, or any object.
 *                 Must not contain properties with reserved names (`__dirty`, `__isValid`, etc.).
 * @param options - Optional configuration for validation and strict mode
 * @param options.schema - JSON Schema for validation (uses AJV internally)
 * @param options.validate - Custom validator function returning `true` or error message
 * @param options.strict - If `true` (default), prevents adding/deleting properties
 *
 * @returns A Proxy wrapping the source with tracking and validation capabilities
 *
 * @throws {Error} If source contains reserved property names
 * @throws {Error} If strict mode is enabled and attempting to add/delete properties
 *
 * @example Basic usage
 * ```typescript
 * const user = modelize({ name: "John", age: 30 });
 *
 * user.name = "Jane";
 * console.log(user.__isDirty);  // true
 * console.log(user.__dirty);    // Set { "name" }
 *
 * user.__reset();
 * console.log(user.__isDirty);  // false
 * ```
 *
 * @example With JSON Schema validation
 * ```typescript
 * const user = modelize(
 *   { name: "", age: 0 },
 *   {
 *     schema: {
 *       type: "object",
 *       properties: {
 *         name: { type: "string", minLength: 1 },
 *         age: { type: "number", minimum: 0, maximum: 150 }
 *       },
 *       required: ["name"]
 *     }
 *   }
 * );
 *
 * user.age = -5;
 * console.log(user.__isValid);  // false
 * console.log(user.__errors);   // [{ path: "/age", message: "must be >= 0" }]
 * ```
 *
 * @example With custom validator
 * ```typescript
 * const form = modelize(
 *   { password: "", confirmPassword: "" },
 *   {
 *     validate: (m) => m.password === m.confirmPassword
 *       ? true
 *       : "Passwords must match"
 *   }
 * );
 * ```
 *
 * @example Svelte integration
 * ```svelte
 * <script>
 *   import { modelize } from "@marianmeres/modelize";
 *   const user = modelize({ name: "John" });
 * </script>
 *
 * <input bind:value={$user.name} />
 * {#if $user.__isDirty}
 *   <button on:click={() => $user.__resetToInitial()}>Cancel</button>
 * {/if}
 * ```
 */
export function modelize<T extends object>(
	source: T,
	options: ModelizeOptions<T> = {},
): Modelized<T> {
	const { schema, validate: customValidator, strict = true } = options;

	// Validate that source doesn't use reserved names
	for (const key of Object.keys(source)) {
		if (RESERVED_NAMES.has(key)) {
			throw new Error(
				`Property "${key}" is reserved and cannot be used in modelized objects`,
			);
		}
	}

	// Internal state
	const dirty = new Set<keyof T>();
	const initial = deepClone(source);
	let lastErrors: ValidationError[] = [];

	// Pub/sub for change notifications
	const pubsub = createPubSub();
	const CHANGE_EVENT = "change";

	// Compiled schema validator (lazy)
	let compiledValidator: ValidateFunction | null = null;

	function getCompiledValidator(): ValidateFunction | null {
		if (schema && !compiledValidator) {
			compiledValidator = getAjv().compile(schema);
		}
		return compiledValidator;
	}

	// Validation logic
	function doValidate(): { valid: boolean; errors: ValidationError[] } {
		const errors: ValidationError[] = [];

		// JSON Schema validation
		const validator = getCompiledValidator();
		if (validator) {
			const valid = validator(source);
			if (!valid) {
				errors.push(...ajvErrorsToValidationErrors(validator.errors));
			}
		}

		// Custom validator
		if (customValidator) {
			const result = customValidator(source as T);
			if (result !== true) {
				errors.push({ path: "/", message: result });
			}
		}

		return { valid: errors.length === 0, errors };
	}

	// Notify subscribers
	function notify() {
		pubsub.publish(CHANGE_EVENT, proxy);
	}

	// The proxy handler
	const handler: ProxyHandler<T> = {
		get(target, prop, receiver) {
			// Handle our special methods/properties first
			switch (prop) {
				case "__dirty":
					return dirty;
				case "__isDirty":
					return dirty.size > 0;
				case "__isValid": {
					const { valid, errors } = doValidate();
					lastErrors = errors;
					return valid;
				}
				case "__source":
					return target;
				case "__initial":
					return initial;
				case "__errors":
					return lastErrors;
				case "__validate":
					return () => {
						const { valid, errors } = doValidate();
						lastErrors = errors;
						if (!valid) {
							throw new ModelizeValidationError(
								"Validation failed",
								errors,
							);
						}
						return true;
					};
				case "__reset":
					return () => {
						dirty.clear();
						notify();
					};
				case "__resetToInitial":
					return () => {
						for (const key in initial) {
							if (Object.prototype.hasOwnProperty.call(initial, key)) {
								(target as Record<string, unknown>)[key] = deepClone(
									initial[key],
								);
							}
						}
						dirty.clear();
						notify();
					};
				case "__hydrate":
					return (data: Partial<T>, opts?: { resetDirty?: boolean }) => {
						for (const key in data) {
							if (Object.prototype.hasOwnProperty.call(data, key)) {
								if (strict && !(key in target)) {
									throw new Error(
										`Property "${key}" does not exist on model (strict mode enabled)`,
									);
								}
								const oldValue = (target as Record<string, unknown>)[key];
								const newValue = data[key];
								(target as Record<string, unknown>)[key] = newValue;
								if (oldValue !== newValue) {
									dirty.add(key as keyof T);
								}
							}
						}
						if (opts?.resetDirty) {
							dirty.clear();
						}
						notify();
					};
				case "subscribe":
					return (callback: (model: Modelized<T>) => void) => {
						// Svelte contract: call immediately with current value
						callback(proxy);
						return pubsub.subscribe(CHANGE_EVENT, callback);
					};
			}

			// Default: access the target property
			return Reflect.get(target, prop, receiver);
		},

		set(target, prop, value, receiver) {
			const key = prop as string;

			// Prevent setting reserved properties
			if (RESERVED_NAMES.has(key)) {
				throw new Error(`Cannot set reserved property "${key}"`);
			}

			// Strict mode check
			if (strict && !(key in target)) {
				throw new Error(
					`Property "${key}" does not exist on model (strict mode enabled)`,
				);
			}

			const oldValue = (target as Record<string, unknown>)[key];
			const success = Reflect.set(target, prop, value, receiver);

			if (success && oldValue !== value) {
				dirty.add(key as keyof T);
				notify();
			}

			return success;
		},

		// Prevent deleting properties in strict mode
		deleteProperty(target, prop) {
			if (strict) {
				throw new Error(
					`Cannot delete property "${String(prop)}" (strict mode enabled)`,
				);
			}
			const success = Reflect.deleteProperty(target, prop);
			if (success) {
				notify();
			}
			return success;
		},
	};

	const proxy = new Proxy(source, handler) as Modelized<T>;
	return proxy;
}
