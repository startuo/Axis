# Obsidian 文章同步

本次经确认同步「知识归纳」根目录的 20 篇文章；不包含内部知识沉淀协议、Codex 记忆库或 Skills。原有 7 篇博客文章及 Vault 原文保持不变。

```powershell
pnpm sync:obsidian --source 'D:/OneDrive/文档/Obsidian Vault/知识归纳'
pnpm sync:obsidian --source 'D:/OneDrive/文档/Obsidian Vault/知识归纳' --check
pnpm build:static
```

也可以设置本机环境变量 `OBSIDIAN_ARTICLES_DIR` 后省略 `--source`。云端无需访问 Vault，直接构建已经同步并提交的文章与资产。静态构建脚本不会调用原有远端内容同步或更新追番数据，避免覆盖本地同步成果。

同步范围由 `scripts/obsidian-manifest.json` 明确列出，固定英文 slug 保持链接稳定。输出位于 `src/content/posts/obsidian/`，再次同步会更新这 20 篇发布副本；博客里的修改应先回到源笔记，否则下次同步会覆盖。脚本不会删除不在清单内的文件。

转换保留正文与代码示例，移除模板已显示的正文一级标题，适配 YAML 日期、货币符号和代码高亮标识。同批文章的双链转为博客链接；未同步笔记的双链保留可读名称，清单记录在 `docs/obsidian-sync-report.json`。跨文档标题链接目前落到目标文章，未保留 Obsidian 锚点。原文中的指令仅是文章内容，不会由脚本执行。

配图放在 `public/images/obsidian/<slug>.png`。文件存在时才写入封面字段，避免缺图请求；补齐配图后再次同步并构建即可。每张生成图的提示词与验证记录位于 `docs/illustrations/`。

## 本次配图状态

配图按文章逐一分配专属子代理，通过内置 image_gen 生成。已完成 20/20，每篇 1 张，并全部接入文章封面；逐篇记录见 `docs/obsidian-sync-report.json` 的 image 字段及 `docs/illustrations/` 的生成记录。

文章按用户指定源文同步，来源说明保留；本次没有重新核实正文中所有产品、价格和研究结论。
