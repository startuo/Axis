import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const result = spawnSync(
	process.execPath,
	["node_modules/astro/astro.js", "build"],
	{
		stdio: "inherit",
		env: {
			...process.env,
			AXIS_TARGET: "cloudflare",
			PUBLIC_API_BASE_URL: "/api/v1",
		},
	},
);
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync("dist/.assetsignore", "_worker.js\n_routes.json\n");
