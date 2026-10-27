# Axis Phase 2 — 资源去重与构建可靠性报告

交付日期：2026-10-27；实施与测试记录为 2026-10-26。实施基线（发布前 HEAD）：`b42d0bdb1be04c35b23ed21e9a07a70f2ef31e22`。第 1–10 节记录本地实施验收时的状态：执行前工作区干净，验收阶段未提交、未推送、未部署，也未修改生产 D1/KV/Secrets/平台配置。

后续发布授权（2026-10-27）：用户已要求提交、推送并检查部署。下文的 Git HEAD、容量快照与远程 CI 未运行状态保留为发布前证据；后续状态以本补丁提交的工作流/部署回执及线上核验为准，不将本地结果直接视作生产验收。

**已移除 41 份源码重复副本，合计 45,302,565 bytes（43.20 MiB）；规范图片字节、尺寸及既有界面实现保持。历史地址由统一 Astro 构建钩子恢复，开发期使用虚拟路由。Windows/Linux 的质量检查、四个构建入口及烟雾验证 PASS，浏览器与本地回滚验证 PASS；远程 Phase 2 CI 与平台压缩设置明确保留 UNVERIFIED。**

## 1. 修改文件与原因

| 文件 | 修改及原因 |
|---|---|
| `scripts/asset-aliases.mjs`、`scripts/asset-integrity-baseline.json` | 将 41 个原件记录绑定到规范源，独立固定映射 SHA 与原因；统一预检、生成、产物验证和开发虚拟路由。108 个原始记录的 SHA、大小、宽高和格式均未改变。 |
| `scripts/asset-alias-integration.mjs`、`astro.config.mjs` | 共同 integration 覆盖 Astro 的各构建入口；旧 src 头像导入由 Vite resolver 映射到规范 PNG。开发服务不向 public/src 写文件。 |
| `scripts/build-static.mjs`、`scripts/build-cloudflare.mjs`、`scripts/mirror-build.mjs`、`package.json` | 移除部署包装器中重复的头像补拷贝，改由共同 hook 处理；静态和普通 build 对实际 outDir 建立 Pagefind。通过 Node 直接运行已安装 Pagefind 的 `lib/runner/bin.cjs`，支持 Windows 含空格路径并传播失败。 |
| `scripts/audit-assets.mjs`、`scripts/audit-assets.test.mjs`、`scripts/asset-aliases.test.mjs` | 审计理解已验证的虚拟旧路径；新增源副本重新出现、映射漂移、穿越、大小写、链接、碰撞、开发 GET/HEAD 和产物篡改等检查。 |
| `scripts/build-smoke.mjs`、`scripts/fixtures/asset-build-snapshot.json` | 验证指定产物的旧 URL、引用、字体、SSR/静态结构、Pagefind、镜像版本、真实夹具文章、KaTeX、封面与 Fancybox 原图顺序。预期从指定输入/产物推导，不依赖其他构建的临时快照。 |
| `scripts/font-compression.test.mjs`、`tsconfig.assets.json` | 用实际字体脚本执行及前后哈希检查替代不存在的测试文件；只扩展资产工具的局部严格类型检查。移除没有 ESLint 依赖/配置的失效 lint 命令；现有 CI 没有依赖该命令。 |
| `.github/workflows/assets.yml` | 保留 Windows/Ubuntu 快速门禁，增加前端、Worker、字体测试；独立 Ubuntu job 执行三类构建及离线烟雾验证。只读权限，无部署步骤。 |
| `docs/ASSET_MAINTENANCE.md`、`docs/MAOZIYUN_HTTP_COMPRESSION_HANDOFF.md`、本报告及 `CHANGELOG.md` | 明确历史/内容资产维护边界、平台交接、未发布状态和可复核证据。 |
| 40 个 public 历史副本、`src/assets/images/avatar.webp` | 仅删除与规范源逐字节相同的副本；完整逐路径结果见文末。独有的静态优化头像 `public/_astro/avatar.nWn5Mszy_18wN4e.webp` 保留。 |

