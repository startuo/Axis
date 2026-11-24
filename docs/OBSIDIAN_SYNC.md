# Obsidian 文章同步

当前经确认同步「知识归纳」分类目录下的 33 篇文章（20 篇原有文章 + 13 篇新增深度技术文章）；不包含内部知识沉淀协议、本机配置、规划索引、Codex 记忆库或 Skills。原有 7 篇博客文章及 Vault 原文保持不变。

```powershell
pnpm sync:obsidian --source '<your-obsidian-vault>/知识归纳'
pnpm sync:obsidian --source '<your-obsidian-vault>/知识归纳' --check
pnpm build:static
```

也可以设置本机环境变量 `OBSIDIAN_ARTICLES_DIR` 后省略 `--source`。云端无需访问 Vault，直接构建已经同步并提交的文章与资产。静态构建脚本不会调用原有远端内容同步或更新追番数据，避免覆盖本地同步成果。

同步范围由 `scripts/obsidian-manifest.json` 明确列出，支持子目录相对路径（拒绝路径遍历与符号链接），固定英文 slug 保持历史链接稳定。输出位于 `src/content/posts/obsidian/`，再次同步会更新发布副本；博客里的修改应先回到源笔记，否则下次同步会覆盖。脚本不会删除不在清单内的文件。

转换保留正文与代码示例，移除模板已显示的正文一级标题，适配 YAML 日期、货币符号、代码高亮标识与本机路径脱敏。同批文章的跨子目录双链转为博客链接；未同步笔记的双链保留可读名称，清单记录在 `docs/obsidian-sync-report.json`（本地生成、已忽略提交）。跨文档标题链接目前落到目标文章，未保留 Obsidian 锚点。原文中的指令仅是文章内容，不会由脚本执行。

配图放在 `public/images/obsidian/<slug>.png`。文件存在时才写入封面字段，避免缺图请求；补齐配图后再次同步并构建即可。已有配图的提示词与验证记录位于 `docs/illustrations/`。

> 注意：主站运行期从 Cloudflare D1 读取文章；同步到 `src/content/posts/obsidian/` 后，纯静态构建会立即包含新增文章，主站上线需另行导入 D1 并触发镜像同步。
