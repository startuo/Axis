import {
	fail,
	json,
	body,
	currentUser,
	rows,
	one,
	stmt,
	now,
	text,
	feedback,
} from "./core.mjs";
import { publicEntry, refreshMediaRefs } from "./entries.mjs";
export async function profileRoutes(request, env, path) {
	if (!path.startsWith("/me/")) return null;
	const user = await currentUser(request, env);
	if (path === "/me/profile") {
		const existing = (await one(
			env.DB,
			"SELECT * FROM profiles WHERE userId=?",
			user.id,
		)) ?? {
			nickname: user.username,
			bio: "",
			avatarUrl: "",
			readingHistory: 1,
		};
		if (request.method === "GET")
			return json({
				...existing,
				username: user.username,
				email: user.email,
			});
		if (request.method !== "PATCH") fail(405, "Method not allowed");
		const data = await body(request),
			nickname = text(data.nickname, "昵称", 1, 32),
			bio = text(data.bio ?? "", "简介", 0, 160);
		const avatarUrl = data.avatarUrl ?? "";
		if (avatarUrl && !/^\/media\/[a-f0-9-]{36}$/.test(avatarUrl))
			fail(400, "请上传头像");
		if (
			avatarUrl &&
			!(await one(
				env.DB,
				"SELECT id FROM media WHERE id=? AND ownerId=? AND deletedAt IS NULL",
				avatarUrl.slice(7),
				user.id,
			))
		)
			fail(403, "不能使用其他用户上传的头像");
		const readingHistory =
			data.readingHistory === false || data.readingHistory === 0 ? 0 : 1;
		await env.DB.batch([
			stmt(
				env.DB,
				"INSERT INTO profiles(userId,nickname,bio,avatarUrl,readingHistory) VALUES(?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET nickname=excluded.nickname,bio=excluded.bio,avatarUrl=excluded.avatarUrl,readingHistory=excluded.readingHistory",
				user.id,
				nickname,
				bio,
				avatarUrl,
				readingHistory,
			),
			...(await refreshMediaRefs(env.DB, "profile:" + user.id, [
				avatarUrl,
			])),
		]);
		return json({ nickname, bio, avatarUrl, readingHistory });
	}
	if (path === "/me/messages" && request.method === "GET") {
		const messages = await rows(
			env.DB,
			"SELECT f.*,u.username authorName,u.email authorEmail FROM feedback_messages f JOIN users u ON u.id=f.authorId WHERE f.authorId=? ORDER BY f.createdAt DESC LIMIT 100",
			user.id,
		);
		return json({ items: messages.map((r) => feedback(r)) });
	}
	const match = path.match(/^\/me\/(favorites|history)(?:\/([a-f0-9-]+))?$/);
	if (!match) fail(404, "Not found");
	const [, kind, id] = match;
	if (!id && request.method === "GET")
		return json({
			items: (
				await rows(
					env.DB,
					"SELECT e.* FROM user_entries u JOIN entries e ON e.id=u.entryId WHERE u.userId=? AND u.kind=? AND e.published IS NOT NULL AND e.deletedAt IS NULL ORDER BY u.updatedAt DESC LIMIT 100",
					user.id,
					kind,
				)
			).map(publicEntry),
		});
	if (request.method === "DELETE") {
		await stmt(
			env.DB,
			"DELETE FROM user_entries WHERE userId=? AND kind=?" +
				(id ? " AND entryId=?" : ""),
			user.id,
			kind,
			...(id ? [id] : []),
		).run();
		return json({ ok: true });
	}
	if (request.method === "PUT" && id) {
		if (
			!(await one(
				env.DB,
				"SELECT id FROM entries WHERE id=? AND kind='posts' AND published IS NOT NULL AND deletedAt IS NULL",
				id,
			))
		)
			fail(404, "文章不存在");
		if (kind === "history") {
			const profile = await one(
				env.DB,
				"SELECT readingHistory FROM profiles WHERE userId=?",
				user.id,
			);
			if (profile?.readingHistory === 0) return json({ recorded: false });
		}
		await env.DB.batch([
			stmt(
				env.DB,
				"INSERT INTO user_entries(userId,entryId,kind,updatedAt) VALUES(?,?,?,?) ON CONFLICT(userId,entryId,kind) DO UPDATE SET updatedAt=excluded.updatedAt",
				user.id,
				id,
				kind,
				now(),
			),
			stmt(
				env.DB,
				"DELETE FROM user_entries WHERE userId=? AND kind='history' AND entryId NOT IN (SELECT entryId FROM user_entries WHERE userId=? AND kind='history' ORDER BY updatedAt DESC LIMIT 100)",
				user.id,
				user.id,
			),
		]);
		return json({ ok: true });
	}
	fail(405, "Method not allowed");
}