没有修改应用组件、页面、CSS、Banner 预加载/轮播、Sakura、Pio、MusicPlayer、Swup、Fancybox、字体配置、Worker 逻辑、数据库迁移或线上配置。没有图片重编码、降分辨率或字体子集化。已撤回的 CSS 加载实验没有重新实施。既有可选内容同步 prebuild/predev 保持原样；验证显式设置 `ENABLE_CONTENT_SYNC=false`，没有添加吞掉质量检查失败的步骤。

## 2. 去重与容量对照

源码物理历史副本：**41 → 0**，对应字节 **45,302,565 → 0**。其中 public 40 份 44,908,288 bytes，src 头像 394,277 bytes；规范文件全部保留。构建仍需 42 个历史 URL，共 **45,331,613 bytes**，包含独有静态优化头像 29,048 bytes。开发期另有 1 个 src 虚拟路径，总计 43 个映射。

<!-- CAPACITY_TABLE -->

| 指标 | 前 | 后 | 状态/口径 |
|---|---:|---:|---|
| Git HEAD 文件树路径总字节 | 208404123（527 路径） | 208404123（527 路径） | PASS；尚未提交，HEAD 不变 |
| Git HEAD 去重 blob 总字节 | 161349078 | 161349078 | PASS；不含历史对象/pack/clone 开销 |
| 候选源码文件逻辑字节 | 208418123（527 文件） | 163190891（495 文件） | PASS；净减少 45227232 bytes |
| 上述源码文件实际分配字节 | 209438984 | 164157560 | PASS；净减少 45281424 bytes |
| 源码历史副本 | 45302565（41 份） | 0（0 份） | PASS；规范源未改 |
| 每个产物的历史兼容 URL 字节 | 覆盖因入口而异 | 45331613（42 URL） | PASS；不是源码去重收益 |

<!-- /CAPACITY_TABLE -->

统计范围是 Git 跟踪及未忽略的候选源码文件，排除 `.git`、`node_modules`、`.axis`、`dist`、`output` 和忽略的本地配置。工作区逻辑字节含 Windows 换行；实际分配字节由 Windows `FILE_STANDARD_INFO.AllocationSize` 累计，不含目录/MFT 元数据。新增工具、测试及文档计入候选源码，因此净减少量小于被删除副本的原始总量。

Git HEAD 尚未形成新提交，故当前 Git 文件树不变；Git 对相同 blob 本就可去重，本补丁也未清理历史，**不声称 clone 减少 43 MiB**。构建输出保留历史兼容副本，**不声称产物或单页传输减少 43 MiB**。

<!-- BUILD_SIZE_TABLE -->

| 产物快照 | 前 files / bytes | 后 files / bytes |
|---|---:|---:|
| cloudflare | 619 / 222664770 | 618 / 222663097 |
| mirror | 532 / 225992257 | 532 / 225992257 |
| static | 485 / 224287526 | 529 / 225348296 |

<!-- /BUILD_SIZE_TABLE -->

上述产物为实际目录快照，前后索引和旧兼容输出覆盖不同，不能把全部差值归于源码去重。Cloudflare 快照差 1 个文件、1,673 bytes，未保留原目录逐文件快照以确认原因，因此不据此主张优化收益；新静态包装器包含 Pagefind，并补齐共同历史头像 URL。完整公开快照镜像的文件数和总字节相同。原始统计在 `.axis/phase2/before-sizes.json`、`after-sizes.json`。

单次页面实际传输节省：**UNVERIFIED**。现有生命周期测试含热导航缓存及第三方请求，未作为可比较的冷加载完整页面计量；本报告不以逻辑文件字节或压缩样本替代该指标。

## 3. 历史 URL 与资源完整性

**PASS**：全部 42 个历史构建 URL，以及 40 个规范 public URL，在 Astro preview 和 Wrangler `--local` 各完成 82 次 GET；开发服务器完成 83 次 GET，另验证旧头像 `?import` 返回有效 JavaScript。合计 247 次图片请求及 1 次模块请求，全部 HTTP 200，响应大小和完整 SHA 与固定基线相符，无重定向。

