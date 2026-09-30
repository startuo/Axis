import { tokenSubject, fingerprint } from "./auth.mjs";
export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}
export const fail = (status, message) => {
	throw new HttpError(status, message);
};
export const json = (value, status = 200) =>
	Response.json(value, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
export const now = () => new Date().toISOString();
export const day = () =>
	new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
export const one = (db, sql, ...values) => stmt(db, sql, ...values).first();
export const rows = async (db, sql, ...values) =>
	(await stmt(db, sql, ...values).all()).results;
export const safeUser = ({ passwordHash, ...user }) => user;
export function feedback(row, publicOnly = false) {
	if (!row) fail(404, "Message not found");
	const result = {
		id: row.id,
		text: row.text,
		color: row.color,
		timestamp: Date.parse(row.createdAt),
	};
	return publicOnly
		? result
		: {
				...result,
				status: row.status,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				author: {
					id: row.authorId,
					username: row.authorName,
					email: row.authorEmail,
				},
			};
}
export function text(value, name, min, max, trim = true) {
	if (typeof value !== "string") fail(400, `${name} must be a string`);
	const result = trim ? value.trim() : value;
	if (result.length < min || result.length > max)
		fail(400, `${name} must contain ${min}-${max} characters`);
	return result;
}
export function choice(value, values, name) {
	if (!values.includes(value)) fail(400, `Invalid ${name}`);
	return value;
}
export function integer(value, fallback, max) {
	if (value === null) return fallback;
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 1 || n > max)
		fail(400, "Invalid pagination");
	return n;
}
export async function body(request) {
	if (!request.headers.get("content-type")?.includes("application/json"))
		fail(415, "Expected application/json");
	// Stream with a cap: do not buffer arbitrarily large unauthenticated bodies.
	const reader = request.body?.getReader();
	if (!reader) fail(400, "Missing JSON body");
	let size = 0;
	const chunks = [];
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 262144) {
			await reader.cancel();
			fail(413, "Request body too large");
		}
		chunks.push(value);
	}
	const data = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.length;
	}
	let result;
	try {
		result = JSON.parse(new TextDecoder().decode(data));
	} catch {
		fail(400, "Invalid JSON");
	}
	if (!result || Array.isArray(result) || typeof result !== "object")
		fail(400, "Expected JSON object");
	return result;
}
export async function limit(db, key, max, seconds = 60) {
	const time = Math.floor(Date.now() / 1000);
	const result = await one(
		db,
		`INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,
		key,
		time + seconds,
		time,
		time,
	);
	if (result.count > max)
		fail(429, "Too many requests. Please try again later.");
}
export async function currentUser(request, env, admin = false) {
	const token = request.headers
		.get("authorization")
		?.match(/^Bearer ([^ ]+)$/)?.[1];
	if (!token || token.length > 4096) fail(401, "Please log in");
	const id = await tokenSubject(token, env.JWT_SECRET);
	const user = id
		? await one(env.DB, "SELECT * FROM users WHERE id=?", id)
		: null;
	if (!user) fail(401, "Session expired");
	if (admin && user.role !== "ADMIN")
		fail(403, "Administrator access required");
	return safeUser(user);
}
