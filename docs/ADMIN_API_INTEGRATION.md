> 历史文档：旧 NestJS 后端已移除，当前部署请使用 [Cloudflare 部署文档](CLOUDFLARE_DEPLOYMENT.md) 和 [帽子云部署文档](MAOZIYUN_DEPLOYMENT.md)。

# STAR's Blog Admin 前端对接文档

本文档面向本地 Admin 控制台和后续独立前端接入。当前成品 Admin 已集成在现有 Astro 项目中：

- Admin 页面：`http://localhost:4321/admin`
- API Base URL：`http://localhost:3001/api/v1`
- Socket namespace：`http://localhost:3001/dashboard`

## 1. 本地启动

必须在项目根目录执行 Docker Compose，否则会出现 `no configuration file provided: not found`。

```powershell
Set-Location "F:\一些乱起八糟的AI开发\Axis gw\Star个人博客后端测试"
docker compose up -d
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:seed
```

分别启动后端和前端：

```powershell
pnpm --filter api start:dev
pnpm dev
```

也可以使用根目录脚本：

```powershell
pnpm run admin:init
pnpm run dev:api
pnpm run dev:web
```

默认开发管理员：

```text
Email: admin@stars.blog
Username: star
Password: <ADMIN_PASSWORD>
```

## 2. Auth API

### 登录

`POST /auth/login`

```bash
curl -X POST "http://localhost:3001/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"account":"star","password":"<ADMIN_PASSWORD>"}'
```

返回：

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": "7d",
  "user": {
    "id": "uuid",
    "username": "star",
    "email": "admin@stars.blog",
    "role": "ADMIN"
  }
}
```

后续 Admin 请求统一携带：

```http
Authorization: Bearer <jwt>
```

### 当前用户

`GET /auth/me`

```bash
curl "http://localhost:3001/api/v1/auth/me" \
  -H "Authorization: Bearer <jwt>"
```

## 3. Article Admin API

### 查询文章

`GET /articles/admin?page=1&pageSize=10&status=PUBLISHED&keyword=nestjs`

```bash
curl "http://localhost:3001/api/v1/articles/admin?page=1&pageSize=10" \
  -H "Authorization: Bearer <jwt>"
```

### 创建文章

`POST /articles/admin`

```bash
curl -X POST "http://localhost:3001/api/v1/articles/admin" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "NestJS Dashboard Notes",
    "content": "# Hello\n\nMarkdown content.",
    "summary": "Admin-created article.",
    "category": "Backend",
    "tags": ["nestjs", "redis"],
    "status": "PUBLISHED"
  }'
```

### 更新文章

`PATCH /articles/admin/:id`

```bash
curl -X PATCH "http://localhost:3001/api/v1/articles/admin/<articleId>" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"status":"DRAFT"}'
```

### 删除文章

`DELETE /articles/admin/:id`

```bash
curl -X DELETE "http://localhost:3001/api/v1/articles/admin/<articleId>" \
  -H "Authorization: Bearer <jwt>"
```

## 4. Public Article API 与 PV/UV

公开文章列表：

```bash
curl "http://localhost:3001/api/v1/articles/public?page=1&pageSize=10"
```

公开文章详情会自动增加阅读量，并写入 Redis 指标：

```bash
curl "http://localhost:3001/api/v1/articles/public/welcome-to-stars-blog-admin" \
  -H "x-visitor-id: local-browser-001"
```

`x-visitor-id` 用于 UV 去重。没有传递时，后端会回退到 IP。

## 5. Dashboard Socket 用法

Admin 客户端连接：

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3001/dashboard", {
  query: { clientType: "admin" },
  auth: { token: "<jwt>" },
  transports: ["websocket", "polling"],
});

socket.on("dashboard:snapshot", (event) => {
  console.log(event.reason, event.data);
});
```

快照结构：

```ts
interface DashboardSnapshot {
  onlineVisitors: number;
  todayPageViews: number;
  todayUniqueVisitors: number;
  todayNewReadCount: number;
  hotArticles: Array<{
    articleId: string;
    slug: string;
    title: string;
    todayViewCount: number;
    totalViewCount: number;
  }>;
  generatedAt: string;
}
```

普通访客在线统计连接：

```ts
const visitorSocket = io("http://localhost:3001/dashboard", {
  query: {
    clientType: "visitor",
    visitorId: "browser-visitor-id"
  }
});

visitorSocket.emit("presence:heartbeat", {
  visitorId: "browser-visitor-id"
});
```

## 6. 常见问题

- `no configuration file provided: not found`：你不在项目根目录。先执行 `Set-Location "F:\一些乱起八糟的AI开发\Axis gw\Star个人博客后端测试"`。
- Admin 登录失败：先执行 `pnpm --filter api prisma:seed` 生成默认管理员。
- Socket 一直未连接：确认后端运行在 `3001`，并且登录用户角色是 `ADMIN`。
- 页面无热门文章：在 Admin 文章列表点击“模拟阅读”，或请求公开文章详情接口。
- 前端无法访问 API：确认 `apps/api/.env` 中 `CORS_ORIGIN=http://localhost:4321`。
