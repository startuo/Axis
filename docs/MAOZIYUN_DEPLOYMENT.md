# 帽子云静态部署

旧 NestJS 后端已移除。帽子云只发布静态前端；登录和管理请访问 Cloudflare 的 /admin/。

| 设置 | 值 |
| --- | --- |
| 根目录 | .（仓库根目录） |
| 构建命令 | pnpm --workspace-root run build:static |
| 输出目录 | dist |

此前平台自动识别 apps/api 为 NestJS，实际工作目录为 /src/apps/api，才需要 ../../dist。旧后端删除后不得继续使用该输出路径。确认新构建日志工作目录为 /src、静态文件来自 /src/dist。

保留 pnpm-workspace.yaml 以支持 --workspace-root 命令。PUBLIC_API_BASE_URL 留空，不把 GitHub Token 或 JWT_SECRET 放到帽子云前端变量中。

Markdown 在 Cloudflare 后台保存到 GitHub 后，两边的 Git 自动部署都会重建原有文章、目录、搜索及 RSS。D1 在线文章独立保存在 Cloudflare，帽子云静态站不会自动获得 D1 后端能力。

Cloudflare 构建使用 pnpm build:cloudflare，部署使用 pnpm exec wrangler deploy --config wrangler.api.jsonc；不要混用纯静态配置覆盖 Cloudflare 全栈 Worker。
