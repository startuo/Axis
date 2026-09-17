# Cloudflare Workers + D1 部署

当前架构：Astro 静态资源 + `workers/index.mjs` API + D1。前端和 API 共用 `axis` Worker 域名，API 前缀 `/api/v1`。不需要 PostgreSQL、Redis 或单独的 NestJS 主机。

全栈使用 `wrangler.api.jsonc`，原 `wrangler.jsonc` 保留静态模式，用于独立的纯静态部署。完成下面配置后，必须同时修改控制台的构建与部署命令；切换后不要再使用旧静态部署命令覆盖同一 Worker。

## 1. 安装与创建数据库

在仓库根目录操作，使用 Node.js 22.13+ 或 24、pnpm 10.22.0：

```powershell
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create axis-db
```

也可以在 Cloudflare 控制台“存储与数据库 → D1 SQL 数据库”创建 `axis-db`。已创建时不要重复创建。

将返回的 Database ID 填入根目录 `wrangler.api.jsonc` 的 `d1_databases[0].database_id`，当前仓库已填写现有 axis-db 的 ID；在其他账号新建数据库时替换为新 ID。绑定名称必须为 `DB`，数据库名称为 `axis-db`。Worker 名称目前是截图中的 `axis`。不要直接部署占位配置。

控制台“Workers 和 Pages → axis → 绑定 → 添加 D1 数据库”可填写变量名称 `DB`、选择 `axis-db`。但还必须同步仓库配置，避免后续 Git 部署覆盖绑定。

## 2. 配置密钥和建立表结构

```powershell
pnpm exec wrangler secret put JWT_SECRET --config wrangler.api.jsonc
pnpm db:migrate:remote
```

密钥使用密码管理器生成的随机字符串，至少 32 字节。通过命令提示输入，不要放入 Git、前端 `PUBLIC_*` 变量或命令参数。也可在 Worker 的“设置 → 变量和机密”添加加密的 `JWT_SECRET`。

迁移命令初始化用户、文章、留言、限流与统计表，不会自动导入旧 PostgreSQL 内容。首次为全新空库；已有旧数据时需单独迁移，旧 Argon2 密码也不能直接作为本实现的 PBKDF2 密码使用。

## 3. 发布

本地发布：

```powershell
pnpm deploy:cloudflare
```

Git 自动部署的控制台配置：

| 字段 | 值 |
| --- | --- |
| 根目录 | 仓库根目录 |
| 构建命令 | `pnpm build:cloudflare` |
| 部署命令 | `pnpm exec wrangler deploy --config wrangler.api.jsonc` |

全栈构建自动将前端 API 地址设为 `/api/v1`；无需 `PUBLIC_SOCKET_URL`。如果继续用旧的 `pnpm build` 或 `pnpm build:static`，前端不会自动启用同域 API。

先完成数据库 ID、密钥和远端迁移，再触发 Git 自动部署。后续新增迁移也先检查 SQL，再运行 `pnpm db:migrate:remote`。

## 4. 初始化管理员

1. 打开 `https://你的Worker域名/admin`，通过注册表单创建自己的账号。所有注册账号默认都是普通用户，不存在默认密码或公开管理员初始化接口。
2. 在 D1 控制台的 SQL Console 执行下面语句，将示例邮箱替换成自己刚注册的邮箱：

```sql
UPDATE users SET role = 'ADMIN' WHERE email = '你的邮箱';
SELECT id, username, email, role FROM users WHERE email = '你的邮箱';
```

3. 确认仅目标账号已变为 `ADMIN`，退出登录后重新登录。
4. 检查 `/api/v1/health` 返回 `status: ok`；创建草稿应不公开，发布后公开可读；提交留言需审核后才显示。

## 5. 本地验证与维护

```powershell
Copy-Item .dev.vars.example .dev.vars
# 在 .dev.vars 中设置本地测试用 JWT_SECRET，不要使用生产密钥。
pnpm db:migrate:local
pnpm build:cloudflare
pnpm dev:cloudflare
pnpm test:worker
```

默认本地地址由 Wrangler 输出（通常为 http://localhost:8787）。`.dev.vars` 和 `.wrangler` 已忽略，不提交 Git。本地数据库和远端数据库相互独立。

统计面板每 30 秒刷新，可见页面每 60 秒发送在线心跳，90 秒内活跃视为在线。UV/在线按 Cloudflare 可信 IP 的每日摘要去重，同一 NAT 网络的访客可能合并；PV 统计数据库文章的详情读取，不代表全部静态文章访问量。每日定时清理过期限流、在线记录和 7 天前阅读明细，文章累计阅读数保留。

登录、注册、留言、阅读和心跳均有服务端限流。密码使用 Web Crypto PBKDF2-SHA256（100,000 次）加随机盐；JWT 为 HS256、有效期 7 天，管理员角色每次从数据库校验。应在实际流量下观察 Workers CPU 和 D1 配额，免费额度不是无限容量。

现有 src/content/ 下的 Markdown 可在管理员后台的「Markdown 文章」区编辑并提交到 GitHub，详见 [Markdown 编辑配置](MARKDOWN_EDITOR.md)。D1 在线文章另行管理。保存到 GitHub 后自动重建两站，保留原文章路径、搜索和 RSS；不会反写本机 Obsidian Vault。

旧 `apps/api`、PostgreSQL/Redis 配置及相关依赖已移除。静态托管仍可使用 `pnpm build:static`，但不提供后端。

官方文档：[D1 创建与绑定](https://developers.cloudflare.com/d1/get-started/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)、[静态资源与 API](https://developers.cloudflare.com/workers/static-assets/)。

## 验证记录

- 16 项 Worker 测试通过，涵盖 API 鉴权、数据库操作、Markdown 路径限制、Front Matter、版本冲突及 GitHub 错误处理。GitHub 写入测试使用模拟接口。
- Astro 检查 117 文件，0 错误、警告或提示；全栈构建生成 56 页、搜索索引 28 页。
- Wrangler 全栈 dry-run 通过，包含 DB 与 ASSETS 绑定。
- 现有 axis-db 已部署，Axis-star 已设为 ADMIN。Markdown 保存仍需配置 Worker 加密变量 GITHUB_TOKEN。
