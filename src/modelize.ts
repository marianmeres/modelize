import { createPubSub } from "@marianmeres/pubsub";
import {
	isStandardSchema,
	issuePathToPointer,
	type ModelizeIssue,
	type StandardSchemaV1,
} from "./standard-schema.ts";

/**
 * Configuration options for the `modelize` function.
 *
 * @template T - The type of the source object being modelized
 *
 * @example
 * ```typescript
 * const options: ModelizeOptions<User> = {
 *   schema: z.object({ age: z.number().min(0) }),
 *   validate: (m) => m.age >= 18 ? true : "Must be an adult",
 *   strict: true
 * };
 * ```
 */
export interface ModelizeOptions<T extends object> {
	/**
	 * Optional [Standard Schema](https://standardschema.dev) validator.
	 * When provided, the model is validated against it whenever `__isValid`,
	 * `__errors`, or `__validate()` is accessed.
	 *
	 * Any library implementing the standard works directly — Zod, Valibot,
	 * ArkType, yup, joi, and others. For a plain JSON Schema document, wrap it
	 * with `ajvSchema()` from `@marianmeres/modelize/ajv`.
	 *
	 * The schema is used **as a validator only**: Standard Schema returns a
	 * possibly transformed value, and `modelize` discards it. Transforms,
	 * coercions and defaults are therefore checked but never written back to
	 * the model — see the README for the implications.
	 *
	 * Validation is synchronous. A schema whose `validate()` returns a Promise
	 * (e.g. a Zod async refinement) throws a `TypeError`.
	 *
	 * @example
	 * ```typescript
	 * import { z } from "zod";
	 * modelize(data, { schema: z.object({ age: z.number().min(0) }) });
	 * ```
	 *
	 * @example
	 * ```typescript
	 * import { ajvSchema } from "@marianmeres/modelize/ajv";
	 * modelize(data, { schema: ajvSchema({ type: "object", ... }) });
	 * ```
	 */
	schema?: StandardSchemaV1;

	/**
	 * Optional custom validator function.
	 * Called after schema validation (if any).
	 *
	 * Note: The validator receives the unwrapped source object, not the
	 * proxy. Accessing `__isValid` / `__errors` inside the validator is
	 * therefore not possible (and would be circular).
	 *
	 * @param model - The current (unwrapped) model state
	 * @returns `true` if valid; an error message string for a single
	 *   root-level error; or an array of {@link ValidationError} for
	 *   field-level reporting. An empty array means valid.
	 *
	 * @example Single message
	 * ```typescript
	 * validate: (m) => m.password === m.confirmPassword
	 *   ? true
	 *   : "Passwords must match"
	 * ```
	 *
	 * @example Field-level errors
	 * ```typescript
	 * validate: (m) => {
	 *   const errors: ValidationError[] = [];
	 *   if (!m.email.includes("@")) {
	 *     errors.push({ path: "/email", message: "Invalid email" });
	 *   }
	 *   return errors.length ? errors : true;
	 * }
	 * ```
	 */
	validate?: (model: T) => true | string | ValidationError[];

	/**
	 * When `true` (default), prevents adding properties that don't exist
	 * on the original source object. Set to `false` to allow dynamic properties.
	 *
	 * @default true
	 */
	strict?: boolean;

	/**
	 * When `true`, the source object is deep-cloned before being wrapped so
	 * that the caller's original reference is not mutated. `__source` then
	 * refers to the internal clone.
	 *
	 * @default false
	 */
	clone?: boolean;
}

