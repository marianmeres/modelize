import { assert, assertEquals, assertThrows } from "@std/assert";
import {
	isModelized,
	isStandardSchema,
	modelize,
	ModelizeValidationError,
	type StandardSchemaV1,
	type ValidationError,
} from "../src/mod.ts";
import { ajvSchema } from "../src/ajv.ts";

// -----------------------------------------------------------------------------
// Basic proxy behavior
// -----------------------------------------------------------------------------

Deno.test("wraps object and preserves property access", () => {
	const source = { name: "John", age: 30 };
	const model = modelize(source);

	assertEquals(model.name, "John");
	assertEquals(model.age, 30);
});

Deno.test("allows setting properties", () => {
	const source = { name: "John" };
	const model = modelize(source);

	model.name = "Jane";
	assertEquals(model.name, "Jane");
});

Deno.test("modifications reflect on source", () => {
	const source = { name: "John" };
	const model = modelize(source);

	model.name = "Jane";
	assertEquals(source.name, "Jane");
	assertEquals(model.__source, source);
});

// -----------------------------------------------------------------------------
// Dirty tracking
// -----------------------------------------------------------------------------

Deno.test("__dirty is empty Set initially", () => {
	const model = modelize({ name: "John" });

	assert(model.__dirty instanceof Set);
	assertEquals(model.__dirty.size, 0);
});

Deno.test("__isDirty is false initially", () => {
	const model = modelize({ name: "John" });

	assertEquals(model.__isDirty, false);
});

Deno.test("tracks dirty properties after modification", () => {
	const model = modelize({ name: "John", age: 30 });

	model.name = "Jane";

	assertEquals(model.__isDirty, true);
	assert(model.__dirty.has("name"));
	assertEquals(model.__dirty.size, 1);
});

Deno.test("does not mark dirty if value unchanged", () => {
	const model = modelize({ name: "John" });

	model.name = "John"; // same value

	assertEquals(model.__isDirty, false);
	assertEquals(model.__dirty.size, 0);
});

Deno.test("__reset clears dirty state", () => {
	const model = modelize({ name: "John" });

	model.name = "Jane";
	assertEquals(model.__isDirty, true);

	model.__reset();

	assertEquals(model.__isDirty, false);
	assertEquals(model.__dirty.size, 0);
	assertEquals(model.name, "Jane"); // value preserved
});

// -----------------------------------------------------------------------------
// Reset to initial
// -----------------------------------------------------------------------------

Deno.test("__initial holds deep clone of original values", () => {
	const source = { name: "John", nested: { value: 1 } };
	const model = modelize(source);

	model.name = "Jane";
	source.nested.value = 999;

	assertEquals(model.__initial.name, "John");
	assertEquals(model.__initial.nested.value, 1); // deep cloned
});

Deno.test("__resetToInitial restores original values", () => {
	const model = modelize({ name: "John", age: 30 });

	model.name = "Jane";
	model.age = 40;

	assertEquals(model.__isDirty, true);

	model.__resetToInitial();

	assertEquals(model.name, "John");
	assertEquals(model.age, 30);
	assertEquals(model.__isDirty, false);
});

Deno.test("__resetToInitial deep clones nested objects", () => {
	const model = modelize({ data: { value: 1 } });

	model.data.value = 999;
	model.__resetToInitial();

	assertEquals(model.data.value, 1);
});

// -----------------------------------------------------------------------------
// Hydrate
// -----------------------------------------------------------------------------

Deno.test("__hydrate updates multiple properties", () => {
	const model = modelize({ name: "John", age: 30, city: "NYC" });

	model.__hydrate({ name: "Jane", age: 25 });

	assertEquals(model.name, "Jane");
	assertEquals(model.age, 25);
	assertEquals(model.city, "NYC"); // unchanged
});

Deno.test("__hydrate marks changed properties as dirty", () => {
	const model = modelize({ name: "John", age: 30 });

	model.__hydrate({ name: "Jane" });

	assert(model.__dirty.has("name"));
	assertEquals(model.__dirty.has("age"), false);
});

Deno.test("__hydrate with resetDirty clears dirty state", () => {
	const model = modelize({ name: "John", age: 30 });

	model.name = "Modified";
	model.__hydrate({ age: 25 }, { resetDirty: true });

	assertEquals(model.__isDirty, false);
});

Deno.test("__hydrate throws for unknown props in strict mode", () => {
	const model = modelize({ name: "John" });

	assertThrows(
		() => model.__hydrate({ unknown: "value" } as any),
		Error,
		"does not exist on model",
	);
});

Deno.test("__hydrate allows unknown props when strict: false", () => {
	const model = modelize({ name: "John" }, { strict: false });

	model.__hydrate({ extra: "value" } as any);

	assertEquals((model as any).extra, "value");
});

