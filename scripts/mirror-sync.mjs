import { mkdir, writeFile, readFile } from "node:fs/promises";
const origin =
	process.env.MAIN_SITE_URL || "https://axis.1669338073.workers.dev";
const headers = { Authorization: `Bearer ${process.env.MIRROR_TOKEN}` };
if (!process.env.MIRROR_TOKEN) throw new Error("MIRROR_TOKEN is required");
if (process.argv.includes("--verify")) {
	const { revision } = JSON.parse(
		await readFile(".mirror/snapshot.json", "utf8"),
	);
	for (let i = 0; i < 30; i++) {
		const response = await fetch(
			new URL("/api/v1/mirror/complete", origin),
			{
				method: "POST",
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({ revision }),
				signal: AbortSignal.timeout(20000),
			},
		);
		if (response.ok) {
			console.log("Mirror revision verified:", revision);
			process.exit(0);
		}
		if (response.status !== 409)
			throw new Error("Verification failed: " + response.status);
		await new Promise((resolve) => setTimeout(resolve, 20000));
	}
	throw new Error("Mirror deployment not verified within 10 minutes");
}
const response = await fetch(new URL("/api/v1/mirror/export", origin), {
	headers,
	signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error("Snapshot export failed: " + response.status);
const snapshot = await response.json();
await mkdir(".mirror", { recursive: true });
await writeFile(".mirror/snapshot.json", JSON.stringify(snapshot, null, 2));
console.log("Exported public revision:", snapshot.revision);
