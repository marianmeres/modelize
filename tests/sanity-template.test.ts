import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';

const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));

suite.test('test runner sanity check template', () => assert(true));

export default suite;