// -----------------------------------------------------------------------------
// Strict mode
// -----------------------------------------------------------------------------

Deno.test("strict mode prevents adding new properties", () => {
	const model = modelize({ name: "John" });

	assertThrows(
		() => {
			(model as any).newProp = "value";
		},
		Error,
		"does not exist on model",
	);
});

Deno.test("strict: false allows adding new properties", () => {
	const model = modelize({ name: "John" }, { strict: false });

	(model as any).newProp = "value";

	assertEquals((model as any).newProp, "value");
});

Deno.test("strict mode prevents deleting properties", () => {
	const model = modelize({ name: "John" });

	assertThrows(
		() => {
			delete (model as any).name;
		},
		Error,
		"strict mode enabled",
	);
});

// -----------------------------------------------------------------------------
// Validation - JSON Schema
// -----------------------------------------------------------------------------

Deno.test("__isValid returns true when no validation configured", () => {
	const model = modelize({ name: "John" });

	assertEquals(model.__isValid, true);
});

Deno.test("__validate returns true when no validation configured", () => {
	const model = modelize({ name: "John" });

	assertEquals(model.__validate(), true);
});

Deno.test("JSON schema validation passes for valid data", () => {
	const model = modelize(
		{ age: 25 },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			}),
		},
	);

	assertEquals(model.__isValid, true);
});

Deno.test("JSON schema validation fails for invalid data", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			}),
		},
	);

	assertEquals(model.__isValid, false);
	assert(model.__errors.length > 0);
});

Deno.test("__validate throws ModelizeValidationError for invalid data", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			}),
		},
	);

	assertThrows(
		() => model.__validate(),
		ModelizeValidationError,
		"Validation failed",
	);
});

Deno.test("validation error contains field-level details", () => {
	const model = modelize(
		{ age: -5, name: 123 },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
					name: { type: "string" },
				},
			}),
		},
	);

	try {
		model.__validate();
		assert(false, "Should have thrown");
	} catch (e) {
		assert(e instanceof ModelizeValidationError);
		assert(e.errors.length >= 1);
		assert(
			e.errors.some(
				(err) => err.path.includes("age") || err.message.includes("minimum"),
			),
		);
	}
});

// -----------------------------------------------------------------------------
// Validation - Custom validator
// -----------------------------------------------------------------------------

Deno.test("custom validator passes when returning true", () => {
	const model = modelize(
		{ password: "secret", confirmPassword: "secret" },
		{
			validate: (m) =>
				m.password === m.confirmPassword ? true : "Passwords must match",
		},
	);

	assertEquals(model.__isValid, true);
});

Deno.test("custom validator fails when returning error message", () => {
	const model = modelize(
		{ password: "secret", confirmPassword: "different" },
		{
			validate: (m) =>
				m.password === m.confirmPassword ? true : "Passwords must match",
		},
	);

	assertEquals(model.__isValid, false);
	assertEquals(model.__errors[0].message, "Passwords must match");
});

Deno.test("both schema and custom validator can be used together", () => {
	const model = modelize(
		{ age: 25, status: "invalid" },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			}),
			validate: (m) =>
				m.status === "active" || m.status === "inactive"
					? true
					: "Status must be active or inactive",
		},
	);

	assertEquals(model.__isValid, false);
	// Should have custom validator error
	assert(model.__errors.some((e) => e.message.includes("Status")));
});

// -----------------------------------------------------------------------------
// Subscribe (Svelte-compatible)
// -----------------------------------------------------------------------------

Deno.test("subscribe calls callback immediately with current value", () => {
	const model = modelize({ name: "John" });
	let callCount = 0;
	let receivedValue: any = null;

	model.subscribe((m) => {
		callCount++;
		receivedValue = m;
	});

	assertEquals(callCount, 1);
	assertEquals(receivedValue.name, "John");
});

Deno.test("subscribe calls callback on property change", () => {
	const model = modelize({ name: "John" });
	let callCount = 0;

	model.subscribe(() => {
		callCount++;
	});

	assertEquals(callCount, 1); // initial call

	model.name = "Jane";

	assertEquals(callCount, 2);
});

Deno.test("subscribe returns unsubscribe function", () => {
	const model = modelize({ name: "John" });
	let callCount = 0;

	const unsubscribe = model.subscribe(() => {
		callCount++;
	});

	assertEquals(callCount, 1);

	unsubscribe();
	model.name = "Jane";

	assertEquals(callCount, 1); // no additional calls
});

Deno.test("multiple subscribers all receive updates", () => {
	const model = modelize({ name: "John" });
	let count1 = 0;
	let count2 = 0;

	model.subscribe(() => count1++);
	model.subscribe(() => count2++);

	model.name = "Jane";

	assertEquals(count1, 2); // initial + change
	assertEquals(count2, 2);
});