/**
 * Represents a single validation error with its location and message.
 *
 * @example
 * ```typescript
 * const error: ValidationError = {
 *   path: "/age",
 *   message: "must be >= 0",
 *   keyword: "minimum",
 *   params: { comparison: ">=", limit: 0 }
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

	/**
	 * The schema keyword that failed (e.g. `"minimum"`, `"required"`,
	 * `"type"`).
	 *
	 * Populated by the bundled AJV adapter (`ajvSchema()`). Other Standard
	 * Schema libraries do not report a keyword, so this is absent for them —
	 * as it is for custom-validator errors.
	 */
	keyword?: string;

	/**
	 * Additional structured information about the failure (e.g.
	 * `{ limit: 0, comparison: ">=" }` for `minimum`).
	 *
	 * Populated by the bundled AJV adapter (`ajvSchema()`) only; see
	 * {@link ValidationError.keyword}.
	 */
	params?: Record<string, unknown>;
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
	 * Array of field-level validation errors. Readonly; treat as immutable.
	 */
	public readonly errors: ValidationError[];

	/**
	 * Creates a new ModelizeValidationError.
	 *
	 * @param message - The error message
	 * @param errors - Array of field-level validation errors
	 */
	constructor(message: string, errors: ValidationError[] = []) {
		super(message);
		this.name = "ModelizeValidationError";
		this.errors = errors;
	}
}

/**
 * Methods and properties added to a modelized object.
 * These are accessed via the proxy and use the `__` prefix convention
 * to avoid collision with user-defined properties.
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
	 */
	readonly __dirty: Set<keyof T>;

	/**
	 * Convenience boolean indicating whether any property has been modified.
	 * Equivalent to `__dirty.size > 0`.
	 *
	 * @readonly
	 */
	readonly __isDirty: boolean;

	/**
	 * Returns `true` if the model passes all validation rules.
	 *
	 * Validation is lazy and cached: it runs on first access after a
	 * mutation (set / delete / `__hydrate` / `__resetToInitial`) and the
	 * result is reused by subsequent reads of `__isValid`, `__errors`, and
	 * `__validate()` until the next mutation.
	 *
	 * @readonly
	 */
	readonly __isValid: boolean;

	/**
	 * Reference to the original unwrapped source object (or, when the
	 * `clone` option was used, the internal clone).
	 *
	 * @readonly
	 */
	readonly __source: T;

	/**
	 * Deep clone of the source values at creation time.
	 * Used by `__resetToInitial()` to restore the model to its initial state.
	 * This snapshot is immutable and not affected by subsequent changes.
	 *
	 * @readonly
	 */
	readonly __initial: T;

	/**
	 * Array of validation errors. Reading this property triggers (lazy,
	 * cached) validation, so it is always consistent with `__isValid`.
	 *
	 * @readonly
	 */
	readonly __errors: ValidationError[];

	/**
	 * Validates the model and throws `ModelizeValidationError` if invalid.
	 *
	 * @returns `true` if validation passes
	 * @throws {ModelizeValidationError} If validation fails
	 */
	__validate(): true;

	/**
	 * Clears the dirty state, marking all properties as "clean".
	 * Does NOT change any property values.
	 * Triggers a subscriber notification only if the dirty set was non-empty.
	 */
	__reset(): void;

	/**
	 * Restores all properties to their initial values (from creation time)
	 * and clears the dirty state. Under `strict: false`, properties added
	 * after creation are removed.
	 * Triggers a subscriber notification only if the state actually changed.
	 */
	__resetToInitial(): void;

	/**
	 * Updates multiple properties in a single (atomic) operation with a
	 * single subscriber notification.
	 *
	 * Atomicity: under `strict: true`, unknown keys are rejected **before**
	 * any mutation is applied. Under `{ validate: true }`, the schema/custom
	 * validator is checked against the candidate state first, and nothing
	 * is mutated when validation fails.
	 *
	 * A notification is emitted only if at least one value actually changed
	 * or `resetDirty` cleared a non-empty dirty set.
	 *
	 * @param data - Partial object with properties to update
	 * @param options.resetDirty - If `true`, clears dirty state after hydration
	 * @param options.validate - If `true`, run validation against the candidate
	 *   state and throw `ModelizeValidationError` (without mutating) on failure
	 *
	 * @throws {Error} If `strict` mode is enabled and data contains unknown properties
	 * @throws {ModelizeValidationError} If `validate: true` and validation fails
	 */
	__hydrate(
		data: Partial<T>,
		options?: { resetDirty?: boolean; validate?: boolean },
	): void;

	/**
	 * Subscribes to model changes. Follows the Svelte store contract:
	 * - Callback is called immediately with the current value
	 * - Callback is called on every subsequent change
	 * - Returns an unsubscribe function
	 *
	 * @param callback - Function called with the model on each change
	 * @returns Unsubscribe function
	 */
	subscribe(callback: (model: Modelized<T>) => void): () => void;

	/**
	 * Subscribes to changes of a specific property. The callback is invoked
	 * only when the given key's value changes (by `===` identity), and
	 * receives `(newValue, previousValue)`.
	 *
	 * Unlike `subscribe`, the callback is **not** called immediately.
	 *
	 * @param key - Property key to watch
	 * @param callback - Called with `(newValue, previousValue)` on change
	 * @returns Unsubscribe function
	 */
	subscribeKey<K extends keyof T>(
		key: K,
		callback: (value: T[K], previous: T[K]) => void,
	): () => void;
}

