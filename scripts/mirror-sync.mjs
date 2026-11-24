import { mkdir, writeFile, readFile } from "node:fs/promises";
const origin =
	process.env.MAIN_SITE_URL || "https://axis.1669338073.workers.dev";
const headers = { Authorization: `Bearer ${process.env.MIRROR_TOKEN}` };
if (!process.env.MIRROR_TOKEN) throw new Error("MIRROR_TOKEN is required");
const RETRYABLE_STATUSES = new Set([409, 429, 502, 503, 504]);
const retryDelayMs = Number(process.env.MIRROR_VERIFY_DELAY_MS ?? 20000);
const maxAttempts = Number(process.env.MIRROR_VERIFY_ATTEMPTS ?? 30);

if (process.argv.includes("--verify")) {
	const { revision } = JSON.parse(
		await readFile(".mirror/snapshot.json", "utf8"),
	);
	let lastReason = "unknown";
	for (let i = 0; i < maxAttempts; i++) {
		try {
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
			if (!RETRYABLE_STATUSES.has(response.status))
				throw new Error("Verification failed: " + response.status);
			lastReason = `HTTP ${response.status}`;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Verification failed:")
			)
				throw error;
			lastReason =
				error instanceof Error ? error.message : String(error);
		}
		console.log(
			`Mirror verify attempt ${i + 1}/${maxAttempts} pending (${lastReason}), retrying...`,
		);
		await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
	}
	throw new Error(
		`Mirror deployment not verified within ${maxAttempts} attempts (last: ${lastReason})`,
	);
}
const response = await fetch(new URL("/api/v1/mirror/export", origin), {
	headers,
	signal: AbortSignal.timeout(60000),
});
if (!response.ok)
	throw new Error("Snapshot export failed: " + response.status);
const snapshot = await response.json();
await mkdir(".mirror", { recursive: true });
await writeFile(".mirror/snapshot.json", JSON.stringify(snapshot, null, 2));
console.log("Exported public revision:", snapshot.revision);