Deno.test("__reset triggers subscriber notification", () => {
	const model = modelize({ name: "John" });
	let callCount = 0;

	model.subscribe(() => callCount++);
	model.name = "Jane";
	model.__reset();

	assertEquals(callCount, 3); // initial + change + reset
});

Deno.test("__hydrate triggers single notification", () => {
	const model = modelize({ name: "John", age: 30 });
	let callCount = 0;

	model.subscribe(() => callCount++);
	model.__hydrate({ name: "Jane", age: 25 });

	assertEquals(callCount, 2); // initial + hydrate (single notification)
});

// -----------------------------------------------------------------------------
// Reserved property names
// -----------------------------------------------------------------------------

Deno.test("throws when source has reserved property name", () => {
	assertThrows(() => modelize({ __dirty: "value" } as any), Error, "reserved");
});

Deno.test("cannot set reserved property", () => {
	const model = modelize({ name: "John" });

	assertThrows(
		() => {
			(model as any).__dirty = new Set();
		},
		Error,
		"reserved",
	);
});

// -----------------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------------

Deno.test("works with empty object", () => {
	const model = modelize({});

	assertEquals(model.__isDirty, false);
	assertEquals(model.__isValid, true);
});

Deno.test("works with nested objects", () => {
	const model = modelize({ user: { name: "John" } });

	model.user.name = "Jane";

	// Note: nested changes don't trigger dirty on parent (shallow tracking)
	assertEquals(model.__isDirty, false);
	assertEquals(model.user.name, "Jane");
});

Deno.test("works with arrays", () => {
	const model = modelize({ items: [1, 2, 3] });

	model.items.push(4);

	// Array mutation doesn't trigger dirty (shallow tracking)
	assertEquals(model.__isDirty, false);
	assertEquals(model.items.length, 4);
});

Deno.test("replacing array marks as dirty", () => {
	const model = modelize({ items: [1, 2, 3] });

	model.items = [4, 5, 6];

	assertEquals(model.__isDirty, true);
	assert(model.__dirty.has("items"));
});

Deno.test("JSON.stringify works correctly", () => {
	const model = modelize({ name: "John", age: 30 });

	const json = JSON.stringify(model);

	assertEquals(json, '{"name":"John","age":30}');
});

Deno.test("Object.keys returns source keys only", () => {
	const model = modelize({ name: "John", age: 30 });

	const keys = Object.keys(model);

	assertEquals(keys.sort(), ["age", "name"]);
});

// -----------------------------------------------------------------------------
// Regression: __hydrate atomicity (strict mode)
// -----------------------------------------------------------------------------

Deno.test("__hydrate is atomic under strict: unknown key rejects before mutation", () => {
	const model = modelize({ name: "John", age: 30 });

	assertThrows(
		() =>
			model.__hydrate({
				name: "Jane",
				bogus: "x",
			} as never),
		Error,
		"does not exist on model",
	);

	// Neither legal nor illegal keys should have been applied.
	assertEquals(model.name, "John");
	assertEquals(model.age, 30);
	assertEquals(model.__isDirty, false);
});

Deno.test("__hydrate({ validate: true }) rejects invalid candidate without mutation", () => {
	const model = modelize(
		{ age: 10 },
		{
			schema: ajvSchema({
				type: "object",
				properties: { age: { type: "number", minimum: 0 } },
			}),
		},
	);

	assertThrows(
		() => model.__hydrate({ age: -5 }, { validate: true }),
		ModelizeValidationError,
	);

	assertEquals(model.age, 10); // unchanged
	assertEquals(model.__isDirty, false);
});

Deno.test("__hydrate({ validate: true }) applies when valid", () => {
	const model = modelize(
		{ age: 10 },
		{
			schema: ajvSchema({
				type: "object",
				properties: { age: { type: "number", minimum: 0 } },
			}),
		},
	);

	model.__hydrate({ age: 20 }, { validate: true });
	assertEquals(model.age, 20);
	assert(model.__dirty.has("age"));
});

// -----------------------------------------------------------------------------
// Regression: __hydrate notification gating
// -----------------------------------------------------------------------------

Deno.test("__hydrate does NOT notify when nothing changed", () => {
	const model = modelize({ name: "John", age: 30 });
	let calls = 0;
	model.subscribe(() => calls++);

	// Initial call only.
	assertEquals(calls, 1);

	model.__hydrate({ name: "John" }); // same value
	assertEquals(calls, 1);

	model.__hydrate({}); // empty
	assertEquals(calls, 1);
});

// -----------------------------------------------------------------------------
// Regression: __reset / __resetToInitial notification gating
// -----------------------------------------------------------------------------

