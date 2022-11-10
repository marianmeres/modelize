import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { createPubSub } from '../dist/index.js';

const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));

suite.test('pub sub works', () => {
	const log = [];
	const ps = createPubSub();

	const unsub = ps.subscribe('foo', (data) => {
		log.push(data);
	});

	assert(!log.length);

	ps.publish('foo', 'bar');

	assert(log.length === 1);
	assert(log[0] === 'bar');

	unsub();
	unsub(); // noop
	unsub(); // noop

	ps.publish('foo', 'baz');

	assert(log.length === 1);
});

suite.test('subscribe once works', () => {
	const log = [];
	const ps = createPubSub();

	ps.subscribeOnce('foo', (data) => log.push(data));

	ps.publish('foo', 'bar');
	ps.publish('foo', 'baz');
	ps.publish('foo', 'bat');

	assert(log.length === 1);
	assert(log[0] === 'bar');
});

suite.test('subscribe once unsub early works', () => {
	const log = [];
	const ps = createPubSub();

	// immediatelly unsubscribe
	const unsub = ps.subscribeOnce('foo', (data) => log.push(data));
	unsub();

	ps.publish('foo', 'bar');

	assert(!log.length);
});

export default suite;
