import path from 'node:path';
import { strict as assert } from 'assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = new TestRunner(path.basename(__filename));

suite.test('test runner sanity check template', () => assert(true));

export default suite;