Deno.test("__reset does NOT notify when already clean", () => {
	const model = modelize({ name: "John" });
	let calls = 0;
	model.subscribe(() => calls++);

	assertEquals(calls, 1);

	model.__reset(); // already clean
	assertEquals(calls, 1);
});

Deno.test("__resetToInitial does NOT notify when already at initial", () => {
	const model = modelize({ name: "John" });
	let calls = 0;
	model.subscribe(() => calls++);

	assertEquals(calls, 1);

	model.__resetToInitial();
	assertEquals(calls, 1);
});

// -----------------------------------------------------------------------------
// Regression: __resetToInitial with non-strict extras
// -----------------------------------------------------------------------------

Deno.test("__resetToInitial removes extra keys in non-strict mode", () => {
	const model = modelize({ name: "John" }, { strict: false });
	(model as any).extra = "value";

	assertEquals((model as any).extra, "value");

	model.__resetToInitial();

	assertEquals((model as any).extra, undefined);
	assertEquals(Object.keys(model).sort(), ["name"]);
	assertEquals(model.__isDirty, false);
});

// -----------------------------------------------------------------------------
// Regression: delete marks dirty (non-strict mode)
// -----------------------------------------------------------------------------

Deno.test("delete marks property dirty in non-strict mode", () => {
	const model = modelize({ name: "John" }, { strict: false });

	delete (model as any).name;

	assert(model.__dirty.has("name"));
	assertEquals(model.__isDirty, true);
});

Deno.test("delete of non-existent property does not notify or mark dirty", () => {
	const model = modelize({ name: "John" }, { strict: false });
	let calls = 0;
	model.subscribe(() => calls++);

	delete (model as any).nonExistent;

	assertEquals(calls, 1); // only initial
	assertEquals(model.__isDirty, false);
});

// -----------------------------------------------------------------------------
// Regression: `has` trap for reserved names
// -----------------------------------------------------------------------------

Deno.test("'in' operator returns true for reserved names", () => {
	const model = modelize({ name: "John" });

	assert("__dirty" in model);
	assert("__isDirty" in model);
	assert("__isValid" in model);
	assert("__source" in model);
	assert("__initial" in model);
	assert("__errors" in model);
	assert("__validate" in model);
	assert("__reset" in model);
	assert("__resetToInitial" in model);
	assert("__hydrate" in model);
	assert("subscribe" in model);
	assert("subscribeKey" in model);

	assert("name" in model);
	assert(!("missing" in model));
});

// -----------------------------------------------------------------------------
// Regression: __errors auto-refreshes
// -----------------------------------------------------------------------------

Deno.test("__errors is consistent with current state without calling __isValid first", () => {
	const model = modelize(
		{ age: 10 },
		{
			schema: ajvSchema({
				type: "object",
				properties: { age: { type: "number", minimum: 0 } },
			}),
		},
	);

	// Initially valid.
	assertEquals(model.__errors, []);

	model.age = -5;
	// Accessing __errors directly (without __isValid) should reflect current state.
	assert(model.__errors.length > 0);
});

Deno.test("__errors exposes AJV keyword and params", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: ajvSchema({
				type: "object",
				properties: { age: { type: "number", minimum: 0 } },
			}),
		},
	);

	const errs = model.__errors;
	assert(errs.length > 0);
	assertEquals(errs[0].keyword, "minimum");
	assert(errs[0].params && typeof errs[0].params === "object");
});

// -----------------------------------------------------------------------------
// ModelizeValidationError
// -----------------------------------------------------------------------------

Deno.test("ModelizeValidationError.errors is readonly at type level", () => {
	const err = new ModelizeValidationError("msg", [{ path: "/", message: "x" }]);
	// @ts-expect-error readonly
	err.errors = [];
	// Runtime still allows it (JS has no hard readonly), but the contract is documented.
	// Ensure errors array is propagated correctly.
	assertEquals(err.name, "ModelizeValidationError");
});

// -----------------------------------------------------------------------------
// Deep clone: Date, Map, Set, cycles
// -----------------------------------------------------------------------------

Deno.test("__initial preserves Date values via structuredClone", () => {
	const now = new Date("2024-01-01T00:00:00Z");
	const model = modelize({ at: now });

	model.at = new Date("2030-01-01T00:00:00Z");
	model.__resetToInitial();

	assert(model.at instanceof Date);
	assertEquals(model.at.getTime(), now.getTime());
});

Deno.test("__resetToInitial restores Map/Set values", () => {
	const model = modelize({
		tags: new Set(["a", "b"]),
		meta: new Map([["k", 1]]),
	});

	model.tags = new Set(["x"]);
	model.meta = new Map([["other", 2]]);

	model.__resetToInitial();

	assert(model.tags instanceof Set);
	assertEquals([...model.tags].sort(), ["a", "b"]);
	assert(model.meta instanceof Map);
	assertEquals(model.meta.get("k"), 1);
});