**PASS**：生成及审计验证全部规范源、产物旧地址与规范 public 输出；106 张物理图片、2 个字体、41 个虚拟别名，0 错误，30 条超预算告警。108 个原始记录与 Git 基线的 SHA/大小/宽高/格式字段一致。没有把原始体积告警改成忽略或对图片自动压缩。

旧 `.webp`/`.ico` 等地址刻意保留旧扩展名对应的响应 MIME，真实字节仍是原文件；这是已有历史契约。规范新地址的扩展名符合文件签名，不能把两类地址混报为全部 MIME 已修正。

相册封面仍为规范 `cover.png`；原有 22 张图片的实际 `data-src` 原图 URL、顺序与基线一致。浏览器 Fancybox 加载同一 1920px 原图并验证缩放。字体及独有旧静态优化头像均保持固定 SHA，后者仍为原 602×602、29,048-byte WebP。

完整请求、MIME、字节和 SHA：`.axis/phase2/http-compat.json`；源码/产物审计：`final-audit.json`；逐路径结果见附表。

## 4. 所有构建入口实测

| Windows 命令与目录 | 状态 | 验证结果 |
|---|---|---|
| `pnpm build:cloudflare` → `dist` | PASS | SSR Worker、ASSETS 忽略规则、路由清单、42 条历史 URL；产物烟雾通过。 |
| `pnpm build:mirror scripts/fixtures/asset-build-snapshot.json` → `.axis/phase2/mirror-fixture` | PASS | 离线夹具，27 页，141 个本地资源 URL；Pagefind、revision 1、数学公式、原图顺序及封面通过。 |
| `pnpm build:mirror .axis/frontend-release-public-snapshot.json` → `.axis/phase2/mirror` | PASS | 既有 revision 60 公开快照，27 篇文章、22 张相册原图；56 页、209 个本地资源 URL、Pagefind 与版本标记通过。只读取公开媒体，没有读取生产 D1/KV 或编辑接口。 |
| `pnpm build:static` → `.axis/phase2/static` | PASS | 56 页、207 个本地资源 URL、全部历史 URL、Pagefind、RSS、sitemap 通过。 |
| `pnpm build` → `.axis/phase2/normal build` | PASS | 含空格的自定义 outDir、正常前置步骤及字体压缩步骤实际执行，静态烟雾通过。 |
| `pnpm dev` / `pnpm preview` 的 Astro 服务 | PASS | 旧 URL 实际响应与旧源导入通过；所有命令后源目录旧副本仍为 0，无须手工恢复。 |

烟雾检查负例：在隔离夹具产物中分别移除 KaTeX 标记、将 Fancybox 原图改为另一张存在的图片，两次均退出 1 并给出对应失败；恢复原字节后 PASS。证据 `smoke-negative.json`。开发/预览使用安装版本 Astro 5.18；共同 `astro:build:done.dir` 直接取客户端产物根目录，Cloudflare 与静态实测确认。

诊断记录：第一次 Pagefind 包装器验证因入口写为 `.js` 失败，已按实际安装包改为 `.cjs`；补充镜像检查时发现旧临时快照依赖，已修复并重新验证。这些初始失败不算 PASS；表中状态均为修复后的实际结果。

## 5. 工程门禁、CI 与跨平台证据

Windows 环境：Node 24.14.0、pnpm 10.22.0；远程矩阵要求的 Windows Node 22 仍按未运行的 CI 处理。

| Windows 本地命令 | 状态 |
|---|---|
| `pnpm audit:assets --output dist` | PASS，0 errors / 30 budget warnings |
| `pnpm test:assets` | PASS，19/19 |
| `pnpm test:frontend` | PASS，16/16 |
| `pnpm test:worker` | PASS，33/33 |
| `pnpm test-font-compression` | PASS，1/1；真实执行、当前配置不改写字体 |
| `pnpm check` | PASS，0 errors / 0 warnings / 4 hints |
| `pnpm type-check` | PASS，应用及资产工具检查 |
| CI YAML 解析/门禁结构、`git diff --check` | PASS |

<!-- LINUX_RESULT -->

