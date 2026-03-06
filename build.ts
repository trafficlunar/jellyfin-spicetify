import { build, type BuildOptions, context } from "esbuild";
import CssModulesPlugin from "esbuild-css-modules-plugin";

import { copyFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";

const isLocal = process.argv.includes("--local");
const isWatch = process.argv.includes("--watch");

const options: BuildOptions = {
	entryPoints: ["src/main.ts"],
	outfile: "./dist/jellyfin-spicetify.js",
	bundle: true,
	minify: isLocal,
	platform: "browser",
	external: ["react", "react-dom"],
	plugins: [
		CssModulesPlugin({ pattern: "jellyfin-spicetify__[local]", localsConvention: "camelCaseOnly" }),
		{
			name: "external-global",
			setup(build) {
				build.onResolve({ filter: /^(react|react-dom)$/ }, (args) => ({
					path: args.path,
					namespace: "external-global",
				}));
				build.onLoad({ filter: /.*/, namespace: "external-global" }, (args) => ({
					contents: `module.exports = Spicetify.${args.path === "react" ? "React" : "ReactDOM"};`,
				}));
			},
		},
		{
			name: "on-end",
			setup(build) {
				build.onEnd(() => {
					const js = readFileSync("./dist/jellyfin-spicetify.js", "utf-8");
					const css = readFileSync("./dist/jellyfin-spicetify.css", "utf-8");

					const wrapped = `
					// https://github.com/trafficlunar/jellyfin-spicetify
					(async function() {
						while (!Spicetify.React || !Spicetify.ReactDOM) {
							await new Promise(resolve => setTimeout(resolve, 10));
						}
						const s = document.createElement("style");
						s.id = "jellyfin-spicetify";
						s.textContent = ${JSON.stringify(css)};
						document.head.appendChild(s);
						${js}
					})();`.trim();

					writeFileSync("./dist/jellyfin-spicetify.js", wrapped);

					if (!isLocal) {
						const path =
							os.platform() === "win32"
								? join(process.env.APPDATA!, "spicetify", "Extensions", "jellyfin-spicetify.js")
								: join(process.env.HOME!, ".config", "spicetify", "Extensions", "jellyfin-spicetify.js");

						copyFileSync("./dist/jellyfin-spicetify.js", path);
					}
				});
			},
		},
	],
};

if (isWatch) {
	const ctx = await context(options);
	await ctx.watch();
} else {
	await build(options);
}