// -----------------------------------------------------------------------------
// clone option
// -----------------------------------------------------------------------------

Deno.test("{ clone: true } does not mutate caller's source", () => {
	const source = { name: "John", age: 30 };
	const model = modelize(source, { clone: true });

	model.name = "Jane";

	assertEquals(source.name, "John"); // not mutated
	assert(model.__source !== source); // internal clone
	assertEquals(model.__source.name, "Jane");
});

// -----------------------------------------------------------------------------
// subscribeKey
// -----------------------------------------------------------------------------

Deno.test("subscribeKey fires only for the watched key", () => {
	const model = modelize({ name: "John", age: 30 });

	const nameChanges: [string, string][] = [];
	const ageChanges: [number, number][] = [];

	model.subscribeKey("name", (v, p) => nameChanges.push([v, p]));
	model.subscribeKey("age", (v, p) => ageChanges.push([v, p]));

	model.name = "Jane";
	assertEquals(nameChanges, [["Jane", "John"]]);
	assertEquals(ageChanges, []);

	model.age = 31;
	assertEquals(nameChanges.length, 1);
	assertEquals(ageChanges, [[31, 30]]);
});

Deno.test("subscribeKey unsubscribes cleanly", () => {
	const model = modelize({ name: "John" });
	let calls = 0;
	const off = model.subscribeKey("name", () => calls++);

	model.name = "A";
	off();
	model.name = "B";

	assertEquals(calls, 1);
});

Deno.test("subscribeKey fires on __hydrate for changed keys only", () => {
	const model = modelize({ name: "John", age: 30 });
	let nameCalls = 0;
	let ageCalls = 0;
	model.subscribeKey("name", () => nameCalls++);
	model.subscribeKey("age", () => ageCalls++);

	model.__hydrate({ name: "Jane" });

	assertEquals(nameCalls, 1);
	assertEquals(ageCalls, 0);
});

// -----------------------------------------------------------------------------
// isModelized
// -----------------------------------------------------------------------------

Deno.test("isModelized identifies proxies from modelize()", () => {
	const model = modelize({ name: "John" });
	assert(isModelized(model));
	assert(!isModelized({ name: "John" }));
	assert(!isModelized(null));
	assert(!isModelized(undefined));
	assert(!isModelized(42));
});

// -----------------------------------------------------------------------------
// AJV adapter
// -----------------------------------------------------------------------------

Deno.test("ajvSchema uses the injected Ajv instance", async () => {
	const { Ajv } = await import("ajv");
	const ajv = new Ajv({ allErrors: true });
	let compileCalls = 0;
	const origCompile = ajv.compile.bind(ajv);
	ajv.compile = ((schema: unknown) => {
		compileCalls++;
		return origCompile(schema as any);
	}) as typeof ajv.compile;

	const model = modelize(
		{ age: -5 },
		{
			schema: ajvSchema({
				type: "object",
				properties: { age: { type: "number", minimum: 0 } },
			}, ajv),
		},
	);

	assertEquals(model.__isValid, false);
	assertEquals(compileCalls, 1);
});

Deno.test("ajvSchema is a Standard Schema", () => {
	const schema = ajvSchema({ type: "object" });

	assert(isStandardSchema(schema));
	assertEquals(schema["~standard"].version, 1);
	assertEquals(schema["~standard"].vendor, "ajv");
});

Deno.test("ajvSchema compiles eagerly and throws on an invalid schema", () => {
	assertThrows(() => ajvSchema({ type: "not-a-real-type" }));
});

Deno.test("ajvSchema round-trips JSON Pointer escaping for exotic keys", () => {
	// AJV reports instancePath "/a~1b" for the key "a/b"; modelize must
	// reconstruct exactly that pointer from the Standard Schema path array.
	const model = modelize(
		{ "a/b": "x", "c~d": "y" },
		{
			schema: ajvSchema({
				type: "object",
				properties: {
					"a/b": { type: "number" },
					"c~d": { type: "number" },
				},
			}),
		},
	);

	const paths = model.__errors.map((e) => e.path).sort();
	assertEquals(paths, ["/a~1b", "/c~0d"]);
});

Deno.test("ajvSchema reports root-level errors as '/'", () => {
	const model = modelize(
		{ a: 1 },
		{ schema: ajvSchema({ type: "object", maxProperties: 0 }) },
	);

	assertEquals(model.__isValid, false);
	assertEquals(model.__errors[0].path, "/");
});

// -----------------------------------------------------------------------------
// Validation caching / lazy re-validation
// -----------------------------------------------------------------------------