/**
 * A modelized object that combines the original source type `T`
 * with the `ModelizedMethods` interface.
 *
 * @template T - The type of the source object
 */
export type Modelized<T extends object> = T & ModelizedMethods<T>;

// -----------------------------------------------------------------------------
// Reserved names
// -----------------------------------------------------------------------------

/** Reserved property names that cannot be used in source objects. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
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
	"subscribeKey",
]);

/** Symbol used to tag proxies for `isModelized()`. */
const MODELIZED_TAG: unique symbol = Symbol.for("@marianmeres/modelize.tag");

// -----------------------------------------------------------------------------
// Standard Schema
// -----------------------------------------------------------------------------

/**
 * Duck-typed thenable check. Deliberately not `instanceof Promise`: a schema
 * library may return a thenable from another realm or a custom Promise
 * implementation, and treating one as a success result would silently pass
 * validation.
 */
function isThenable(x: unknown): x is Promise<unknown> {
	return (
		x !== null && typeof x === "object" &&
		typeof (x as { then?: unknown }).then === "function"
	);
}

function issuesToValidationErrors(
	issues: ReadonlyArray<StandardSchemaV1.Issue>,
): ValidationError[] {
	return issues.map((issue) => {
		const { keyword, params } = issue as ModelizeIssue;
		const error: ValidationError = {
			path: issuePathToPointer(issue.path),
			message: issue.message || "Unknown validation error",
		};
		// Only the AJV adapter supplies these; keep them off the object
		// entirely for schemas that don't, rather than as `undefined` keys.
		if (keyword !== undefined) error.keyword = keyword;
		if (params !== undefined) error.params = params;
		return error;
	});
}

// -----------------------------------------------------------------------------
// Deep clone
// -----------------------------------------------------------------------------

/**
 * Deep clone that prefers the platform `structuredClone` (which handles
 * Date, Map, Set, RegExp, typed arrays, and cycles), falling back to a
 * manual clone for payloads that structuredClone rejects (e.g. objects
 * containing functions).
 */
function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") return obj;
	if (typeof globalThis.structuredClone === "function") {
		try {
			return globalThis.structuredClone(obj);
		} catch {
			// Fall through to manual clone for non-cloneable payloads
			// (e.g. objects containing functions).
		}
	}
	return manualDeepClone(obj, new WeakMap());
}

function manualDeepClone<T>(obj: T, seen: WeakMap<object, unknown>): T {
	if (obj === null || typeof obj !== "object") return obj;
	const existing = seen.get(obj as object);
	if (existing !== undefined) return existing as T;
	if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
	if (obj instanceof RegExp) {
		return new RegExp(obj.source, obj.flags) as unknown as T;
	}
	if (Array.isArray(obj)) {
		const arr: unknown[] = [];
		seen.set(obj as object, arr);
		for (const item of obj) arr.push(manualDeepClone(item, seen));
		return arr as unknown as T;
	}
	const cloned = {} as Record<string, unknown>;
	seen.set(obj as object, cloned);
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			cloned[key] = manualDeepClone(
				(obj as Record<string, unknown>)[key],
				seen,
			);
		}
	}
	return cloned as unknown as T;
}