Linux 本地：**PASS**。官方 `node:22-bookworm-slim` 隔离容器，Node 22.23.4、pnpm 10.22.0、Linux x86_64 / WSL2；冻结锁文件安装后，17 个步骤全部成功：版本记录、资产审计、资产 19/19、前端 16/16、Worker 33/33、字体 1/1、Astro、类型检查、Cloudflare 构建/烟雾、静态构建/烟雾、普通构建/烟雾、离线镜像构建/烟雾、Git 源码无修改检查。普通构建同样使用含空格的 outDir，三个目标的 42 个历史 URL、Pagefind 与镜像标记均通过。

17 个相关代码、配置及锁文件的 SHA 与 Windows 候选逐字节相同。日志已导出到 `.axis/phase2/linux-evidence/`，运行总回执 `linux-run.log`，文件指纹为 `windows-code-fingerprint.json` / `linux-code-fingerprint.json`。容器未挂载生产配置、账号凭据或 D1/KV，没有连接本机 PostgreSQL/Redis。安装阶段遇到 Debian HTTP 源慢和基础镜像缺少系统 CA，使用官方 HTTPS 源并以 Node 内置根证书启动信任、安装正式 ca-certificates 后解决；没有关闭 TLS 校验，也没有跳过检查。

<!-- /LINUX_RESULT -->

远程 Phase 2 GitHub Actions：**UNVERIFIED**。本轮禁止推送，未产生该候选补丁的远程 run。既有 Phase 1 `40258153780` Windows/Ubuntu 成功仅作为历史基线，不冒充本轮结果。CI 新增内容为：两系统前端/Worker/字体测试、原有资产/Astro/类型门禁；`needs: audit` 的 Ubuntu 重型 job 执行 Cloudflare、静态、离线镜像构建及各自烟雾，失败会使 job 非零退出，最后检查跟踪源码无修改。没有生产凭据、远程数据库操作或部署步骤。

本地完整质量日志保留于 `.axis/phase2/`；该目录、截图、原始 HTTP 取证、容器导出和回滚副本均未纳入发布文件。

## 6. 资产审计与基线维护策略

**PASS**：移除旧路径的实体格式豁免，所有实际源码图片均必须扩展名/签名一致；旧引用只在整个映射预检成功后作为虚拟资源接受。审计会拒绝把任何旧实体副本重新加入源目录。构建后验证不依赖源码里仍有旧文件。

`historical`、`immutable`、`content` 分别表达历史 URL、固定字体/优化产物和可审查演进的内容资产；普通内容变化也必须显式更新对应元数据，不会自动重写 hash。历史别名拥有独立 SHA，改分类不能绕过历史字节约束。涉及历史 Banner/头像更新时使用新文件名并保留旧字节与映射，详见 [维护说明](docs/ASSET_MAINTENANCE.md)。

生成前完整校验映射与目标，拒绝缺失源、SHA 漂移、Windows/POSIX 穿越、大小写冲突、链接/目录联接、规范 URL 冲突及不同字节的目标覆盖；写入使用排他创建并再次核对源 SHA，生成后再次验收。相同字节的既有输出可幂等复用。

## 7. 浏览器视觉与生命周期回归

**PASS**：复用现有真实 Edge 156.0.4314.42 浏览器工具，在本地静态产物验证 1440×1000 和 390×844。每个尺寸执行 20 轮归档/相册往返及 10 轮文章往返，检查 Banner/全屏图片解码就绪、轮播节奏、三种背景模式切换、明暗主题、持续音乐/Pio 节点、Fancybox 原图和缩放、导航后的 DOM/监听器界限及已卸载 Observer 清理；0 errors、0 failures。音乐网络使用已有确定性夹具；真实线上音乐服务与物理手机性能不在这份本地证据内。

18 组稳定截图覆盖 1440/900/390 宽度 × banner/fullscreen/none × 明暗主题，前后视口和稳定等待一致，全部布局几何相同。超过 16 通道差值的像素最大占 0.004445%；少量差异集中在文字边缘。低幅合成差异仍存在，**不是逐像素完全相同**。已人工查看桌面、移动全屏和最大片差图，未见布局或资源质量退化。