Deno.test("validation is cached and invalidated on mutation", () => {
	let customRuns = 0;
	const model = modelize(
		{ age: 10 },
		{
			validate: (m) => {
				customRuns++;
				return m.age >= 0 ? true : "negative";
			},
		},
	);

	model.__isValid;
	model.__isValid;
	model.__errors;
	assertEquals(customRuns, 1); // cached across 3 reads

	model.age = 20; // mutation invalidates cache
	model.__isValid;
	assertEquals(customRuns, 2);
});

// -----------------------------------------------------------------------------
// Standard Schema — detection
// -----------------------------------------------------------------------------

/** Minimal hand-rolled Standard Schema, for exercising exact issue shapes. */
function stdSchema(
	validate: StandardSchemaV1.Props["validate"],
	vendor = "test",
): StandardSchemaV1 {
	return { "~standard": { version: 1, vendor, validate } };
}

Deno.test("isStandardSchema accepts a conforming object", () => {
	assert(isStandardSchema(stdSchema(() => ({ value: 1 }))));
});

Deno.test("isStandardSchema accepts a callable schema (ArkType style)", () => {
	// ArkType schemas are functions, not plain objects.
	const callable = Object.assign(() => {}, {
		"~standard": { version: 1, vendor: "arktype", validate: () => ({ value: 1 }) },
	});

	assert(isStandardSchema(callable));
});

Deno.test("isStandardSchema rejects non-schemas", () => {
	assert(!isStandardSchema(null));
	assert(!isStandardSchema(undefined));
	assert(!isStandardSchema(42));
	assert(!isStandardSchema({ type: "object" })); // plain JSON Schema
	assert(!isStandardSchema({ "~standard": { version: 2, validate: () => {} } }));
	assert(!isStandardSchema({ "~standard": { version: 1 } })); // no validate
	assert(!isStandardSchema({ "~standard": null }));
});

Deno.test("modelize throws at call time for a plain JSON Schema", () => {
	assertThrows(
		// deno-lint-ignore no-explicit-any
		() => modelize({ age: 1 }, { schema: { type: "object" } as any }),
		TypeError,
		"ajvSchema",
	);
});

// -----------------------------------------------------------------------------
// Standard Schema — validation & issue mapping
// -----------------------------------------------------------------------------

Deno.test("validates through a Standard Schema", () => {
	const schema = stdSchema((value) => {
		const v = value as { age: number };
		return v.age >= 0
			? { value: v }
			: { issues: [{ message: "must be >= 0", path: ["age"] }] };
	});

	const model = modelize({ age: 25 }, { schema });
	assertEquals(model.__isValid, true);

	model.age = -5;
	assertEquals(model.__isValid, false);
	assertEquals(model.__errors, [{ path: "/age", message: "must be >= 0" }]);
});

Deno.test("maps nested issue paths to JSON pointers", () => {
	const schema = stdSchema(() => ({
		issues: [{ message: "bad", path: ["address", "city"] }],
	}));

	const model = modelize({ address: { city: "" } }, { schema });
	assertEquals(model.__errors[0].path, "/address/city");
});

Deno.test("maps { key } path segment objects", () => {
	const schema = stdSchema(() => ({
		issues: [{ message: "bad", path: [{ key: "items" }, { key: 0 }, "name"] }],
	}));

	const model = modelize({ items: [] }, { schema });
	assertEquals(model.__errors[0].path, "/items/0/name");
});

Deno.test("maps an absent or empty issue path to root", () => {
	const noPath = modelize({ a: 1 }, {
		schema: stdSchema(() => ({ issues: [{ message: "root" }] })),
	});
	assertEquals(noPath.__errors[0].path, "/");

	const emptyPath = modelize({ a: 1 }, {
		schema: stdSchema(() => ({ issues: [{ message: "root", path: [] }] })),
	});
	assertEquals(emptyPath.__errors[0].path, "/");
});

Deno.test("escapes '/' and '~' in issue path segments", () => {
	const schema = stdSchema(() => ({
		issues: [{ message: "bad", path: ["a/b", "c~d"] }],
	}));

	const model = modelize({ a: 1 }, { schema });
	assertEquals(model.__errors[0].path, "/a~1b/c~0d");
});

Deno.test("stringifies symbol path segments without throwing", () => {
	const sym = Symbol("secret");
	const schema = stdSchema(() => ({
		issues: [{ message: "bad", path: [sym, { key: 1 }] }],
	}));

	const model = modelize({ a: 1 }, { schema });
	assertEquals(model.__errors[0].path, "/Symbol(secret)/1");
});

Deno.test("Standard Schema errors carry no keyword/params", () => {
	const schema = stdSchema(() => ({ issues: [{ message: "bad" }] }));
	const model = modelize({ a: 1 }, { schema });

	assertEquals(model.__errors[0].keyword, undefined);
	assertEquals(model.__errors[0].params, undefined);
	assert(!("keyword" in model.__errors[0]));
});

