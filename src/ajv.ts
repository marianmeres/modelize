/**
 * @module modelize/ajv
 *
 * JSON Schema support for `modelize`, backed by
 * [AJV](https://ajv.js.org).
 *
 * `modelize`'s core validates through the
 * [Standard Schema](https://standardschema.dev) interface and carries no
 * validation dependency of its own. This module adapts a plain JSON Schema
 * document into a Standard Schema, so JSON Schema users opt into AJV
 * explicitly — and everyone else never pays for it.
 *
 * ```typescript
 * import { modelize } from "@marianmeres/modelize";
 * import { ajvSchema } from "@marianmeres/modelize/ajv";
 *
 * const user = modelize({ age: 25 }, {
 *   schema: ajvSchema({
 *     type: "object",
 *     properties: { age: { type: "number", minimum: 0 } },
 *   }),
 * });
 * ```
 *
 * Importing this module requires `ajv` to be installed. It is declared as an
 * optional peer dependency, so package managers will not install it for you.
 *
 * > **Note:** AJV compiles schemas into JavaScript with `new Function`, so it
 * > cannot run under a Content Security Policy without `unsafe-eval`. In that
 * > environment use a non-codegen Standard Schema validator instead — see the
 * > "Standard Schema" section of the README.
 */

import { Ajv, type ErrorObject } from "ajv";
import type { ModelizeIssue, StandardSchemaV1 } from "./standard-schema.ts";

/**
 * A JSON Schema document, as understood by AJV.
 *
 * The default `Ajv` export supports draft-07 only. For draft 2019-09 / 2020-12, pass an
 * `Ajv2020` instance (from `ajv/dist/2020`) as the second argument to `ajvSchema()`.
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

let defaultAjv: Ajv | null = null;

function getDefaultAjv(): Ajv {
	if (!defaultAjv) defaultAjv = new Ajv({ allErrors: true });
	return defaultAjv;
}

/**
 * Converts a JSON Pointer (AJV's `instancePath`) back into a key array,
 * unescaping RFC 6901 tokens. `~1` must be replaced before `~0`.
 */
function pointerToPath(instancePath: string): PropertyKey[] {
	if (!instancePath) return [];
	return instancePath
		.slice(1)
		.split("/")
		.map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function toIssue(error: ErrorObject): ModelizeIssue {
	return {
		message: error.message || "Unknown validation error",
		path: pointerToPath(error.instancePath),
		keyword: error.keyword,
		params: error.params as Record<string, unknown>,
	};
}

/**
 * Wraps a JSON Schema into a Standard Schema validator backed by AJV, suitable
 * for `modelize`'s `schema` option.
 *
 * The schema is compiled eagerly, so an invalid schema throws here — at the
 * definition site — rather than later from a property read.
 *
 * Validation errors preserve AJV's `keyword` and `params`, which surface on
 * `ValidationError` exactly as they did before v3.
 *
 * @param schema - The JSON Schema document to compile
 * @param ajv - Optional AJV instance. Inject your own to register custom
 *   formats or keywords, to select a newer JSON Schema draft, to relax strict
 *   mode, or to isolate the compiled-schema cache in a long-running process
 *   handling many dynamic schemas. When omitted, a lazily created module-level
 *   singleton configured with `{ allErrors: true }` is used.
 *
 *   Note that this default runs AJV's **strict mode**: it throws on unknown
 *   keywords and on any `format` keyword (no `ajv-formats` is registered).
 *   Pass `new Ajv({ allErrors: true, strict: false })` to relax it.
 *
 * @throws {Error} If AJV cannot compile the schema.
 *
 * @example Custom formats
 * ```typescript
 * import { Ajv } from "ajv";
 * import addFormats from "ajv-formats";
 *
 * const ajv = new Ajv({ allErrors: true });
 * addFormats(ajv);
 *
 * modelize(data, { schema: ajvSchema(mySchema, ajv) });
 * ```
 *
 * @example Typing the schema
 * ```typescript
 * // Purely documentary — the model's type comes from the source object.
 * const schema = ajvSchema<User>(userJsonSchema);
 * ```
 */
export function ajvSchema<T = unknown>(
	schema: JSONSchema,
	ajv?: Ajv,
): StandardSchemaV1<T, T> {
	const validator = (ajv ?? getDefaultAjv()).compile(schema);

	return {
		"~standard": {
			version: 1,
			vendor: "ajv",
			validate(value: unknown): StandardSchemaV1.Result<T> {
				if (validator(value)) return { value: value as T };
				return { issues: (validator.errors ?? []).map(toIssue) };
			},
		},
	};
}
