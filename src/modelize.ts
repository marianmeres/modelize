import { createPubSub } from "@marianmeres/pubsub";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

// Types
export type JSONSchema = Record<string, unknown>;

export interface ModelizeOptions<T extends object> {
	/** JSON Schema for validation */
	schema?: JSONSchema;
	/** Custom validator function - return true if valid, or error message string */
	validate?: (model: T) => true | string;
	/** If false, allow properties not present in original source (default: true) */
	strict?: boolean;
}

export interface ValidationError {
	path: string;
	message: string;
}

export class ModelizeValidationError extends Error {
	constructor(
		message: string,
		public errors: ValidationError[] = [],
	) {
		super(message);
		this.name = "ModelizeValidationError";
	}
}

export interface ModelizedMethods<T extends object> {
	/** Set of dirty property keys (empty when clean) */
	readonly __dirty: Set<keyof T>;
	/** True if any property has been modified */
	readonly __isDirty: boolean;
	/** True if model passes validation (non-throwing check) */
	readonly __isValid: boolean;
	/** The original unwrapped source object */
	readonly __source: T;
	/** Initial snapshot for reset */
	readonly __initial: T;
	/** Last validation errors (empty if valid) */
	readonly __errors: ValidationError[];
	/** Validate the model - throws ModelizeValidationError if invalid, returns true if valid */
	__validate(): true;
	/** Clear dirty state */
	__reset(): void;
	/** Reset all properties to initial values and clear dirty state */
	__resetToInitial(): void;
	/** Bulk update properties */
	__hydrate(data: Partial<T>, options?: { resetDirty?: boolean }): void;
	/** Svelte-compatible subscribe */
	subscribe(callback: (model: Modelized<T>) => void): () => void;
}

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

// Reserved method names that cannot be used as model properties
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
 * Wraps a source object with a proxy that tracks changes, supports validation,
 * and provides a Svelte-compatible subscribe method.
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
