# 帽子云部署方案

## 2026-09-16 构建日志修复

两份日志对应不同故障，不能共用同一个部署入口：

| 场景 | 工作目录 | 构建命令 | 发布目录或启动命令 |
| --- | --- | --- | --- |
| Cloudflare Workers 静态前端 | 仓库根目录 | `pnpm build:static` | 部署命令 `npx wrangler deploy`，配置已指定 `dist` |
| Cloudflare Pages / 帽子云静态前端 | 仓库根目录 | `pnpm build:static` | 发布目录 `dist` |
| 支持 Node.js 常驻进程的 API 服务 | `apps/api` | `pnpm build` | `pnpm start:prod` |

安装命令均为 `pnpm install --frozen-lockfile`，构建阶段需安装开发依赖。

- Cloudflare 日志已显示前端构建成功，失败在 Wrangler 对 workspace 根目录的自动识别。根目录新增 `wrangler.jsonc`，显式发布静态资源；将其中 `name` 改为控制台已有 Worker 名称。静态资源配置依据 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/static-assets/binding/)。该配置不启动 NestJS API。
- 第二份日志实际在 `/src/apps/api` 执行 `nest build`，缺少生成后的 Prisma 模型类型。API 的 `build` 已改为先按 `prisma/schema.prisma` 生成 Client，再编译，避免依赖开发机缓存或依赖安装时的自动 schema 查找。生成 Client 不执行数据库迁移。
- 如果第二个平台只是用于发布博客，请把根目录改回仓库根目录，按表中静态前端设置。若确实部署 API，则需确认所选服务提供 Node.js 运行环境，并按下文配置数据库、Redis、JWT 与跨域；镜像编译成功不等于服务上线成功。
- 日志中的 `ttf2woff2` / Python `distutils` 报错未终止依赖安装，且随后前端构建成功，不是本次部署失败原因。

前后端分别部署时，在前端构建环境填写下文的 `PUBLIC_API_BASE_URL`、`PUBLIC_SOCKET_URL`，然后重新构建；数据库迁移与管理员初始化只在后端执行。

本地验证：`pnpm --filter api build` 通过，生成 Prisma Client 6.19.3 和 `apps/api/dist/src/main.js`；`pnpm --filter api test --runInBand` 的 2 个测试套件、16 项测试通过；`pnpm build:static` 生成 56 个页面，Pagefind 索引 28 页。Wrangler 4.132.0 的 `deploy --dry-run` 已读取 492 个静态文件并完成预检，不再触发 workspace 自动识别错误。未执行线上部署、数据库迁移或线上健康检查。

核对日期：2026-09-14。

## 结论

当前项目是 Astro 静态前端 + 可选 NestJS API。帽子云适合部署 `dist/` 静态成品。官网明确定位静态网站托管，暂不支持全栈框架的服务端运行；虽支持反向代理，不能据此认为支持常驻 NestJS、PostgreSQL 或 Redis。构建环境有 Node.js 也不等于提供 Node.js 运行服务。

来源：[帽子云官网的产品介绍与常见问题](https://maoziyun.com/)。反向代理的路径重写、WebSocket 支持及当前账户配置需要在控制台确认，本文不假设已开通。

## 方案一：纯静态知识博客（当前默认）

文章由本地 Obsidian 同步到内容目录后构建，目录、全文搜索、文章和图片随静态文件发布，不需要数据库。更新流程是同步 → 构建 → 上传完整 `dist/`。这是构建时内容管理，不能在网页上写入服务器。

- 项目根目录：仓库根目录，不是 `apps/api`。
- 安装：`pnpm install --frozen-lockfile`（Node.js 22、pnpm 10；实际以根目录 packageManager/engines 为准）。
- 构建：`pnpm build:static`（执行 Astro 构建与 Pagefind 索引，不运行远端内容覆盖或追番更新脚本）。
- 发布目录：`dist`；无需启动命令、Docker 或后端环境变量。
- `PUBLIC_API_BASE_URL` 与 `PUBLIC_SOCKET_URL` 留空。
- 在 `src/config.ts` 中把 `siteURL` 设为最终域名后重新构建，确保 canonical、RSS、站点地图正确。
- 部署前确认 `/posts/文章路径/` 和 `/archive/` 等真实目录可直接访问；不应把全部请求重写到首页。

生产构建未设置 API 时，首页不会挂载在线文章通道，管理页明确提示未连接在线服务；登录、注册和留言请求会明确失败，不生成假账号、假保存或假成功。开发模式仍默认连接本机 `3001`。现有浏览器本地草稿/历史不会变成多人共享数据库。

`PUBLIC_*` 会进入浏览器代码，只能保存公开端点地址。不要在前端托管中设置 JWT_SECRET、DATABASE_URL 或 ADMIN_PASSWORD。

## 方案二：帽子云前端 + 独立真实 API

要保留在线注册、登录、后台文章发布、审核留言和实时统计，需要一台支持常驻 Node.js 的服务器或容器平台，以及 PostgreSQL 和 Redis。现有 `apps/api` 已提供这些功能，不需要重写成假后端。

在独立后端主机上：

1. 安装项目依赖，按 `apps/api/.env.example` 配置后端环境：`NODE_ENV=production`、`PORT=3001`、`API_PREFIX=api/v1`、数据库、Redis、独立随机 JWT_SECRET。`CORS_ORIGIN` 设为真实博客来源，多个来源用逗号分隔。
2. 执行 `pnpm --filter api prisma:generate`、`pnpm --filter api prisma:migrate:deploy`、`pnpm --filter api build`。
3. 仅首次需要管理员初始化时，配置自己的管理员环境变量后执行 `pnpm --filter api prisma:seed`。先阅读 seed 内容，它也包含示例数据，避免把演示文章带入正式站。
4. 由进程管理器运行 `pnpm --filter api start:prod`；持久化数据库和 Redis，并在 API 域名前启用 HTTPS。
5. 核对 `https://api.example.com/api/v1/health`；该端点用于检查应用依赖状态。

在帽子云前端构建环境设置以下**示例**公开地址后重新构建：

```dotenv
PUBLIC_API_BASE_URL=https://api.example.com/api/v1
PUBLIC_SOCKET_URL=https://api.example.com/dashboard
```

Socket.IO 使用 `/socket.io/` 传输路径和 `/dashboard` 命名空间。独立 API 域名方案最直接。如果改用帽子云反向代理，应将 `/api/v1/*` 转发到独立 API 并保留正确前缀，将 `/socket.io/*` 转发到同一 API 且确认支持 WebSocket upgrade。前端 API 可使用 `/api/v1` 相对地址，Socket 地址使用博客完整来源加 `/dashboard`。反向代理不能替代 API 主机。

后端数据库文章显示于在线文章通道，与构建时 Obsidian 文章是两套数据源。静态同步不会自动写入 PostgreSQL；后台修改也不会反写 Vault。

## 验收与回退

纯静态：构建成功；打开首页、文章、搜索和深色/浅色主题；无请求发往访客的 localhost；管理页显示未启用。

真实 API：健康检查通过；注册/登录、管理员鉴权、文章写入后刷新仍存在；留言审核；实时连接和断线提示；使用普通账户验证管理接口拒绝访问。

回退时重新发布上一份完整 `dist/`。若仅 API 发生故障，可清空两项 PUBLIC 端点并重新构建，恢复纯静态阅读。数据库变更应单独备份与回退，不能通过回退前端撤销。

本次仅准备本地部署适配和文档，未发布远端、未配置控制台或接触凭据。
