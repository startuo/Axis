# STAR 的个人博客

记录 AI 应用开发、Agent、前沿 LLM、Harness 与内容生产，也收藏生活、音乐和旅行中的片段。

我是 STAR，一名普通本科生。我对技术充满好奇，也关心它如何成为实际系统、进入商业世界并改变生活。这个博客是我的学习笔记、实践记录与独立思考的集合。

**理解前沿技术 → 构建实际系统 → 研究商业变化 → 把复杂问题讲清楚。**

[X / Twitter](https://x.com/star_xiao7920) · [个人介绍](src/content/spec/about.md)

## 网站功能

- Obsidian 文章同步、双链转换、文章元数据与独立配图。
- 明暗主题、主题 Logo 切换和本地萝莉体字体。
- 分类、标签、归档和 Pagefind 本地搜索。
- Cloudflare Workers + D1 提供认证、文章管理、留言审核与统计能力。
- 静态网站仍可独立部署；全栈部署步骤见下方文档。旧 NestJS 源码暂保留用于迁移参考。

## 本地运行

```bash
pnpm install
pnpm dev:web
```

构建与预览：

```bash
pnpm build:static
pnpm preview
```

产物位于 `dist/`。环境变量参考 `.env.example`。后端要求显式配置至少 32 字节的非占位 `JWT_SECRET`。

## 文档

- [Cloudflare 后端与 D1 部署步骤](docs/CLOUDFLARE_DEPLOYMENT.md)
- [Obsidian 同步](docs/OBSIDIAN_SYNC.md)
- [静态网站与后端部署](docs/MAOZIYUN_DEPLOYMENT.md)
- [功能与验证记录](docs/DELIVERY_CHECKS.md)
- [安全修复记录及验证边界](docs/security-fixes.md)
- [配图索引](docs/illustrations/README.md)

## 许可

保留现有 [Apache-2.0](LICENSE) 与 [MIT](LICENSE.MIT) 许可文件及相应版权声明。文章、个人标识与媒体素材的使用权限需分别确认。