截图仅使用现有测试样式遮住不可重复的樱花/Pio、打字机与音乐显示，生产源码和动画没有禁用；动态行为在前述运行中单独验证。证据：`output/playwright/frontend/phase2-before/`、`after-phase2/results.json` 与 `.axis/phase2/visual-comparison.json`。这些证据不替代生产部署验收。

## 8. 帽子云 gzip/Brotli

**PASS（取证一致性）/ UNVERIFIED（账号压缩能力与设置）**：复核上一轮 JSON 及原始 HTTP 证据，再对当前已发布站点显式请求 identity/gzip/br，保存未自动解压的响应体和原始头。三类样本均 HTTP 200，未返回 Content-Encoding；同 URL 的响应体大小与解码 SHA 在三种协商下相同。

<!-- COMPRESSION_TABLE -->

主资源复采时间：2026-10-26T12:44:58.284Z。

| URL | identity / gzip / br 响应体 bytes | Content-Encoding | 三次解码 SHA-256（相同） |
|---|---:|---|---|
| `/` | 272914 / 272914 / 272914 | 无 / 无 / 无 | `c85b2d5869113ed23851e38913ca2bad2e95f346a61c4af66b70db4ad68a350e` |
| `/_astro/Layout.BLtwrKYq.css` | 14072 / 14072 / 14072 | 无 / 无 / 无 | `466bdf1997e83823f1568ec1fd715ba0c71c62e9931f38117e94e07cee24d427` |
| `/_astro/MusicPlayer.3Lgwvq5y.js` | 24278 / 24278 / 24278 | 无 / 无 / 无 | `c494d5586697885d3c6f49385aadf708edb4cc6181215ffc6a7928ad02317a66` |

<!-- /COMPRESSION_TABLE -->

初次采样还覆盖 Pio CSS（6,892 bytes）和页面 JS（1,832 bytes），结果相同。实际响应带 `Cache-Control: max-age=1200`、`My-Cache-Status: HIT` 与 `cf-cache-status: MISS`；这不说明浏览器命中，也不把某一层 MISS 当作压缩故障。`curl size_download` 仅指响应体实际下载字节，不含 TLS/头部。没有用本地 gzip 体积冒充线上收益。

