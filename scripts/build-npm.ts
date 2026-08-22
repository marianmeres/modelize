import { npmBuild, versionizeDeps } from "@marianmeres/npmbuild";

const denoJson = JSON.parse(Deno.readTextFileSync("deno.json"));

const [ajvDep] = versionizeDeps(["ajv"], denoJson);
const ajvRange = ajvDep.slice(ajvDep.lastIndexOf("@") + 1);

const { outDir } = await npmBuild({
	name: denoJson.name,
	version: denoJson.version,
	repository: denoJson.name.replace(/^@/, ""),
	// "mod" -> ".", "ajv" -> "./ajv"
	entryPoints: ["mod", "ajv"],
	// AJV is installed here only so `tsc` can resolve its types while compiling
	// src/ajv.ts. It is demoted to an optional peer dependency below — declaring
	// it as an optional peer up front makes npm treat the install as satisfied
	// and skip it, which breaks the build.
	dependencies: versionizeDeps(["@marianmeres/pubsub", "ajv"], denoJson),
});

// Only the "./ajv" subpath needs AJV. Keeping it out of `dependencies` means
// everyone using a Standard Schema validator (or no schema at all) never
// installs it.
const pkgPath = `${outDir}/package.json`;
const pkg = JSON.parse(Deno.readTextFileSync(pkgPath));

delete pkg.dependencies.ajv;
pkg.peerDependencies = { ...pkg.peerDependencies, ajv: ajvRange };
pkg.peerDependenciesMeta = { ...pkg.peerDependenciesMeta, ajv: { optional: true } };

Deno.writeTextFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
console.log(`--> demoted ajv@${ajvRange} to an optional peer dependency`);
