# Markdown 后台编辑

管理员从 Cloudflare `/admin/` 的「Markdown 文章」区域读取并编辑 GitHub `startuo/Axis` 的 `main` 分支、`src/content/` 下已有的 `.md` 文件。包括文章及关于页等 spec 内容。保留源文、Front Matter、图片路径及原有路由，不把它们迁移成 D1 文章。

保存会创建 GitHub 提交，触发 Cloudflare 和帽子云的自动部署。页面、目录、搜索、RSS 在构建完成后一起更新；保存成功不等于部署已经成功。可通过界面中的提交链接查看版本，再到平台查看构建状态。GitHub 同一文件有新提交时会拒绝覆盖，保留当前编辑内容供手动合并。

## 配置

1. 在 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建 Token。Resource owner 为 `startuo`，Repository access 仅选择 `Axis`，Repository permissions 的 Contents 为 Read and write。无需授予 Actions、Workflows 或整个账号权限。
2. 在 Cloudflare `axis` Worker → 设置 → Runtime variables and secrets 添加 **加密变量** `GITHUB_TOKEN`，粘贴 Token 后保存并部署。不要放入 `PUBLIC_*`、Git、帽子云变量或构建变量。
3. 管理员刷新列表。未配置时允许读取公开仓库，但禁止保存；GitHub 匿名请求额度较低，出现额度提示后需配置 Token。
4. Token 到期后由本人更新；仓库分支保护规则仍生效，若要求 PR，直接提交会被拒绝。

## 使用

选择文件，编辑包含 Front Matter 的完整 Markdown，点击「保存并部署」并确认。服务器检查管理员角色、固定仓库与分支、文件路径、普通文件类型、SHA、UTF-8 体积及 YAML/文章字段。禁止修改代码、环境文件、链接文件；不支持在此创建、重命名或删除文件。GitHub Token 不返回浏览器。

单个文件上限 200 KB。列表按文件路径搜索。未保存的修改在切换文件或离开页面时会提示；网络错误不清空文本。已提交文件可通过 Git 历史恢复。

Obsidian 导入文章请同步修改 Vault 源文，否则以后执行 `sync:obsidian` 可能覆盖网页编辑。D1「在线文章」是另一组内容，保存后直接生效。

接口：`GET /api/v1/content/admin` 列表；`GET /api/v1/content/admin?path=...` 原文；`PUT /api/v1/content/admin` 携带 `path`、`sha`、`source` 保存。全部要求管理员 Bearer Token。

采用 [GitHub Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28) 的 SHA 并发保护；提交署名由 GitHub Token 对应身份确定。