已查阅官方[常见问题](https://www.maoziyun.com/docs/asked-question)、[构建设置](https://www.maoziyun.com/docs/deploy/build)及[环境介绍](https://www.maoziyun.com/docs/environment/intro)，未取得可确认的 gzip/Brotli 设置路径；官方 FAQ 的 20 分钟说明是浏览器缓存，不能证明压缩能力。支持问题、取证附件与开启后的验收步骤已写入 [技术支持交接](docs/MAOZIYUN_HTTP_COMPRESSION_HANDOFF.md)，未向外发送，未修改任何平台设置。

## 9. 未解决项与独立审查

- **UNVERIFIED**：本轮远程 Actions，无推送授权且规格禁止推送，因此保留本地/远程证据边界。
- **UNVERIFIED**：帽子云账号压缩设置及能否开通，公开文档没有确认路径，未进入有权限的控制台；交接已就绪。线上样本未压缩是已观测事实，不代表所有节点/协议的完整能力断言。
- **UNVERIFIED**：单页冷加载传输节省、真实手机性能和本轮生产浏览器验收；没有新部署，也没有可比较的完整冷加载数据。
- **PASS**：独立只读审查，首次全量及最终烟雾/文档增量复审均无有证据的 Critical / Required / Optional / Nit。审查者另跑资产测试 19/19 和 diff 检查；没有替主 Agent 声称 Linux、生产或远程 CI 通过。

没有以跳过测试、放宽全部检查或新增大范围忽略规则获得通过。30 条资源预算告警保留，后续优化不在本轮执行。

## 10. 回滚方案与实际验证

**PASS（本地基线恢复演练）**：用 `git archive b42d0bd` 在 `.axis/phase2/rollback-source` 恢复完整基线，独立 Git 索引并复用依赖，不覆盖主工作区。执行原审计、原资产测试 **8/8**、原 `pnpm build:static` 及 Pagefind 成功；108 个原件、41 对旧/规范文件以及 40 个旧 public 产物的 SHA 全部一致。与当前 manifest 的 108 个原始元数据字段再次比较一致。证据：`rollback-verification.json`、`rollback-audit.log`、`rollback-assets.log`、`rollback-build.log`。

当前未提交阶段如需回滚：先保存本地差异，确认没有后续用户改动；只从基线恢复第 1 节列出的既有跟踪文件及 manifest 中的 41 个旧路径，再删除本轮新增的明确文件清单。不要全盘 reset/clean，不要删除本地配置、证据或其他改动。如未来独立提交并获授权发布，则对该补丁提交执行 history-preserving `git revert`，重新构建并验证旧 URL。保留线上既有部署/数据，不需要回滚任何数据库迁移。

生产回滚：**UNVERIFIED / 未执行**，因为本轮没有生产部署；不能把本地演练当成线上回退完成。验证使用的本地服务和隔离容器在收尾关闭；Docker 恢复执行前的停止状态。

临时回滚目录清理：**BLOCKED**。自动审批拒绝 `.axis/phase2/rollback-source` 的递归清理，因此保留该忽略目录及临时 tar，不换工具绕过；主工作区补丁、构建验证和回滚结果不受影响。完整日志和原始证据继续保留。

## 附表：全部历史映射

<!-- URL_TABLE -->

| 历史 URL | 唯一规范源 | bytes / SHA-256 | 构建 / dev / preview / 本地 Worker |
|---|---|---|---|
| `/assets/anime/AIR.webp` | `public/assets/anime/AIR.avif` | 10854 / `10ae06d85f4a9b83c03983d5350afca4a823c5be776f2c6422315b831ecf5638` | PASS / PASS / PASS / PASS |
| `/assets/anime/CLANNAD.webp` | `public/assets/anime/CLANNAD.avif` | 14968 / `7828087b867bb7e8a4031979361cdb8fc5bf1d80a6bfb32ebdb401b1154b57c0` | PASS / PASS / PASS / PASS |
| `/assets/anime/Charlotte.webp` | `public/assets/anime/Charlotte.avif` | 16200 / `9f00b2b6444fb9bea9a5972f3e1fb6032005ac6764a7d2deb332ffca4b68c4bb` | PASS / PASS / PASS / PASS |
| `/assets/anime/OVERLORD.webp` | `public/assets/anime/OVERLORD.avif` | 22354 / `b991be6117315b9e3a0d15dcb09072f00796a82da0485e402ad1d16d8680c9e7` | PASS / PASS / PASS / PASS |
| `/assets/anime/Re：clksdysjsh.webp` | `public/assets/anime/Re：clksdysjsh.avif` | 23238 / `e385ba0c648c59449f40f5132ccc5ceb2f81c71ebcf8e77c4d5c15b343d71a87` | PASS / PASS / PASS / PASS |
| `/assets/anime/bg.webp` | `public/assets/anime/bg.avif` | 9744 / `a8c6525f9bcd8f27bb4ac1e7c6e2fb8fe219f36dba232b9165ab9838877a1aec` | PASS / PASS / PASS / PASS |
| `/assets/anime/ddd.webp` | `public/assets/anime/ddd.avif` | 20968 / `61e42405cce0d088a10d7c81a5620040933eaee44a9cca3a79e86f8c0a74d8da` | PASS / PASS / PASS / PASS |
| `/assets/anime/eva.webp` | `public/assets/anime/eva.avif` | 20277 / `c575a72241f6e258da6e1ddc57e31fa9fc67ddb234d49371ec8a13bf8bcefd0a` | PASS / PASS / PASS / PASS |
| `/assets/anime/hydxjxrwgb.webp` | `public/assets/anime/hydxjxrwgb.avif` | 19039 / `34cee1efe4c8f91acbe77414814db14b832e6578c694f31b7a328bb1cf5bbc8e` | PASS / PASS / PASS / PASS |
| `/assets/anime/jdgjj.webp` | `public/assets/anime/jdgjj.avif` | 19720 / `9b5fbcebee1fe270acb331fcdec392d84b98e58f388e25669e5740ea9308c607` | PASS / PASS / PASS / PASS |
| `/assets/anime/lg.webp` | `public/assets/anime/lg.avif` | 3548 / `bdb0c71e23c56f8daea5090276bce77f97811f891bbeef849d82788235e24206` | PASS / PASS / PASS / PASS |
| `/assets/anime/sczndgmtx.webp` | `public/assets/anime/sczndgmtx.avif` | 16459 / `92a4e85fae87a7b477d6a6b45857c50e45677e37c45bffb52cc617aa16f09372` | PASS / PASS / PASS / PASS |
| `/assets/anime/xfhclrzf.webp` | `public/assets/anime/xfhclrzf.avif` | 19282 / `c8f4ebe1e1a802c620e3029514ee7d5d027848e4b0f17cfa4cd97cd50c085d74` | PASS / PASS / PASS / PASS |
| `/assets/anime/xrkd.webp` | `public/assets/anime/xrkd.avif` | 28928 / `00d32b7043a7b1c1741758affdd81b3eb3a70e73659bfc8b087b8f9c376d147c` | PASS / PASS / PASS / PASS |
| `/assets/anime/yszm.webp` | `public/assets/anime/yszm.avif` | 26762 / `4a6dbf6a8ac303a7f75295b32f9a2922f788c2c5fedb3d564d400435d9c1c891` | PASS / PASS / PASS / PASS |
| `/assets/anime/yzk.webp` | `public/assets/anime/yzk.png` | 374131 / `a30e8aff05c1ccd85ca0d69d4ec61e478966c4107d034cecf995359e0e8a42d6` | PASS / PASS / PASS / PASS |
| `/assets/anime/yzsc.webp` | `public/assets/anime/yzsc.avif` | 22898 / `c5fafd023c9813f7101a227c45083a9881eb60ab2a84e2328c3620280fa790b3` | PASS / PASS / PASS / PASS |
| `/assets/anime/zebyytla.webp` | `public/assets/anime/zebyytla.avif` | 12555 / `bd6dc38de466200e8aa57e99fa88fe9238ccb7622e69c646b2aebb3aab1b7df3` | PASS / PASS / PASS / PASS |
| `/assets/anime/zgmssdywt.webp` | `public/assets/anime/zgmssdywt.avif` | 17409 / `292cdd7d6dc8caaa5021cb33482182df23e4f62e431bd5555638b0edbc0db59c` | PASS / PASS / PASS / PASS |
| `/assets/anime/zllyhhy.webp` | `public/assets/anime/zllyhhy.avif` | 11376 / `c3d5a0e155cab54c58a49b6a1af0a39c6d6cbb41e5c2ac162a333943199c5f92` | PASS / PASS / PASS / PASS |
| `/assets/anime/zxfdnyw.webp` | `public/assets/anime/zxfdnyw.avif` | 19755 / `36492d06fee346f60af628a477cc83683ce72662f475c376b0ffdbec6d14e5d1` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/1.webp` | `public/assets/desktop-banner/1.jpg` | 690713 / `66e53fe0349fd864ca8130a74fff96bc3884ba77c2453d3fc6b2f21711adb950` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/2.webp` | `public/assets/desktop-banner/2.png` | 2473481 / `34c1267501dd6c14d95b78ffe9c3452ebb7096f94d565e078a81d2e45fe465fb` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/3.webp` | `public/assets/desktop-banner/3.jpg` | 3464680 / `345a1a5abef95be8f3baa7c0c104cf456d0ea1c3fa8e5c65129dd4a60327fc62` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/4.webp` | `public/assets/desktop-banner/4.jpg` | 3038307 / `4e94b4a1baec9c95b988ac91b3722d374832c575b9cb7c6fee7c6e1d94411942` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/5.webp` | `public/assets/desktop-banner/5.png` | 3512492 / `ad606a4cf7505c53c13015b148bad435a21b05bdcc43c78821e4acdbeefdd7d1` | PASS / PASS / PASS / PASS |
| `/assets/desktop-banner/6.webp` | `public/assets/desktop-banner/6.png` | 10132492 / `e5ea237463a0831eb922d292697316127bd1476ed9aa14216824aa111719583d` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/1.webp` | `public/assets/mobile-banner/1.jpg` | 595488 / `ac534a02972ee2c0006a046aa77c3ff4a3ccaa98c0290aba609f5833172cf0e6` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/2.webp` | `public/assets/mobile-banner/2.jpg` | 1519604 / `70236f640a14dde579bf4694615136135fe7131a8e7088da42c073d39b7ca680` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/3.webp` | `public/assets/mobile-banner/3.jpg` | 773983 / `d762f5f6c5e2218d8c50abd4058244b8388a350f5a38e04a70823e48fb2398ff` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/4.webp` | `public/assets/mobile-banner/4.png` | 7368891 / `86e34219b592f4e7e3484f7d7d566961d0161347979b69d67960a0dc25d9d4a8` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/5.webp` | `public/assets/mobile-banner/5.jpg` | 517824 / `b314979fc2e66a532b4ac170b328c577c8230d3adb9153178a9e8a6c23666006` | PASS / PASS / PASS / PASS |
| `/assets/mobile-banner/6.webp` | `public/assets/mobile-banner/6.jpg` | 598230 / `302913eb380bd3556c34b35d0d4851f8623e43395a26623154b1bd6d8c25328c` | PASS / PASS / PASS / PASS |
| `/favicon/favicon.ico` | `public/favicon/favicon.png` | 1040107 / `bffd60400b400f30dc69cea3bf6b5072ff95af6df01fc20788558c97c0a8b6b8` | PASS / PASS / PASS / PASS |
| `/images/albums/AcgExample/cover.jpg` | `public/images/albums/AcgExample/cover.png` | 7978244 / `a3d050fdab74c9fe4c692bd02b53c31be458aede3d3d4caaf867778a9f0d5899` | PASS / PASS / PASS / PASS |
| `/images/device/ipad11.png` | `public/images/device/ipad11.jpg` | 65495 / `3f398e988aa575e7dc4fea512f5e419fbbc39b398820fe852581b1b7c17c528d` | PASS / PASS / PASS / PASS |
| `/images/device/iphone17pro.png` | `public/images/device/iphone17pro.jpg` | 66893 / `bc4cca5c8c56da2293f11aff7756a564cb891dac3ca97e3b3725ba55d6ee3733` | PASS / PASS / PASS / PASS |
| `/images/device/k60ultra.png` | `public/images/device/k60ultra.jpg` | 75071 / `f48b728bfadf7d696ee5cc76c19d2dcc83560b62fc76a3957fa48965d86e93a6` | PASS / PASS / PASS / PASS |
| `/images/device/macminim4.png` | `public/images/device/macminim4.jpg` | 26779 / `d92712aabfb614099bc6cd2be8b83292e673b0ca89cad7eda3d479bb3e1ff425` | PASS / PASS / PASS / PASS |
| `/images/device/y9000p.png` | `public/images/device/y9000p.jpg` | 239049 / `d6040dc73cff1ba916fddebb637f63659e7b0ecb2e45f37f5eeb53a0ba6ac85f` | PASS / PASS / PASS / PASS |
| `/src/assets/images/avatar.webp` | `src/assets/images/avatar.png` | 394277 / `03129bb68eeae86dfdc313748ab8f32f7a173ee0fa8e13675684bfd31c6d7e04` | 不属于发布 URL / PASS（含 import） / 不适用 / 不适用 |
| `/_astro/avatar.nWn5Mszy.webp` | `src/assets/images/avatar.png` | 394277 / `03129bb68eeae86dfdc313748ab8f32f7a173ee0fa8e13675684bfd31c6d7e04` | PASS / PASS / PASS / PASS |
| `/_astro/avatar.nWn5Mszy_18wN4e.webp` | `public/_astro/avatar.nWn5Mszy_18wN4e.webp` | 29048 / `47277c65436c8eb48a6ceb41779f8b184bc4b02af28829ed8fccefa3bc9eda72` | PASS / PASS / PASS / PASS |

<!-- /URL_TABLE -->