// -----------------------------------------------------------------------------
// Type guard
// -----------------------------------------------------------------------------

/**
 * Type guard that returns `true` if `x` was produced by `modelize()`.
 */
export function isModelized<T extends object = Record<string, unknown>>(
	x: unknown,
): x is Modelized<T> {
	if (x === null || typeof x !== "object") return false;
	try {
		return (x as Record<PropertyKey, unknown>)[MODELIZED_TAG] === true;
	} catch {
		return false;
	}
}

// -----------------------------------------------------------------------------
// modelize
// -----------------------------------------------------------------------------

/**
 * Wraps a source object with a Proxy that provides dirty tracking,
 * validation (Standard Schema + custom), atomic bulk updates, and a
 * Svelte-compatible `subscribe` contract.
 *
 * See {@link ModelizeOptions} for configuration and
 * {@link ModelizedMethods} for the added API surface.
 */
export function modelize<T extends object>(
	source: T,
	options: ModelizeOptions<T> = {},
): Modelized<T> {
	const {
		schema,
		validate: customValidator,
		strict = true,
		clone = false,
	} = options;

	// Fail at the call site rather than later from a property read. The
	// overwhelmingly likely cause is a plain JSON Schema left over from v2.
	if (schema !== undefined && !isStandardSchema(schema)) {
		throw new TypeError(
			`modelize: "schema" must be a Standard Schema (https://standardschema.dev). ` +
				`Plain JSON Schema documents are no longer accepted directly — wrap one with ` +
				`ajvSchema():\n` +
				`  import { ajvSchema } from "@marianmeres/modelize/ajv";\n` +
				`  modelize(data, { schema: ajvSchema(jsonSchema) });`,
		);
	}

	const working = clone ? deepClone(source) : source;

	// Validate that working source doesn't use reserved names
	for (const key of Object.keys(working)) {
		if (RESERVED_NAMES.has(key)) {
			throw new Error(
				`Property "${key}" is reserved and cannot be used in modelized objects`,
			);
		}
	}

	// -------------------------------------------------------------------------
	// Internal state
	// -------------------------------------------------------------------------
	const dirty = new Set<keyof T>();
	const initial = deepClone(working);

	const pubsub = createPubSub();
	const CHANGE_EVENT = "change";

	// Cached validation result; invalidated on any data mutation.
	let cachedValidation: { valid: boolean; errors: ValidationError[] } | null = null;

	// Sticky failure for the current state (e.g. an async schema). Cached so a
	// repeated read doesn't re-run the validator — which, for a Zod async
	// refinement, would restart and abandon the async work on every access.
	// The flag is separate from the value so that a validator throwing a falsy
	// value (`throw null`) still caches.
	let hasCachedFailure = false;
	let cachedFailure: unknown = null;

	// Per-property subscribers
	const keySubs = new Map<
		keyof T,
		Set<(value: unknown, prev: unknown) => void>
	>();

	function runValidation(
		candidate: T,
	): { valid: boolean; errors: ValidationError[] } {
		const errors: ValidationError[] = [];

		if (schema) {
			const result = schema["~standard"].validate(candidate);
			if (isThenable(result)) {
				throw new TypeError(
					`modelize: schema validation must be synchronous, but the ` +
						`"${schema["~standard"].vendor}" schema returned a Promise. ` +
						`Validation runs inside the synchronous __isValid / __errors / ` +
						`__validate() accessors, so async schemas cannot be supported. ` +
						`Remove the async refinement, or validate outside modelize.`,
				);
			}
			if (result.issues) {
				errors.push(...issuesToValidationErrors(result.issues));
			}
			// NOTE: `result.value` is deliberately discarded — the schema acts
			// as a validator only. See ModelizeOptions.schema.
		}

		if (customValidator) {
			const result = customValidator(candidate);
			if (result !== true) {
				if (typeof result === "string") {
					errors.push({ path: "/", message: result });
				} else if (Array.isArray(result)) {
					errors.push(...result);
				} else {
					throw new TypeError(
						`modelize: the "validate" function must return true, an error ` +
							`message string, or a ValidationError[] — got ` +
							`${result === null ? "null" : typeof result}. ` +
							`A validator that falls through without returning is the ` +
							`usual cause.`,
					);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	function getValidation(): { valid: boolean; errors: ValidationError[] } {
		if (hasCachedFailure) throw cachedFailure;
		if (!cachedValidation) {
			try {
				cachedValidation = runValidation(working);
			} catch (err) {
				hasCachedFailure = true;
				cachedFailure = err;
				throw err;
			}
		}
		return cachedValidation;
	}

	function invalidateValidation() {
		cachedValidation = null;
		hasCachedFailure = false;
		cachedFailure = null;
	}

	function notify() {
		pubsub.publish(CHANGE_EVENT, proxy);
	}

	function notifyKey<K extends keyof T>(key: K, value: T[K], prev: T[K]) {
		const subs = keySubs.get(key);
		if (!subs) return;
		for (const cb of [...subs]) {
			try {
				cb(value, prev);
			} catch (err) {
				// Keep parity with pubsub: surface via console but don't break others.
				// eslint-disable-next-line no-console
				console.error(err);
			}
		}
	}

	// -------------------------------------------------------------------------
	// Proxy handler
	// -------------------------------------------------------------------------
	const handler: ProxyHandler<T> = {
		get(target, prop, receiver) {
			// Private tag for isModelized()
			if (prop === MODELIZED_TAG) return true;

			switch (prop) {
				case "__dirty":
					return dirty;
				case "__isDirty":
					return dirty.size > 0;
				case "__isValid":
					return getValidation().valid;
				case "__source":
					return target;
				case "__initial":
					return initial;
				case "__errors":
					return getValidation().errors;
				case "__validate":
					return () => {
						const { valid, errors } = getValidation();
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
						if (dirty.size === 0) return;
						dirty.clear();
						notify();
					};
				case "__resetToInitial":
					return () => {
						const t = target as Record<string, unknown>;
						const init = initial as Record<string, unknown>;
						let changed = false;

						// Under strict:false, drop keys added after creation.
						if (!strict) {
							for (const key of Object.keys(t)) {
								if (
									!Object.prototype.hasOwnProperty.call(init, key)
								) {
									delete t[key];
									changed = true;
								}
							}
						}

						for (const key in initial) {
							if (
								Object.prototype.hasOwnProperty.call(initial, key)
							) {
								const next = deepClone(init[key]);
								if (t[key] !== next) {
									const prev = t[key];
									t[key] = next;
									changed = true;
									notifyKey(
										key as keyof T,
										next as T[keyof T],
										prev as T[keyof T],
									);
								}
							}
						}

						if (dirty.size > 0) {
							dirty.clear();
							changed = true;
						}

						if (changed) {
							invalidateValidation();
							notify();
						}
					};
				case "__hydrate":
					return (
						data: Partial<T>,
						opts?: { resetDirty?: boolean; validate?: boolean },
					) => {
						const keys = Object.keys(data) as (keyof T)[];

						// 1. Atomic pre-checks before any mutation. Reserved
						// names are rejected here exactly as the `set` trap
						// rejects them, so __hydrate can't smuggle one in.
						for (const k of keys) {
							if (RESERVED_NAMES.has(String(k))) {
								throw new Error(
									`Cannot set reserved property "${String(k)}"`,
								);
							}
						}
						if (strict) {
							for (const k of keys) {
								if (!(k in (target as object))) {
									throw new Error(
										`Property "${
											String(k)
										}" does not exist on model (strict mode enabled)`,
									);
								}
							}
						}

						// 2. Optional pre-apply validation against a candidate state.
						if (opts?.validate) {
							// Mirror the target faithfully: preserve the
							// prototype (class methods, `instanceof`) and copy
							// property descriptors so accessors stay live and
							// recompute from the candidate rather than being
							// frozen at their pre-update values.
							const candidate = Object.create(
								Object.getPrototypeOf(target),
								Object.getOwnPropertyDescriptors(target),
							) as T;
							Object.assign(candidate, data);
							const { valid, errors } = runValidation(candidate);
							if (!valid) {
								throw new ModelizeValidationError(
									"Validation failed",
									errors,
								);
							}
						}

						// 3. Apply.
						const t = target as Record<string, unknown>;
						const changedKeys: {
							key: keyof T;
							prev: unknown;
							next: unknown;
						}[] = [];
						for (const k of keys) {
							const key = k as string;
							const oldValue = t[key];
							const newValue = (data as Record<string, unknown>)[key];
							if (oldValue !== newValue) {
								t[key] = newValue;
								dirty.add(k);
								changedKeys.push({
									key: k,
									prev: oldValue,
									next: newValue,
								});
							}
						}

						let changed = changedKeys.length > 0;
						if (opts?.resetDirty) {
							if (dirty.size > 0) changed = true;
							dirty.clear();
						}

						if (changedKeys.length > 0) invalidateValidation();

						if (changed) {
							for (const { key, prev, next } of changedKeys) {
								notifyKey(
									key,
									next as T[keyof T],
									prev as T[keyof T],
								);
							}
							notify();
						}
					};
				case "subscribe":
					return (callback: (model: Modelized<T>) => void) => {
						if (typeof callback !== "function") {
							throw new TypeError(
								"subscribe(callback): callback must be a function",
							);
						}
						callback(proxy);
						return pubsub.subscribe(CHANGE_EVENT, callback);
					};
				case "subscribeKey":
					return <K extends keyof T>(
						key: K,
						callback: (value: T[K], prev: T[K]) => void,
					) => {
						if (typeof callback !== "function") {
							throw new TypeError(
								"subscribeKey(key, callback): callback must be a function",
							);
						}
						let set = keySubs.get(key);
						if (!set) {
							set = new Set();
							keySubs.set(key, set);
						}
						const cb = callback as (v: unknown, p: unknown) => void;
						set.add(cb);
						return () => {
							const s = keySubs.get(key);
							if (!s) return;
							s.delete(cb);
							if (s.size === 0) keySubs.delete(key);
						};
					};
			}

			return Reflect.get(target, prop, receiver);
		},

		set(target, prop, value, receiver) {
			const key = prop as string;

			if (RESERVED_NAMES.has(key)) {
				throw new Error(`Cannot set reserved property "${key}"`);
			}

			if (strict && !(key in (target as object))) {
				throw new Error(
					`Property "${key}" does not exist on model (strict mode enabled)`,
				);
			}

			const oldValue = (target as Record<string, unknown>)[key];
			const success = Reflect.set(target, prop, value, receiver);

			if (success && oldValue !== value) {
				dirty.add(key as keyof T);
				invalidateValidation();
				notifyKey(
					key as keyof T,
					value as T[keyof T],
					oldValue as T[keyof T],
				);
				notify();
			}

			return success;
		},

		has(target, prop) {
			if (typeof prop === "string" && RESERVED_NAMES.has(prop)) {
				return true;
			}
			if (prop === MODELIZED_TAG) return true;
			return Reflect.has(target, prop);
		},

		deleteProperty(target, prop) {
			if (strict) {
				throw new Error(
					`Cannot delete property "${String(prop)}" (strict mode enabled)`,
				);
			}
			const key = prop as string;
			const existed = Object.prototype.hasOwnProperty.call(target, key);
			const prev = (target as Record<string, unknown>)[key];
			const success = Reflect.deleteProperty(target, prop);
			if (success && existed) {
				dirty.add(key as keyof T);
				invalidateValidation();
				notifyKey(
					key as keyof T,
					undefined as T[keyof T],
					prev as T[keyof T],
				);
				notify();
			}
			return success;
		},
	};

	const proxy = new Proxy(working, handler) as Modelized<T>;
	return proxy;
}
