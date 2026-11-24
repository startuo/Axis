# STAR 内容平台实施与上线说明

截至 2026-10-01，Cloudflare 主站与帽子云静态镜像均已发布，生产 D1 迁移与 54 条历史内容导入完成。原始 Markdown、相册文件和旧 D1 `articles` 表保留。帽子云使用 `mirror` 分支与 `build:mirror` 命令，线上版本 58 与 GitHub Actions 完成回调已验证。

## 架构结论

- 后台界面重写为 `src/components/console/`：管理员与会员共用登录、布局、浅深色主题；业务表单分别维护。旧的伪资料、评论历史和 GitHub Markdown 管理入口已退役。
- 后端保留已验证的账户认证、权限与留言逻辑，拆分内容、资料、媒体、镜像模块，无需引入新的服务框架。
- 公开前台保留原有 Astro / Svelte 视觉和导航，改为 Cloudflare 按请求读取 D1。发布、下架、搜索、RSS、站点地图使用同一公开版本。主站不再依赖重新构建来展示文章。
- `entries.draft` 与 `entries.published` 分离；保存不改变已公开内容。版本号用于乐观锁，冲突返回 409；回收站可恢复为草稿。
- Workers KV 保存原图（保留可选 R2 适配），浏览器生成 `display` 与 `thumb` 衍生图；不支持解码时仍保留原图。媒体引用表阻止移除正在引用的图片，移除仅标记删除。
- 原始 Markdown 保留为导入来源和备份；上线后的公开内容以 D1 为准，不自动覆盖管理员后续编辑。

已核对的两个站点如下：

| 站点 | 地址 | 运行方式 |
|---|---|---|
| 主站 | https://axis.1669338073.workers.dev | Worker + Astro SSR + D1 + Workers KV |
| 国内镜像 | https://star-0vl490158.maozi.io | 猫子云静态站，独立图片、正文、Pagefind |

镜像上的后台与会员入口跳转主站；只展示审核通过的留言，发送留言跳转主站。

## 内容和接口

统一管理路径为 `/api/v1/content/manage/{posts|anime|diary|albums}`，支持分页列表、新建、保存、发布、下架、回收站及恢复。文章链接创建后固定，原路径保存在 `content_routes`；根级固定链接或 `/posts/` 多级链接可用。

公开查询为 `/api/v1/content/public/{kind}`。个人资料、自己的留言、收藏与阅读历史使用 `/api/v1/me/`，按账户隔离。图片上传使用 `/api/v1/media`，公开读取 `/media/{id}`；管理员 20 MB 单文件上限，普通会员限定 512 KB 单文件上限且每账号最多 2 张活跃图片（换头像自动清理旧图）。

留言前端统一请求 `limit=100`，页面可见时每 15 秒刷新，重新切回页面立即刷新。审核变化与内容发布在同一 D1 事务中增加公开版本并创建镜像任务。

Markdown 渲染在后台预览和前台共享，支持标题、表格、公式、Mermaid、白名单视频；过滤脚本、事件属性和危险协议。原主题的非标准自定义指令不保证全部等效渲染，上线前应逐篇抽查旧教程文章。

## 镜像同步

1. Worker 定时触发 GitHub `repository_dispatch`，合并被新版覆盖的任务。
2. `.github/workflows/mirror.yml` 拉取一致的 D1 公开快照（不含账户、私人资料、未发布编辑稿），同时归档到 Workers KV（保留 30 天，Git 历史长期保存公开快照）。
3. 工作流将快照及当前代码推送到仓库 `mirror` 分支，猫子云监听该分支。
4. 猫子云运行 `pnpm install --frozen-lockfile`、`pnpm build:mirror`，产物目录 `dist`。使用 Node 22.18+ 或 Node 24。
5. 构建下载快照引用的远程图片、保留原图并改写为本地地址；任一图片下载失败会使构建失败，不能将缺图版本标为成功。
6. 工作流回调服务端；只有在线 `/mirror-version.json` 版本匹配才记录完成。超时任务重试，最多 5 次，后台支持重新同步最新版本。

外部视频播放器和原主题音乐等第三方组件仍需要各自服务可访问；镜像独立性指正文、相册图片与搜索可脱离主站阅读。

## 本地验证

```powershell
pnpm test:worker
pnpm check
pnpm migrate:content                    # 仅生成 .axis/migration.json
pnpm build:cloudflare
pnpm exec wrangler d1 migrations apply DB --local --config wrangler.api.jsonc
pnpm dev:cloudflare                     # 本地 .dev.vars 配置测试 JWT_SECRET
```

`scripts/smoke-local.mjs` 只接受 localhost，使用 `AXIS_SMOKE_ACCOUNT`、`AXIS_SMOKE_PASSWORD` 中的本地管理员。它检验发布、SSR、首页、搜索、RSS、站点地图、草稿隔离、资源 MIME 和留言审核，结束时将自己创建的文章移入本地回收站。

```powershell
node scripts/smoke-local.mjs
# 独立镜像输出，避免覆盖正在测试的主站 dist
$env:AXIS_OUT_DIR='.axis/mirror-dist'
node scripts/mirror-build.mjs <公开快照文件>
```

## 正式上线顺序（已完成，保留供后续部署参考）

