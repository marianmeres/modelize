import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import _ from 'lodash';
import { modelize } from '../src/index.js';
import {
	ModelizeConfig,
	ModelizeUnableToValidate,
	ModelizeValidationError,
} from '../src/modelize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = new TestRunner(path.basename(__filename));
const clog = console.log;

class Agent {
	// example (same as defaults)
	// // getter is important here, as it will not be listed among "regular" props
	// // "__" prefix is just a cosmetic convention to reduce potential name collision with
	// // "regular" props
	// get __config(): Partial<ModelizeConfig<Agent>> {
	// 	return {
	// 		schema: null,
	// 		additionalProperties: false,
	// 	};
	// }

	// optionally define props
	firstname: string = '';
	lastname: string = '';
	code: string = '';

	whoami() {
		if (this.lastname && this.firstname) {
			return this.code === '007'
				? ['My name is', this.lastname + ',', this.firstname, this.lastname].join(' ')
				: [this.firstname, this.lastname].join(' ');
		} else {
			return '';
		}
	}
}

class ModelWithDefaults {
	foo: string = 'bar';
}

suite.test('pojo empty model', () => {
	const o = modelize({});
	assert(_.isEqual({}, o.toJSON()));
	assert(!Object.keys(o).length);
	assert(!o.__isDirty());
});

suite.test('behavior is strict by default (no additionalProperties)', () => {
	const o = modelize({});
	//@ts-ignore
	o.foo = 123; // will be ignored
	//@ts-ignore
	assert(!o.foo);

	// now non-strict
	const o2 = modelize({}, null, { additionalProperties: true });
	//@ts-ignore
	o2.foo = 123;
	//@ts-ignore
	assert(o2.foo === 123);

	//
	const o3 = modelize({ foo: 'bar' });
	o3.foo = 'baz';
	assert(o3.foo === 'baz');
	//@ts-ignore
	o3.hey = 'ho'; // will be ignored
	//@ts-ignore
	assert(!o3.hey);

	//
	const o4 = modelize({ foo: 'bar' }, null, { additionalProperties: true });
	//@ts-ignore
	o4.hey = 'ho';
	//@ts-ignore
	assert(o4.hey === 'ho');
});

suite.test('get dirty works', () => {
	const o = modelize({ foo: 'bar', baz: 'bat' });
	o.foo = 'hey';
	assert(_.isEqual({ foo: 'hey' }, o.__getDirty()));
});

suite.test('pojo model', () => {
	const data = { foo: 'bar' };
	const o = modelize(data);
	assert(o !== data);
	assert(o.foo === 'bar');
	assert(_.isEqual(data, o.toJSON()));
	assert(Object.keys(o).length === 1);
	assert(!o.__isDirty());

	// same value, no dirt
	o.foo = 'bar';
	assert(!o.__isDirty());

	// now change
	o.foo = 'baz';
	assert(o.__isDirty());
	assert(_.isEqual(['foo'], o.__isDirty()));

	//
	o.__setClean();
	assert(!o.__isDirty());

	// original object is always synced
	assert(_.isEqual(data, o.toJSON()));
});

suite.test('class empty model', () => {
	const o = modelize<Agent>(new Agent());
	assert(Object.keys(o).length === 3); // first, last, code
	assert(!o.__isDirty());

	// set manually
	o.firstname = 'Jason';
	o.lastname = 'Bourne';
	assert(o.__isDirty().length === 2);
	o.__setClean();

	// set via populate
	o.__hydrate({
		firstname: 'James',
		lastname: 'Bond',
		code: '007',
		// @ts-ignore
		foo: 'bar', // must be ignored because strict config
	});
	assert(o.__isDirty().length === 3);
	assert(o.whoami() === 'My name is Bond, James Bond');
	// @ts-ignore
	assert(o.foo === undefined);
});

suite.test('model with defaults', () => {
	const o = modelize<ModelWithDefaults>(new ModelWithDefaults());
	assert(o.toJSON().foo === 'bar');
	assert('{"foo":"bar"}' === JSON.stringify(o));
});

suite.test('set prop name collision', () => {
	const o = modelize<Agent>(new Agent());
	// @ts-ignore
	assert.throws(() => o.__hydrate({ __hydrate: 'must throw' }));

	// @ts-ignore
	assert.throws(() => (o.__isDirty = 123));

	// unknown, but valid name prop does not throw, but is just silently ignored
	// @ts-ignore
	assert.doesNotThrow(() => (o.foo = 'bar'));
});

suite.test('create name collision', () => {
	assert.throws(() => modelize({ __isDirty: 123 }));
});

suite.test('validate without validator throws', () => {
	const o = modelize({});
	assert.throws(o.__validate);

	// provide validator
	o.__setValidator((obj, schema, assert) => true);
	assert.doesNotThrow(o.__validate);
});

suite.test('provide and access schema', () => {
	const o = modelize<Agent>(new Agent());
	const schema = {};
	assert(!o.__getSchema());
	o.__setSchema(schema);
	assert(o.__getSchema() === schema);
});

suite.test('onChange works', () => {
	const o = modelize<Agent>(new Agent());
	const log = [];
	const unsub = o.__onChange((model, changed) => log.push(changed));

	o.__hydrate({ firstname: 'James' });
	o.__hydrate({ firstname: 'James' }); // no change
	o.__hydrate({ firstname: 'Jason' });

	unsub();

	// must not be logged, since we're not listening anymore
	o.__hydrate({ firstname: 'Justin' });

	assert(log.length === 2);
	assert(_.isEqual(log[0], { property: 'firstname', old: '', new: 'James' }));
	assert(_.isEqual(log[1], { property: 'firstname', old: 'James', new: 'Jason' }));
});

suite.test('schema validate works', () => {
	const o = modelize<Agent>(
		new Agent(),
		{
			firstname: 'James',
			lastname: 'Bond',
			code: '007',
		},
		{
			schema: {
				type: 'object',
				properties: {
					firstname: { type: 'string' },
					lastname: { type: 'string' },
					code: { type: 'string' },
				},
				additionalProperties: false,
			},
		}
	);

	// valid
	assert(o.__validate());

	// setting wrong type must fail
	//@ts-ignore
	assert.throws(() => (o.firstname = 123));

	// schema can be changed at runtime (remove code)
	o.__setSchema({
		type: 'object',
		properties: {
			firstname: { type: 'string' },
			lastname: { type: 'string' },
		},
		additionalProperties: false,
	});

	assert.throws(o.__validate, ModelizeValidationError);

	// or, if not assert, just return false
	assert(!o.__validate(false));

	// schema can be removed at runtime
	o.__setSchema(null);
	//@ts-ignore
	assert.doesNotThrow(() => (o.firstname = 123));

	// but explicit validation still throws on schema not available
	assert.throws(o.__validate, ModelizeUnableToValidate);
});

suite.test('custom validator works', () => {
	const o = modelize<Agent>(
		new Agent(),
		{
			firstname: 'James',
			lastname: 'Bond',
			code: '007',
		},
		{
			// note: this is called after each property set
			validator: (model, schema, assert) => {
				const is007 = !model.code || model.code === '007';
				if (assert && !is007) throw new ModelizeValidationError('double-oh-seven only');
				return is007;
			},
		}
	);

	assert(o.__validate());

	//
	assert.throws(() => (o.code = '008'), ModelizeValidationError);

	// "pause" validation
	o.__pauseValidate();
	assert.doesNotThrow(() => (o.code = '008'));
	assert(o.__validate());
	assert(o.code === '008');

	// resume again
	o.__resumeValidate();
	assert.throws(o.__validate, ModelizeValidationError);
});

export default suite;