Deno.test("schema and custom validator combine, schema errors first", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: stdSchema(() => ({ issues: [{ message: "schema error" }] })),
			validate: () => "custom error",
		},
	);

	assertEquals(model.__errors.length, 2);
	assertEquals(model.__errors[0].message, "schema error");
	assertEquals(model.__errors[1].message, "custom error");
});

Deno.test("__hydrate({ validate: true }) works with a Standard Schema", () => {
	const schema = stdSchema((value) => {
		const v = value as { age: number };
		return v.age >= 0
			? { value: v }
			: { issues: [{ message: "neg", path: ["age"] }] };
	});
	const model = modelize({ age: 10 }, { schema });

	assertThrows(
		() => model.__hydrate({ age: -1 }, { validate: true }),
		ModelizeValidationError,
	);
	assertEquals(model.age, 10);

	model.__hydrate({ age: 20 }, { validate: true });
	assertEquals(model.age, 20);
});

// -----------------------------------------------------------------------------
// Standard Schema — async rejection
// -----------------------------------------------------------------------------

Deno.test("throws a TypeError when the schema validates asynchronously", () => {
	const schema = stdSchema(() => Promise.resolve({ value: 1 }), "zod");
	const model = modelize({ a: 1 }, { schema });

	assertThrows(() => model.__isValid, TypeError, "must be synchronous");
	assertThrows(() => model.__isValid, TypeError, "zod");
});

Deno.test("async failure is cached per state and re-checked after mutation", () => {
	let calls = 0;
	const schema = stdSchema(() => {
		calls++;
		return Promise.resolve({ value: 1 });
	});
	const model = modelize({ a: 1 }, { schema });

	assertThrows(() => model.__isValid, TypeError);
	assertThrows(() => model.__errors, TypeError);
	assertThrows(() => model.__validate(), TypeError);
	assertEquals(calls, 1); // not re-run for the same state

	model.a = 2;
	assertThrows(() => model.__isValid, TypeError);
	assertEquals(calls, 2); // re-checked after mutation
});

// -----------------------------------------------------------------------------
// Custom validator returning ValidationError[]
// -----------------------------------------------------------------------------

Deno.test("custom validator can return field-level errors", () => {
	const model = modelize(
		{ email: "nope", age: -1 },
		{
			validate: (m) => {
				const errors: ValidationError[] = [];
				if (!m.email.includes("@")) {
					errors.push({ path: "/email", message: "Invalid email" });
				}
				if (m.age < 0) errors.push({ path: "/age", message: "Must be >= 0" });
				return errors.length ? errors : true;
			},
		},
	);

	assertEquals(model.__isValid, false);
	assertEquals(model.__errors.length, 2);
	assertEquals(model.__errors[0].path, "/email");
	assertEquals(model.__errors[1].path, "/age");
});

Deno.test("custom validator returning an empty array means valid", () => {
	const model = modelize({ a: 1 }, { validate: () => [] });

	assertEquals(model.__isValid, true);
	assertEquals(model.__errors, []);
});

Deno.test("custom validator errors pass through keyword/params untouched", () => {
	const model = modelize({ a: 1 }, {
		validate: () => [
			{ path: "/a", message: "x", keyword: "custom", params: { n: 1 } },
		],
	});

	assertEquals(model.__errors[0].keyword, "custom");
	assertEquals(model.__errors[0].params, { n: 1 });
});

// -----------------------------------------------------------------------------
// Standard Schema — real-library interop (Zod)
// -----------------------------------------------------------------------------

Deno.test("interops with a real Zod schema", async () => {
	const z = await import("zod");
	const model = modelize({ name: "", age: -1 }, {
		schema: z.object({ name: z.string().min(1), age: z.number().min(0) }),
	});

	assertEquals(model.__isValid, false);
	assertEquals(model.__errors.map((e) => e.path).sort(), ["/age", "/name"]);

	model.name = "John";
	model.age = 30;
	assertEquals(model.__isValid, true);
	assertEquals(model.__errors, []);
});

Deno.test("maps nested Zod issue paths to JSON pointers", async () => {
	const z = await import("zod");
	const model = modelize({ items: [{ name: "" }] }, {
		schema: z.object({ items: z.array(z.object({ name: z.string().min(1) })) }),
	});

	assertEquals(model.__errors[0].path, "/items/0/name");
});

Deno.test("Zod coercion is checked but NOT written back to the model", async () => {
	const z = await import("zod");
	const model = modelize({ age: "42" }, {
		schema: z.object({ age: z.coerce.number() }),
	});

	// The schema accepts it (it coerces), but the model keeps the raw string.
	assertEquals(model.__isValid, true);
	assertEquals(model.age, "42");
});

