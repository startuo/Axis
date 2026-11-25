# Axis · STAR 的个人博客

> 理解前沿技术 → 构建能跑的系统 → 观察商业变化 → 把复杂问题讲清楚。AI爱好者。

这是 **STAR（Axis）** 的个人博客与内容平台源码仓库，基于 Astro 5 + Svelte 5 主题深度改造，配套轻量级 Cloudflare Workers + D1 + KV 全栈后端与自动静态镜像流水线。

- **主站（Cloudflare Workers SSR + D1）**：`https://axis.1669338073.workers.dev`
- **国内静态镜像（帽子云）**：`https://star-0vl490158.maozi.io`
- **X / Twitter**：[@star_xiao7920](https://x.com/star_xiao7920) · **关于我**：[src/content/spec/about.md](src/content/spec/about.md)

---

## 关于ME

狗屎本科在读（AI / 软件工程方向，2027 届），主要玩各种 Coding Agent 。

关心：从大模型的底层能力边界，到 **Agent 运行时可靠性、Harness 工程、Skill / 记忆机制、中断恢复**，再往外延伸到本地模型量化推理（Ollama / GGUF）、偏视觉表现力的前端交互（WebGL / Shader / 动效），以及技术如何真正传导到商业和内容生产里。

所有知识沉淀都留在本地 Obsidian Vault 的 Markdown 里，再单向同步到这里。写代码和写文章之外，喜欢动漫、音乐和旅行，26年下半年不亏成傻逼的别和我说话。这个博客算不上什么宏大作品，就是一份公开的笔记本和工程实验田。

---

## 架构与核心特性

| 模块          | 实现方式                                        | 说明                                                             |
| ----------- | ------------------------------------------- | -------------------------------------------------------------- |
| **前台界面**    | Astro 5 + Svelte 5 + Tailwind CSS 4 + Swup  | 明暗主题、自定义字体、分类/标签/归档、Pagefind 搜索、追番/日记/相册/留言弹幕墙                 |
| **全栈后端**    | Cloudflare Workers + D1 + Workers KV（可选 R2） | 零外部服务器依赖，提供文章/追番/日记/相册 CRUD、草稿与发布隔离、乐观锁、留言审核、个人中心              |
| **双站镜像**    | Worker Cron → GitHub Actions → `mirror` 分支  | 发布或审核后自动导出一致的公开快照并推送至 `mirror` 分支，国内静态站独立下载图片并构建离线可访问站点        |
| **知识库同步**   | `scripts/sync-obsidian.mjs`                 | 从本地 Obsidian 知识库按清单单向同步，自动转换双链、Front Matter、货币转义与本机路径脱敏，不污染源笔记 |
| **资产与构建保障** | `scripts/audit-assets.mjs` + 多目标冒烟检查        | 校验真实文件签名与历史 URL 兼容别名，覆盖 Cloudflare / Static / Mirror 三种目标构建    |

### 安全设计概览

- **认证与会话**：PBKDF2-SHA256（100,000 次迭代 + 随机盐 + 恒定时间比对 + 防账号枚举）；强制 >= 32 字节非占位 `JWT_SECRET`；浏览器端使用 `HttpOnly; SameSite=Strict; Secure` Cookie（写操作强制同源 `Origin` / `Sec-Fetch-Site` CSRF 校验，不向 `localStorage` 写令牌），管理员会话 24h 有效期并实时回查数据库角色；同时向后兼容 `Authorization: Bearer` 供迁移/冒烟脚本调用。
- **限流与防滥用**：登录失败按 `(账号 + 来源 IP)` 隔离计数，避免单点撞库锁死管理员真实 IP；支持 `ALLOW_REGISTRATION="false"` 一键关闭公开注册；普通用户媒体上传限定 `<= 512 KB`、单账号最多 2 张活跃图片（换头像自动清理旧图）并设全局日限额，所有媒体均校验真实文件头魔数并附带 `Content-Security-Policy: default-src 'none'; sandbox`。
- **内容与运行时防护**：全参数化 D1 查询；Markdown 经 `rehype-sanitize` 白名单、iframe 限 YouTube/Bilibili 沙箱、KaTeX `trust: false`、Mermaid `strict` 模式渲染；Worker 入口显式拦截 `/_image` 路径。

---

## 快速开始与自部署

环境要求：Node.js 22.13+（或 24）、pnpm 10.22.0。

### 1. 本地纯静态预览（无需 Cloudflare 账号）

```bash
pnpm install --frozen-lockfile
pnpm dev:web
```

构建纯静态站点与 Pagefind 索引（产物位于 `dist/`）：

```bash
pnpm build:static
pnpm preview
```

### 2. 本地全栈联调（Workers + 本地 D1）

```bash
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中写入至少 32 字节的随机本地 JWT_SECRET

pnpm db:migrate:local
pnpm build:cloudflare
pnpm dev:cloudflare
```

### 3. 部署到你自己的 Cloudflare 账号

1. 复制 [wrangler.api.example.jsonc](wrangler.api.example.jsonc) 覆盖 `wrangler.api.jsonc`，创建并填入你自己的 D1 与 KV ID：
   
   ```bash
   pnpm exec wrangler d1 create axis-db
   pnpm exec wrangler kv namespace create axis-media
   ```
2. 设置生产密钥并执行远端建表：
   
   ```bash
   pnpm exec wrangler secret put JWT_SECRET --config wrangler.api.jsonc
   pnpm db:migrate:remote
   ```
3. 可选关闭公开注册：在 `wrangler.api.jsonc` 的 `vars` 或 Cloudflare 控制台设置 `ALLOW_REGISTRATION="false"`。
4. 构建并发布：
   
   ```bash
   pnpm deploy:cloudflare
   ```
5. 首次注册账号后，在 Cloudflare D1 Console 将该账号提升为管理员：
   
   ```sql
   UPDATE users SET role = 'ADMIN' WHERE email = 'your-email@example.com';
   ```

> 完整的双站镜像、GitHub Actions Secrets 与国内静态镜像部署步骤见 [docs/CONTENT_PLATFORM.md](docs/CONTENT_PLATFORM.md) 与 [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md)。

### 4. 从 Obsidian 知识库单向同步

将文章路径配置在 [scripts/obsidian-manifest.json](scripts/obsidian-manifest.json) 中，执行：

```bash
pnpm sync:obsidian --source "<your-obsidian-vault>/知识归纳"
pnpm sync:obsidian --source "<your-obsidian-vault>/知识归纳" --check
```

---

## 常用测试与验证命令

```bash
pnpm test:worker           # Workers API、认证/CSRF、限流、配额与 D1 单元测试
pnpm test:frontend         # 前端生命周期与上传组件测试
pnpm audit:assets          # 静态资源完整性与真实格式签名校验
pnpm test:assets           # 资源别名与历史 URL 兼容测试
pnpm check && pnpm type-check
```

---

## 文档导航

- [内容平台架构与双站上线说明](docs/CONTENT_PLATFORM.md)
- [Cloudflare Workers + D1 部署指南](docs/CLOUDFLARE_DEPLOYMENT.md)
- [Obsidian 文章同步说明](docs/OBSIDIAN_SYNC.md)
- [国内静态镜像部署](docs/MAOZIYUN_DEPLOYMENT.md)
- [安全审查与修复记录](docs/security-fixes.md)
- [工程验收报告归档](docs/reports/)
- [完整文档目录](docs/README.md)

## 许可

代码部分保留原主题 [Apache-2.0](LICENSE) 与 [MIT](LICENSE.MIT) 许可及相应版权声明。博客原创文章、个人标识与图片素材默认遵循站点声明（CC BY-NC-SA 4.0）或各自来源协议，复用前请另行确认。