1. 核对两个站点、GitHub 仓库 `startuo/Axis`（旧名称 `startuo/Axis-` 自动跳转） 和猫子云仍使用该静态项目；备份现有 D1、Worker 版本和猫子云部署版本。
2. 建立 Workers KV 命名空间 `axis-media` 并绑定 `MEDIA_KV`，核对 D1 `axis-db` 绑定。保留现有 `JWT_SECRET`，通过 Cloudflare secret 配置 `MIRROR_TOKEN` 与 `MIRROR_GITHUB_TOKEN`，不得写入源码或聊天。GitHub token 仅授予此仓库所需权限。
3. GitHub Actions 配置同值 `MIRROR_TOKEN` 和推送用 `MIRROR_PUSH_TOKEN`。推送令牌用于触发镜像分支的外部构建；不在工作流输出令牌。
4. 经授权后应用 `0002_content_platform.sql` 并部署 Worker。迁移保留旧文章表，新后台停用旧文章写入口。
5. 核对迁移清单后设置目标 `AXIS_MIGRATION_URL` 与临时管理员会话 `AXIS_ADMIN_TOKEN`，执行 `node scripts/migrate-content.mjs --apply`。按 sourceKey 去重，仅恢复版本仍为 1 的中断导入发布；已编辑的记录不覆盖。隐藏相册导入为草稿。若清单存在新复制的本地资源，需要随主站部署。
6. 配置猫子云监听 `mirror` 分支与上述构建命令。主站执行一次手动镜像同步，核对线上版本和图片，再验收真实账户的发布、审核、上传与会员数据。

回滚时优先恢复上一 Worker 和猫子云部署，保留新增 D1 表与原始内容备份。不要通过删除新表来回滚；需要恢复数据库时另行核对写入时间和备份范围。

## 当前验证边界

- 27 项 Worker/SQLite、KV 与 Markdown 测试通过，Astro 检查为 0 错误、0 警告；Cloudflare 构建、真实 workerd HTTP 联调及打包预检通过。服务端按源码引用裁剪图标，Worker gzip 2014.89 KiB。
- 本地 Edge 中已验证管理员登录、新建文章发布、留言提交与审核后的自动显示，以及桌面浅色和手机深色布局；这些不代表生产浏览器验收。
- 真实本地 Wrangler KV 原图上传、逐字节下载、ETag、HEAD、缩略图与原图回退、连续快照导出和可恢复移除通过；生产跨地区同步仍需上线验证。
- 本地图片夹具及完整历史公开快照均已完成静态镜像构建与 Pagefind 索引（28 个页面）；远程图片下载在本机需显式 HTTPS_PROXY，脚本支持该代理配置。隐藏相册不进入公开快照。Edge 中搜索 Agent 返回 19 条匹配。
- 生产管理员接口已验证：发布与 SSR 正文、审核后公开、KV 上传与下载字节一致、个人资料读取、收藏和阅读历史写入/移除、下架后 404；验收内容已清理。普通会员角色未单独实机验收。
- 生产导入共 54 条：27 文章、23 追番、1 日记、3 相册，其中 2 相册保持草稿。revision 58 的公开快照包含 52 条内容，本地完整镜像构建与 Pagefind 28 页索引通过。
- GitHub Actions 已实际完成快照导出、服务端 dispatch 和推送 `mirror` 分支，验证了相关 Secrets 的调用链，包含线上版本匹配后的完成回调。
- 帽子云线上版本 58（构建时间 `2026-10-01T13:57:28.421Z`）；27 篇文章均返回 200 并含预期标题，下载镜像图片 SHA-256 一致，Pagefind 索引 28 页，缺失路径返回 404。

## 2026-10-02 封面上传修复与主站部署

原图上传依据文件头识别真实 MIME，前后端共用 `shared/media.mjs`。文件扩展名或浏览器 `file.type` 与内容不一致时，客户端使用真实格式上传；服务端继续校验 MIME、鉴权及大小限制，原始文件名和字节不变。

- Worker 测试、`pnpm check` 与 `pnpm build:cloudflare` 通过。
- 隔离本地 Wrangler D1/KV 已验证 JPEG 内容上传、封面回填与预览，原图逐字节一致。
- 非图片、请求中断、非 JSON 错误后表单及已有封面保留，同一文件可重新选择；缩略图失败时公开读取回退原图。
- 2026-10-02 按授权部署 Cloudflare 主站并承接 100% 流量，沿用现有 D1/KV 和 Secrets，未执行破坏性迁移。

## 2026-10-02 头像加载与音乐续播修复

- `ImageWrapper.astro` 在 Cloudflare 下直接使用打包图片 URL，避免依赖 `/_image` 运行时端点，并保留尺寸、样式与加载属性；静态构建继续使用原 Astro `Image` 分支。
- 首页、关于页和追番页的头像均返回 `image/webp`，SHA-256 与源图一致。
- 音乐播放器顺序模式在尚有下一首时自动切歌，末曲结束后停止；单曲循环、列表循环和随机模式均已回归通过。
- Cloudflare 主站部署后健康检查与前端脚本哈希核验一致，沿用现有存储与 Secrets。

## 2026-09-30 存储替代方案

R2 暂无法开通，当前使用 Workers KV。KV 免费额度为 1 GB 存储、每天 1000 次写入；单值最大 25 MiB，后台设定管理员 20 MiB、会员 512 KiB（最多 2 张活跃媒体）的上传限制。原图和衍生图不设置过期；公开快照归档保留 30 天，已提交的 Git 快照另有历史。原图不写入公开代码仓库。

KV 跨地区可能延迟 60 秒或更久；数据库已登记但对象尚不可读时返回 503、Retry-After 和 no-store，镜像构建每 30 秒重试，最多重试 4 次。超过窗口仍失败则保留任务供后续重试。正文发布和审核状态仍由 D1 即时控制。

参考：https://developers.cloudflare.com/kv/platform/limits/ 与 https://developers.cloudflare.com/kv/concepts/how-kv-works/ 。将来切回 R2 必须先迁移并核对已有 KV 对象，不能仅替换绑定。