Deno.test("Zod defaults are checked but do not add keys to the model", async () => {
	const z = await import("zod");
	const model = modelize({ a: "y" }, {
		schema: z.object({ a: z.string(), b: z.string().default("x") }),
	});

	assertEquals(model.__isValid, true);
	assertEquals((model as unknown as Record<string, unknown>).b, undefined);
	assert(!("b" in model.__source));
});

Deno.test("a Zod async refinement throws instead of validating", async () => {
	const z = await import("zod");
	const model = modelize({ a: "x" }, {
		schema: z.object({
			a: z.string().refine(() => Promise.resolve(true), "nope"),
		}),
	});

	assertThrows(() => model.__isValid, TypeError, "must be synchronous");
});

// -----------------------------------------------------------------------------
// Regression: robustness of the validation contract
// -----------------------------------------------------------------------------

Deno.test("rejects a non-native thenable, not just Promise instances", () => {
	// A thenable from another realm / custom Promise impl must not be mistaken
	// for a success result.
	const thenable = { then: (r: (v: unknown) => void) => r({ value: 1 }) };
	const model = modelize({ a: 1 }, {
		schema: stdSchema(() => thenable as unknown as { value: unknown }, "custom"),
	});

	assertThrows(() => model.__isValid, TypeError, "must be synchronous");
});

Deno.test("custom validator returning an invalid type throws a clear error", () => {
	for (const bad of [undefined, false, 42, null, {}]) {
		const model = modelize({ a: 1 }, {
			// deno-lint-ignore no-explicit-any
			validate: (() => bad) as any,
		});
		assertThrows(() => model.__isValid, TypeError, "must return true");
	}
});

Deno.test("sticky failure cache works for a falsy thrown value", () => {
	let calls = 0;
	const model = modelize({ a: 1 }, {
		validate: () => {
			calls++;
			throw null;
		},
	});

	assertThrows(() => model.__isValid);
	assertThrows(() => model.__errors);
	assertEquals(calls, 1); // cached despite `null` being falsy
});

Deno.test("__hydrate({ validate: true }) candidate keeps prototype and live getters", () => {
	class Person {
		constructor(public first: string, public last: string) {}
		get full(): string {
			return `${this.first} ${this.last}`;
		}
	}
	const seen: { isPerson: boolean; full: string }[] = [];

	const model = modelize(new Person("Al", "Bo"), {
		validate: (m) => {
			seen.push({ isPerson: m instanceof Person, full: m.full });
			return true;
		},
	});

	model.__hydrate({ first: "Cy" }, { validate: true });

	// The candidate must be a Person whose getter reflects the CANDIDATE state.
	assertEquals(seen.at(-1), { isPerson: true, full: "Cy Bo" });
});

Deno.test("__hydrate rejects reserved property names", () => {
	const model = modelize({ a: 1 }, { strict: false });

	assertThrows(
		// deno-lint-ignore no-explicit-any
		() => model.__hydrate({ __dirty: "x" } as any),
		Error,
		"reserved",
	);
	assert(!Object.keys(model.__source).includes("__dirty"));
});

// -----------------------------------------------------------------------------
// AJV strict mode (documented behavior)
// -----------------------------------------------------------------------------

Deno.test("default AJV instance is strict: unknown format throws at ajvSchema()", () => {
	assertThrows(
		() =>
			ajvSchema({
				type: "object",
				properties: { e: { type: "string", format: "email" } },
			}),
		Error,
		'unknown format "email"',
	);
});

Deno.test("default AJV instance is strict: unknown keyword throws", () => {
	assertThrows(
		() => ajvSchema({ type: "object", notAKeyword: 1 }),
		Error,
		"unknown keyword",
	);
});

Deno.test("strict:false instance accepts and ignores unknown formats", async () => {
	const { Ajv } = await import("ajv");
	const schema = ajvSchema(
		{ type: "object", properties: { e: { type: "string", format: "email" } } },
		new Ajv({ allErrors: true, strict: false }),
	);

	const model = modelize({ e: "not-an-email" }, { schema });
	assertEquals(model.__isValid, true); // format genuinely ignored
});

Deno.test("ajv-formats instance enforces formats", async () => {
	const { Ajv } = await import("ajv");
	const mod = await import("ajv-formats");
	// ajv-formats' CJS default export needs unwrapping under Deno's interop.
	const addFormats = (mod.default ??
		mod) as unknown as (ajv: unknown) => void;
	const ajv = new Ajv({ allErrors: true });
	addFormats(ajv);

	const schema = ajvSchema(
		{ type: "object", properties: { e: { type: "string", format: "email" } } },
		ajv,
	);

	assertEquals(modelize({ e: "nope" }, { schema }).__isValid, false);
	assertEquals(modelize({ e: "a@b.co" }, { schema }).__isValid, true);
});
