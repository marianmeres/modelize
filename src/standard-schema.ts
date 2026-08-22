/**
 * The [Standard Schema](https://standardschema.dev) V1 interface, vendored.
 *
 * The spec explicitly encourages copying these types rather than depending on
 * `@standard-schema/spec`, and guarantees no breaking changes without a major
 * version bump. Vendoring keeps `modelize` free of runtime *and* type
 * dependencies while still interoperating with every library that implements
 * the standard (Zod, Valibot, ArkType, yup, joi, …).
 *
 * @module
 */

/**
 * A schema that implements the Standard Schema V1 interface.
 *
 * Any value exposing a `~standard` property of the right shape qualifies —
 * including Zod, Valibot and ArkType schemas.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	/** The Standard Schema properties. */
	readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
	/** The Standard Schema properties interface. */
	export interface Props<Input = unknown, Output = Input> {
		/** The version number of the standard. */
		readonly version: 1;
		/** The vendor name of the schema library. */
		readonly vendor: string;
		/** Validates unknown input values. */
		readonly validate: (
			value: unknown,
			options?: Options | undefined,
		) => Result<Output> | Promise<Result<Output>>;
		/** Inferred types associated with the schema. */
		readonly types?: Types<Input, Output> | undefined;
	}

	/** Vendor-specific validation options. */
	export interface Options {
		/** Explicit support for additional vendor-specific parameters. */
		readonly libraryOptions?: Record<string, unknown> | undefined;
	}

	/** The result of the validate function. */
	export type Result<Output> = SuccessResult<Output> | FailureResult;

	/** The result interface if validation succeeds. */
	export interface SuccessResult<Output> {
		/** The typed output value. */
		readonly value: Output;
		/** A falsy value for `issues` indicates success. */
		readonly issues?: undefined;
	}

	/** The result interface if validation fails. */
	export interface FailureResult {
		/** The issues of failed validation. */
		readonly issues: ReadonlyArray<Issue>;
	}

	/** A single validation issue. */
	export interface Issue {
		/** The error message of the issue. */
		readonly message: string;
		/** The path of the issue, if any. Absent means a root-level issue. */
		readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
	}

	/** The path segment interface of the issue. */
	export interface PathSegment {
		/** The key representing a path segment. */
		readonly key: PropertyKey;
	}

	/** The Standard Schema types interface. */
	export interface Types<Input = unknown, Output = Input> {
		/** The input type of the schema. */
		readonly input: Input;
		/** The output type of the schema. */
		readonly output: Output;
	}

	/** Infers the input type of a Standard Schema. */
	export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
		Schema["~standard"]["types"]
	>["input"];

	/** Infers the output type of a Standard Schema. */
	export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
		Schema["~standard"]["types"]
	>["output"];
}

/**
 * A Standard Schema issue optionally carrying the extra diagnostic fields
 * `modelize` surfaces on `ValidationError`.
 *
 * The Standard Schema spec defines only `message` and `path`; additional
 * properties are structurally permitted and ignored by consumers that don't
 * know about them. The bundled AJV adapter uses this to preserve AJV's
 * `keyword` / `params` without stepping outside the standard.
 */
export interface ModelizeIssue extends StandardSchemaV1.Issue {
	/** The schema keyword that failed (e.g. `"minimum"`, `"required"`). */
	readonly keyword?: string;
	/** Structured information about the failure (e.g. `{ limit: 0 }`). */
	readonly params?: Record<string, unknown>;
}

/**
 * Type guard returning `true` if `x` implements Standard Schema V1.
 *
 * Accepts both objects and functions, because some libraries (notably ArkType)
 * expose callable schemas.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * isStandardSchema(z.object({ a: z.string() })); // true
 * isStandardSchema({ type: "object" });          // false (plain JSON Schema)
 * ```
 */
export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
	if (x === null) return false;
	const type = typeof x;
	// ArkType schemas are callable, so "function" must be accepted too.
	if (type !== "object" && type !== "function") return false;

	let props: unknown;
	try {
		props = (x as Record<string, unknown>)["~standard"];
	} catch {
		// Exotic proxies may throw on property access.
		return false;
	}

	if (props === null || typeof props !== "object") return false;
	const p = props as Record<string, unknown>;
	return p.version === 1 && typeof p.validate === "function";
}

/** Escapes a single JSON Pointer reference token (RFC 6901). */
function escapePointerSegment(key: PropertyKey): string {
	return String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Converts a Standard Schema issue path into a JSON Pointer string, matching
 * the format AJV reports via `instancePath`.
 *
 * Handles all three shapes the spec allows: an absent path (root, `"/"`), bare
 * `PropertyKey` segments, and `{ key }` wrapper objects. Keys containing `/` or
 * `~` are escaped per RFC 6901.
 */
export function issuePathToPointer(
	path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined,
): string {
	if (!path || path.length === 0) return "/";
	let out = "";
	for (const segment of path) {
		const key = typeof segment === "object" && segment !== null
			? (segment as StandardSchemaV1.PathSegment).key
			: segment as PropertyKey;
		out += `/${escapePointerSegment(key)}`;
	}
	return out;
}
