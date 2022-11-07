import path from 'node:path';
import { strict as assert } from 'assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { modelize } from '../src/index.js';
import _ from 'lodash';
import { Modelized, ModelizeValidationError } from '../src/modelize.js';

const clog = console.log;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = new TestRunner(path.basename(__filename));

suite.test('readme example 1', () => {
	// some model class
	class User {
		// some public props ...
		firstname: string = '';
		lastname: string = '';
		// some methods ...
		whoami = () => [this.firstname, this.lastname].filter(Boolean).join(' ');
		// some getters ...
		get initials() {
			return [this.firstname.slice(0, 1), this.lastname.slice(0, 1)]
				.join('')
				.toUpperCase();
		}
	}

	// some model instance
	const user = new User();
	user.firstname = 'John';
	user.lastname = 'Doe';
	assert(user.whoami() === 'John Doe');
	assert(user.initials === 'JD');

	// now create new "modelized" version of the user instance
	const modelized = modelize<User>(user);

	// the "modelized" object is a new and different instance
	assert(modelized !== user);

	// but all props and methods are still available
	assert(modelized.firstname === 'John');
	assert(modelized.whoami() === 'John Doe');
	assert(modelized.initials === 'JD');

	// from now on, every instance update is monitored for changes
	modelized.lastname = 'Lennon';
	assert(modelized.__isDirty());
	assert(_.isEqual({ lastname: 'Lennon' }, modelized.__getDirty()));

	// and can be later marked as clean
	modelized.__setClean();
	assert(!modelized.__isDirty());

	// you can also subscribe to changes
	let log;
	const unsubscribe = modelized.__onChange((model, changed) => (log = changed));
	modelized.lastname = 'Wick';
	assert(_.isEqual(log, { property: 'lastname', old: 'Lennon', new: 'Wick' }));
	log = null; // reset

	// and unsubscribe
	unsubscribe();
	modelized.lastname = 'McEnroe';
	assert(log === null); // not subscribed anymore

	// you can populate/hydrate multiple props at once, and by default, unknown props
	// are silently ignored
	//@ts-ignore
	modelized.__hydrate({ lastname: 'Depp', email: 'johny@depp.com' });
	assert(modelized.lastname === 'Depp');
	//@ts-ignore
	assert(modelized.email === undefined);

	// but you can allow setting additional props if needed
	modelized.__setAllowAdditionalProps(true);
	//@ts-ignore
	modelized.__hydrate({ lastname: 'Cash', email: 'johny@cash.com' });
	//@ts-ignore
	assert(modelized.lastname === 'Cash');
	//@ts-ignore
	assert(modelized.email === 'johny@cash.com');

	// changes are synced with the original user instance as well
	//@ts-ignore
	assert(user.email === 'johny@cash.com');
	//@ts-ignore
	assert(user.initials === 'JC');

	// and, you can set json-schema to you model, to be auto validated all the time
	modelized.__setSchema({
		type: 'object',
		properties: {
			firstname: { type: 'string' },
			lastname: { type: 'string' },
		},
	});
	assert(modelized.__validate());
	//@ts-ignore
	assert.throws(() => (modelized.firstname = 123));

	// if json-schema is not your thing, you can create your own validator function
	// which has precedence over json-schema validation
	modelized.__setValidator((model, schema, assert) => {
		const isJohn = !model.firstname || model.firstname === 'John';
		if (assert && !isJohn) throw new ModelizeValidationError('John only');
		return isJohn;
	});
	assert(modelized.__validate());

	// only John is allowed
	assert.throws(() => (modelized.firstname = 'Peter'));
	assert(modelized.firstname === 'John');


	// shorthand
	const user2 = modelize({}, { firstname: 'James', lastname: 'Bond' }, {
		additionalProperties: true
	});
	assert(_.isEqual({ firstname: 'James', lastname: 'Bond' }, user2.toJSON()));
});

export default suite;
