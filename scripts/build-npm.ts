import { copySync, emptyDir, ensureDir, walkSync } from "@std/fs";
import { join } from "@std/path";
import denoJson from "../deno.json" with { type: "json" };

/**
 * This is quick-n-dirty npm package build script...
 */

const TS_TO_JS_REGEX =
	/from\s+(['"])([^'"]+)\.ts(['"]);?|import\s*\(\s*(['"])([^'"]+)\.ts(['"]),?\s*\)/g;

// prettier-ignore
function replaceWithJs(
	_match: any,
	q1: any,
	path1: any,
	q3: any,
	q4: any,
	path2: any,
	q6: any,
) {
	if (path1) {
		// Static import: from "path.ts"
		return `from ${q1}${path1}.js${q3}`;
	} else {
		// Dynamic import: import("path.ts")
		return `import(${q4}${path2}.js${q6})`;
	}
}

const srcDir = join(import.meta.dirname!, "../src");
const outDir = join(import.meta.dirname!, "../.npm-dist");
const outDirSrc = join(outDir, "/src");
const outDirDist = join(outDir, "/dist");

console.log({ srcDir, outDir, outDirSrc, outDirDist });

await ensureDir(outDir);
await emptyDir(outDir);

// copy
copySync(srcDir, outDirSrc);
Deno.copyFileSync("LICENSE", join(outDir, "LICENSE"));
Deno.copyFileSync("README.md", join(outDir, "README.md"));

// create tsconfig.json
const tsconfigJson = {
	compilerOptions: {
		target: "esnext",
		module: "esnext",
		strict: false,
		declaration: true,
		forceConsistentCasingInFileNames: true,
		skipLibCheck: true,
		rootDir: "src",
		outDir: "dist",
		moduleResolution: "bundler",
	},
};
Deno.writeTextFileSync(
	join(outDir, "tsconfig.json"),
	JSON.stringify(tsconfigJson, null, "\t"),
);

// WTF hackery: Option 'allowImportingTsExtensions' can only be used when...
for (const f of walkSync(outDirSrc)) {
	if (f.isFile) {
		const contents = Deno.readTextFileSync(f.path);
		const replaced = contents.replace(TS_TO_JS_REGEX, replaceWithJs);
		Deno.writeTextFileSync(f.path, replaced);
	}
}

// create package json
const packageJson = {
	name: denoJson.name,
	version: denoJson.version,
	type: "module",
	main: "dist/mod.js",
	types: "dist/mod.d.ts",
	author: "Marian Meres",
	license: "MIT",
	repository: {
		type: "git",
		url: "git+https://github.com/marianmeres/modelize.git",
	},
	bugs: {
		url: "https://github.com/marianmeres/modelize/issues",
	},
	dependencies: {},
};
Deno.writeTextFileSync(
	join(outDir, "package.json"),
	JSON.stringify(packageJson, null, "\t"),
);

Deno.chdir(outDir);

const dependencies = [
	"ajv@^8",
	"@marianmeres/pubsub"
];

([
	["npm", { args: ["install", ...dependencies] }],
	["tsc", { args: ["-p", "tsconfig.json"] }],
] as [string, { args: string[] }][]).forEach(([cmd, opts]) => {
	console.log("--> Executing:", cmd, opts);
	const command = new Deno.Command(cmd, opts);
	let { code, stdout, stderr } = command.outputSync();
	stdout = new TextDecoder().decode(stdout) as any;
	stdout && console.log(stdout);
	if (code) throw new Error(new TextDecoder().decode(stderr));
});

// cleanup
["tsconfig.json"].forEach((f) => {
	Deno.removeSync(join(outDir, f));
});

Deno.removeSync(outDirSrc, { recursive: true });
