import { assert, assertEquals, assertThrows } from "@std/assert";
import { modelize, ModelizeValidationError } from "../src/mod.ts";

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
		"does not exist on model"
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
		"does not exist on model"
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
		"strict mode enabled"
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
			schema: {
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			},
		}
	);

	assertEquals(model.__isValid, true);
});

Deno.test("JSON schema validation fails for invalid data", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: {
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			},
		}
	);

	assertEquals(model.__isValid, false);
	assert(model.__errors.length > 0);
});

Deno.test("__validate throws ModelizeValidationError for invalid data", () => {
	const model = modelize(
		{ age: -5 },
		{
			schema: {
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			},
		}
	);

	assertThrows(
		() => model.__validate(),
		ModelizeValidationError,
		"Validation failed"
	);
});

Deno.test("validation error contains field-level details", () => {
	const model = modelize(
		{ age: -5, name: 123 },
		{
			schema: {
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
					name: { type: "string" },
				},
			},
		}
	);

	try {
		model.__validate();
		assert(false, "Should have thrown");
	} catch (e) {
		assert(e instanceof ModelizeValidationError);
		assert(e.errors.length >= 1);
		assert(
			e.errors.some(
				(err) => err.path.includes("age") || err.message.includes("minimum")
			)
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
		}
	);

	assertEquals(model.__isValid, true);
});

Deno.test("custom validator fails when returning error message", () => {
	const model = modelize(
		{ password: "secret", confirmPassword: "different" },
		{
			validate: (m) =>
				m.password === m.confirmPassword ? true : "Passwords must match",
		}
	);

	assertEquals(model.__isValid, false);
	assertEquals(model.__errors[0].message, "Passwords must match");
});

Deno.test("both schema and custom validator can be used together", () => {
	const model = modelize(
		{ age: 25, status: "invalid" },
		{
			schema: {
				type: "object",
				properties: {
					age: { type: "number", minimum: 0 },
				},
			},
			validate: (m) =>
				m.status === "active" || m.status === "inactive"
					? true
					: "Status must be active or inactive",
		}
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
		"reserved"
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
