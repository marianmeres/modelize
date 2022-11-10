import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import json from "@rollup/plugin-json";
import fs from "node:fs";
// import dts from "rollup-plugin-dts";

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

export default [
	// browser-friendly UMD build
	{
		input: 'src/index.ts',
		output: {
			name: 'searchable',
			file: pkg.browser,
			format: 'umd'
		},
		plugins: [
			resolve(),   // so Rollup can find `lodash`
			commonjs(),  // so Rollup can convert `ms` to an ES module
			typescript(), // so Rollup can convert TypeScript to JavaScript
			json(),
			terser(),
		]
	},

	{
		input: 'src/index.ts',
		external: [],
		plugins: [
			typescript(),
			commonjs(),
			resolve(),
			json(),
			// terser(),
		],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	},

	// {
	// 	input: "./dist/index.d.ts",
	// 	output: [{ file: "./dist/index.d.ts", format: "es" }],
	// 	plugins: [dts()],
	// },
];
