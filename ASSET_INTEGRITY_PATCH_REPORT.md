# Axis Asset Integrity Patch Report

补丁基线：main @ `8e0328471a8b2c6c08ab70a490da56ae649ea17e`。本报告 A–F 记录 2026-10-26 发布前的本地验收；在该验收阶段没有提交、推送、部署或修改生产数据。Wrangler 仅使用明确的 --local 与独立本地持久化目录，本地空库应用既有迁移用于健康检查。用户随后已授权推送和部署；发布结果以对应提交的构建/工作流回执及线上核验为准，变更摘要见 [更新日志](CHANGELOG.md)。

## A. 修复清单

| 问题与根因 | 文件与最终处理 |
|---|---|
| 41 张图片扩展名与文件魔数不同 | 新增真实格式扩展名的逐字节副本，更新 src/config.ts、src/data/anime.ts、src/data/devices.ts、src/constants/icon.ts、MusicPlayer.svelte、OG 头像导入；保留全部旧文件。没有重新编码、压缩、裁剪、修改颜色或尺寸。 |
| 相册封面固定为 cover.jpg；直接加入 cover.png 会被当作第 23 张照片 | info.json 显式 cover.png；album-scanner.ts 与 migrate-content.mjs 读取 cover 字段并排除两个封面文件。迁移过滤用 path.basename，Windows/POSIX 测试均覆盖；不执行生产迁移或发布。原 22 张照片和原图 URL 顺序一致。 |
| 旧的 Cloudflare 与静态头像构建 URL 会因源扩展名变化而失效 | asset-aliases.mjs、build-cloudflare.mjs、mirror-build.mjs 保留两种已观察的历史地址；静态旧头像作为 public/_astro 下的 29,048-byte 原文件保留。原文件碰撞或 SHA 不符时停止构建。 |
| 镜像下载依赖响应 MIME 选择扩展名；本地旧路径未规范化 | mirror-build.mjs 使用文件签名选择下载扩展名，只改已知本地别名，保留 query/hash；原始下载字节直接写出。外部 URL、媒体 ID、API 契约和发布流程不变。 |
| 缺少可重复的资产门禁 | 新增 audit-assets.mjs、audit-assets.test.mjs、asset-integrity-baseline.json、pnpm audit:assets/test:assets；按路径和原因固定旧别名、原始 SHA/大小/格式/宽高。新增伪扩展名直接失败，超预算仅告警，不自动修改图片。 |
| type-check 使用面向声明库产出的 --isolatedDeclarations，且 tsconfig 未继承 Astro 基础配置 | tsconfig.json 继承安装版本 astro/tsconfigs/base；保留 strictNullChecks、原 include 与应用选项。pnpm type-check 执行应用 tsc 与新增工具 strict/checkJs 局部检查。仅补直接开发类型 @types/node 24.10.1，锁文件无版本漂移；无新运行框架。 |
| 缺少跨平台资产 CI | .github/workflows/assets.yml 配置 Node 22、pnpm 10.22、Windows/Ubuntu，执行审计、资产测试、Astro 与类型检查；只读权限，无部署步骤，排除 mirror 分支。当前未推送，远程 CI 尚未执行。 |

既有轮播、预加载/解码、Sakura、Pio、Swup、音乐生命周期、Fancybox 原图策略和字体配置均保持。MusicPlayer 唯一修改是回退封面的 URL。workers/、shared/、数据库迁移、生产配置与既有 mirror 同步工作流没有改动。

## B. 资产差异

首次全量读取仓库 105 张图片和 2 个本地字体，扫描 323 个文本文件；按魔数、Sharp 元数据和完整 SHA-256 识别 41 处不一致。原始 107 个文件已再次用 git show HEAD:path 与当前字节逐个比较，全部一致。不是仅凭扩展名、响应 MIME 或少量抽样认定。

最终扫描 147 张图片、2 个本地字体，41 个逐路径旧别名，0 错误、37 条预算提醒。新增 41 个规范副本合计 45,302,565 bytes，另加历史静态头像 29,048 bytes；这是保留旧 URL 的存储成本，不是图片质量或分辨率变化。旧别名仍是有意保留的格式例外。

下表 SHA 同时适用于旧文件与新增规范文件；大小、尺寸前后相同：

| 原路径 → 规范路径 | 真实格式 | bytes 前 → 后 | 像素前 → 后 | SHA-256（两者相同） | 实际引用迁移 |
|---|---|---:|---|---|---|
| `public/assets/anime/AIR.webp` → `public/assets/anime/AIR.avif` | avif | 10854 → 10854 | 240×320 → 同尺寸 | `10ae06d85f4a9b83c03983d5350afca4a823c5be776f2c6422315b831ecf5638` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/CLANNAD.webp` → `public/assets/anime/CLANNAD.avif` | avif | 14968 → 14968 | 308×410 → 同尺寸 | `7828087b867bb7e8a4031979361cdb8fc5bf1d80a6bfb32ebdb401b1154b57c0` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/Charlotte.webp` → `public/assets/anime/Charlotte.avif` | avif | 16200 → 16200 | 308×410 → 同尺寸 | `9f00b2b6444fb9bea9a5972f3e1fb6032005ac6764a7d2deb332ffca4b68c4bb` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/OVERLORD.webp` → `public/assets/anime/OVERLORD.avif` | avif | 22354 → 22354 | 308×410 → 同尺寸 | `b991be6117315b9e3a0d15dcb09072f00796a82da0485e402ad1d16d8680c9e7` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/Re：clksdysjsh.webp` → `public/assets/anime/Re：clksdysjsh.avif` | avif | 23238 → 23238 | 308×410 → 同尺寸 | `e385ba0c648c59449f40f5132ccc5ceb2f81c71ebcf8e77c4d5c15b343d71a87` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/bg.webp` → `public/assets/anime/bg.avif` | avif | 9744 → 9744 | 308×410 → 同尺寸 | `a8c6525f9bcd8f27bb4ac1e7c6e2fb8fe219f36dba232b9165ab9838877a1aec` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/ddd.webp` → `public/assets/anime/ddd.avif` | avif | 20968 → 20968 | 308×410 → 同尺寸 | `61e42405cce0d088a10d7c81a5620040933eaee44a9cca3a79e86f8c0a74d8da` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/eva.webp` → `public/assets/anime/eva.avif` | avif | 20277 → 20277 | 308×410 → 同尺寸 | `c575a72241f6e258da6e1ddc57e31fa9fc67ddb234d49371ec8a13bf8bcefd0a` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/hydxjxrwgb.webp` → `public/assets/anime/hydxjxrwgb.avif` | avif | 19039 → 19039 | 308×410 → 同尺寸 | `34cee1efe4c8f91acbe77414814db14b832e6578c694f31b7a328bb1cf5bbc8e` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/jdgjj.webp` → `public/assets/anime/jdgjj.avif` | avif | 19720 → 19720 | 308×410 → 同尺寸 | `9b5fbcebee1fe270acb331fcdec392d84b98e58f388e25669e5740ea9308c607` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/lg.webp` → `public/assets/anime/lg.avif` | avif | 3548 → 3548 | 308×410 → 同尺寸 | `bdb0c71e23c56f8daea5090276bce77f97811f891bbeef849d82788235e24206` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/sczndgmtx.webp` → `public/assets/anime/sczndgmtx.avif` | avif | 16459 → 16459 | 308×410 → 同尺寸 | `92a4e85fae87a7b477d6a6b45857c50e45677e37c45bffb52cc617aa16f09372` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/xfhclrzf.webp` → `public/assets/anime/xfhclrzf.avif` | avif | 19282 → 19282 | 308×410 → 同尺寸 | `c8f4ebe1e1a802c620e3029514ee7d5d027848e4b0f17cfa4cd97cd50c085d74` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/xrkd.webp` → `public/assets/anime/xrkd.avif` | avif | 28928 → 28928 | 308×410 → 同尺寸 | `00d32b7043a7b1c1741758affdd81b3eb3a70e73659bfc8b087b8f9c376d147c` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/yszm.webp` → `public/assets/anime/yszm.avif` | avif | 26762 → 26762 | 308×410 → 同尺寸 | `4a6dbf6a8ac303a7f75295b32f9a2922f788c2c5fedb3d564d400435d9c1c891` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/yzk.webp` → `public/assets/anime/yzk.png` | png | 374131 → 374131 | 452×640 → 同尺寸 | `a30e8aff05c1ccd85ca0d69d4ec61e478966c4107d034cecf995359e0e8a42d6` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/yzsc.webp` → `public/assets/anime/yzsc.avif` | avif | 22898 → 22898 | 308×410 → 同尺寸 | `c5fafd023c9813f7101a227c45083a9881eb60ab2a84e2328c3620280fa790b3` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/zebyytla.webp` → `public/assets/anime/zebyytla.avif` | avif | 12555 → 12555 | 308×410 → 同尺寸 | `bd6dc38de466200e8aa57e99fa88fe9238ccb7622e69c646b2aebb3aab1b7df3` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/zgmssdywt.webp` → `public/assets/anime/zgmssdywt.avif` | avif | 17409 → 17409 | 308×410 → 同尺寸 | `292cdd7d6dc8caaa5021cb33482182df23e4f62e431bd5555638b0edbc0db59c` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/zllyhhy.webp` → `public/assets/anime/zllyhhy.avif` | avif | 11376 → 11376 | 308×410 → 同尺寸 | `c3d5a0e155cab54c58a49b6a1af0a39c6d6cbb41e5c2ac162a333943199c5f92` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/anime/zxfdnyw.webp` → `public/assets/anime/zxfdnyw.avif` | avif | 19755 → 19755 | 308×410 → 同尺寸 | `36492d06fee346f60af628a477cc83683ce72662f475c376b0ffdbec6d14e5d1` | src/data/anime.ts；公开快照 anime 配置 |
| `public/assets/desktop-banner/1.webp` → `public/assets/desktop-banner/1.jpg` | jpeg | 690713 → 690713 | 2358×1450 → 同尺寸 | `66e53fe0349fd864ca8130a74fff96bc3884ba77c2453d3fc6b2f21711adb950` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/desktop-banner/2.webp` → `public/assets/desktop-banner/2.png` | png | 2473481 → 2473481 | 2308×1298 → 同尺寸 | `34c1267501dd6c14d95b78ffe9c3452ebb7096f94d565e078a81d2e45fe465fb` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/desktop-banner/3.webp` → `public/assets/desktop-banner/3.jpg` | jpeg | 3464680 → 3464680 | 3840×2160 → 同尺寸 | `345a1a5abef95be8f3baa7c0c104cf456d0ea1c3fa8e5c65129dd4a60327fc62` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/desktop-banner/4.webp` → `public/assets/desktop-banner/4.jpg` | jpeg | 3038307 → 3038307 | 3840×2160 → 同尺寸 | `4e94b4a1baec9c95b988ac91b3722d374832c575b9cb7c6fee7c6e1d94411942` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/desktop-banner/5.webp` → `public/assets/desktop-banner/5.png` | png | 3512492 → 3512492 | 3840×2160 → 同尺寸 | `ad606a4cf7505c53c13015b148bad435a21b05bdcc43c78821e4acdbeefdd7d1` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/desktop-banner/6.webp` → `public/assets/desktop-banner/6.png` | png | 10132492 → 10132492 | 4252×2392 → 同尺寸 | `e5ea237463a0831eb922d292697316127bd1476ed9aa14216824aa111719583d` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/1.webp` → `public/assets/mobile-banner/1.jpg` | jpeg | 595488 → 595488 | 1179×2556 → 同尺寸 | `ac534a02972ee2c0006a046aa77c3ff4a3ccaa98c0290aba609f5833172cf0e6` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/2.webp` → `public/assets/mobile-banner/2.jpg` | jpeg | 1519604 → 1519604 | 2358×3304 → 同尺寸 | `70236f640a14dde579bf4694615136135fe7131a8e7088da42c073d39b7ca680` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/3.webp` → `public/assets/mobile-banner/3.jpg` | jpeg | 773983 → 773983 | 1350×2700 → 同尺寸 | `d762f5f6c5e2218d8c50abd4058244b8388a350f5a38e04a70823e48fb2398ff` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/4.webp` → `public/assets/mobile-banner/4.png` | png | 7368891 → 7368891 | 1440×3120 → 同尺寸 | `86e34219b592f4e7e3484f7d7d566961d0161347979b69d67960a0dc25d9d4a8` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/5.webp` → `public/assets/mobile-banner/5.jpg` | jpeg | 517824 → 517824 | 1894×4096 → 同尺寸 | `b314979fc2e66a532b4ac170b328c577c8230d3adb9153178a9e8a6c23666006` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/assets/mobile-banner/6.webp` → `public/assets/mobile-banner/6.jpg` | jpeg | 598230 → 598230 | 1080×2340 → 同尺寸 | `302913eb380bd3556c34b35d0d4851f8623e43395a26623154b1bd6d8c25328c` | src/config.ts（Banner 与全屏壁纸两组配置） |
| `public/favicon/favicon.ico` → `public/favicon/favicon.png` | png | 1040107 → 1040107 | 1130×1254 → 同尺寸 | `bffd60400b400f30dc69cea3bf6b5072ff95af6df01fc20788558c97c0a8b6b8` | src/constants/icon.ts；MusicPlayer.svelte 回退封面 |
| `public/images/albums/AcgExample/cover.jpg` → `public/images/albums/AcgExample/cover.png` | png | 7978244 → 7978244 | 6400×3396 → 同尺寸 | `a3d050fdab74c9fe4c692bd02b53c31be458aede3d3d4caaf867778a9f0d5899` | info.json → album-scanner.ts；migrate-content.mjs；公开快照 cover |
| `public/images/device/ipad11.png` → `public/images/device/ipad11.jpg` | jpeg | 65495 → 65495 | 1200×630 → 同尺寸 | `3f398e988aa575e7dc4fea512f5e419fbbc39b398820fe852581b1b7c17c528d` | src/data/devices.ts |
| `public/images/device/iphone17pro.png` → `public/images/device/iphone17pro.jpg` | jpeg | 66893 → 66893 | 653×653 → 同尺寸 | `bc4cca5c8c56da2293f11aff7756a564cb891dac3ca97e3b3725ba55d6ee3733` | src/data/devices.ts |
| `public/images/device/k60ultra.png` → `public/images/device/k60ultra.jpg` | jpeg | 75071 → 75071 | 800×800 → 同尺寸 | `f48b728bfadf7d696ee5cc76c19d2dcc83560b62fc76a3957fa48965d86e93a6` | src/data/devices.ts |
| `public/images/device/macminim4.png` → `public/images/device/macminim4.jpg` | jpeg | 26779 → 26779 | 980×551 → 同尺寸 | `d92712aabfb614099bc6cd2be8b83292e673b0ca89cad7eda3d479bb3e1ff425` | src/data/devices.ts |
| `public/images/device/y9000p.png` → `public/images/device/y9000p.jpg` | jpeg | 239049 → 239049 | 1280×720 → 同尺寸 | `d6040dc73cff1ba916fddebb637f63659e7b0ecb2e45f37f5eeb53a0ba6ac85f` | src/data/devices.ts |
| `src/assets/images/avatar.webp` → `src/assets/images/avatar.png` | png | 394277 → 394277 | 602×602 → 同尺寸 | `03129bb68eeae86dfdc313748ab8f32f7a173ee0fa8e13675684bfd31c6d7e04` | src/config.ts；src/pages/og/[...slug].png.ts；Astro 图片导入 |

全量机器证据：scripts/asset-integrity-baseline.json 固定所有原始文件；.axis/asset-integrity/before-assets.json 为首次扫描；final-audit.json 包含最终图像元数据和逐文件引用候选；completion-evidence.json 记录与 Git 原件的逐文件比较。引用结果明确区分 literal 与 basename-candidate，动态生成路径另由双构建和浏览器验证。可用 pnpm audit:assets --json report.json 重建当前清单。

### 字体核对

| 本地字体 | bytes（前后相同） | SHA-256（前后与双目标相同） |
|---|---:|---|
| `public/assets/font/萝莉体 第二版.ttf` | 10776876 | `c226ee2a6a5893798de3d356ff3bbc219b61cae2dfde2f702fe80f9049480cf7` |
| `public/assets/font/ZenMaruGothic-Medium.ttf` | 3810988 | `3cfdb98a13571ede17fcc769f5093a97c38b80a7b9b2ab754a26b4d822092b3b` |

fonts.css 与 config.ts 保持原样：asciiFont/cjkFont 均配置“萝莉体 第二版.ttf”、enableCompress=false。compress-fonts.js 实跑退出 0，输出 No fonts to compress，没有生成无人使用的子集文件。普通 build 的尾部仍调用它，Cloudflare/mirror 不调用；当前配置下三者都不执行字体转换，输出策略没有差异。历史 test-font-compression 指向缺失脚本是既有遗留项，未作为本轮通过依据。

浏览器在首页实际只下载 /assets/font/萝莉体 第二版.ttf，10,776,876 bytes；before/after/mirror 相同，FontFace 已 loaded，computed font-family 和 400 字重一致。已有两条同名字体声明没有造成双下载。ZenMaruGothic-Medium.ttf 保留供现有 OG/其他用途，本轮页面没有请求它。全文字节未变，因此没有删字形或新增子集回退；中文正文、标题和日期已在截图中核对。未实施 WOFF2 转换。

以下是整个产物的字体格式清单，包含依赖自带的 KaTeX 等字体；已有 WOFF/WOFF2 不代表自定义中文 TTF 已转换或已被 CSS 使用：

| 产物 | TTF 文件数 / bytes | WOFF 文件数 / bytes | WOFF2 文件数 / bytes |
|---|---:|---:|---:|
| before | 22 / 15101528 | 20 / 303116 | 24 / 340384 |
| after | 22 / 15101528 | 20 / 303116 | 24 / 340384 |
| cloudflare | 22 / 15101528 | 20 / 303116 | 24 / 340384 |
| mirror | 22 / 15101528 | 20 / 303116 | 24 / 340384 |

## C. 兼容性

40 个 public 旧 URL 保留字节副本；Cloudflare 本地真实 ASSETS 响应对 40 对新旧地址逐个 GET：均 200，SHA 与原始文件相同，规范地址 Content-Type 与魔数一致。历史 .webp/.ico/.jpg 地址仍按扩展名返回旧 MIME，不能称为 MIME 已修复。没有假定重定向规则或帽子云专用 MIME 配置生效。

头像兼容：

| 用途 | 地址 | bytes / SHA-256 |
|---|---|---|
| Cloudflare 新规范原头像 | /_astro/avatar.nWn5Mszy.png | 394277 / 03129bb68eeae86dfdc313748ab8f32f7a173ee0fa8e13675684bfd31c6d7e04 |
| Cloudflare 历史 URL，PNG 字节而历史 MIME 为 WebP | /_astro/avatar.nWn5Mszy.webp | 同上，逐字节相同 |
| 历史静态镜像的真实 WebP | /_astro/avatar.nWn5Mszy_18wN4e.webp | 29048 / 47277c65436c8eb48a6ceb41779f8b184bc4b02af28829ed8fccefa3bc9eda72 |
| 新静态镜像的真实 WebP | /_astro/avatar.nWn5Mszy_Z1QGmT5.webp | 同上，逐字节相同 |

静态头像继续由原有 Astro 图片策略处理；扩展名变化没有改变其输出字节或解码像素。像素 SHA 为 27711c0ab60b28644efa4e6a6fc23a2a2d56fc72ef1cb5fdd387c9485954cb41。

公开安全快照 revision=60，27 篇文章、1 本相册，输入 SHA cbe205f49f90627f06b5dd9a4358000b37c09d1486ccc32351255a43969056d6。其中真实含 21 个旧番剧路径和旧 cover.jpg；镜像改写后这些旧规范引用为 0，历史别名仍存在。Markdown、JSON、CSS、Astro/Svelte 引用由门禁与产物验证覆盖；代码块中的图片示例不作为真实资源路径报错。

未访问生产 D1/KV，因此不声称已枚举所有生产内容或外部链接；保留全部已识别旧路径确保可能的 Markdown/D1/外链继续可访问，不需要改写数据库。已有 /media/<id> 和 ?variant=display/original 契约完全保留。

镜像下载了 2 张公开图片，文件名由实际签名选择为 WebP/JPEG，正文媒体引用改写到 mirror-media，不经过重新编码；产物哈希见 build-verification.json。mirror-version.json 为 revision=60；Pagefind 索引存在，28 页、6342 个词。浏览器经过首页、文章、相册、番剧和设备页面未请求 /api/v1；/api/calendar-data.json 是已生成的本地静态 JSON，并非动态后台依赖。没有修改 mirror 分支。

## D. 测试证据

| 命令 | 最终结果与证据 |
|---|---|
| pnpm audit:assets | 0 错误，147 图、2 字体、41 别名、37 条预算提醒；final-audit.json 与 final-audit-assets.log |
| pnpm test:assets | 8/8，通过；final-test-assets.log。覆盖新格式错误、无图像后缀的伪装文件、旧文件字节篡改、规范副本不一致、大小写/中文路径、Markdown/CSS/组件引用、镜像签名、两种历史头像和 Windows/POSIX 相册过滤 |
| pnpm check | 125 文件，0 errors、0 warnings、4 hints；final-check.log。Astro/Svelte/TS 源检查 |
| pnpm type-check | 退出 0；final-type-check.log。应用 tsc + tsconfig.assets.json strict/checkJs |
| pnpm test:frontend | 16/16；final-test-frontend.log。生命周期相关 Node 测试 |
| pnpm test:worker | 33/33；final-test-worker.log。API/媒体/认证等 Worker 测试；不等同生产验收 |
| pnpm build:cloudflare | 退出 0；final-cloudflare-build.log；SSR 输出 dist |
| AXIS_OUT_DIR=.axis/asset-mirror pnpm build:mirror .axis/frontend-release-public-snapshot.json | 退出 0；final-mirror-build.log；静态镜像输出 .axis/asset-mirror |
| node scripts/compress-fonts.js | 退出 0，enableCompress=false，无文件转换；font-compression.log |
| 独立代码复审 | 两轮复审 Required 全部解决；额外历史静态头像增量复核通过，无 Critical/Required/Optional 遗留；资产测试另行复跑 8/8 |

补丁前真实结果：pnpm check 已通过；原 pnpm type-check 退出 2，日志 .axis/asset-before-type-check.log，错误集中在生成/第三方 .d.ts、依赖的命名空间和面向库声明产出的 isolatedDeclarations。采用官方 Astro 基础 tsconfig 的 skipLibCheck 跳过声明文件内部检查，不能据此宣称所有第三方声明正确。应用源检查与 pnpm check 保留，新增工具另启 strict；没有 any/@ts-ignore 批量逃避，也没有声称 Worker 全仓已完成类型迁移。

双目标及辅助静态产物检查：

| 产物 | 输出 HTML 数 | 去重本地资源引用 | 缺失 | 新旧 public 资源对 |
|---|---:|---:|---:|---:|
| cloudflare | 1 | 119 | 0 | 40 |
| mirror | 56 | 209 | 0 | 40 |
| static-after | 56 | 207 | 0 | 40 |

Cloudflare 是 SSR，1 个磁盘 HTML 不代表只存在 1 个页面；本地 Wrangler 的 / 实际渲染返回 200。HTTP 验证 cloudflare-http.json 共 48 组记录，包含 40 对新旧图、3 个头像地址、2 个字体、health=200、auth/me=401、缺失资源=404。开发器只使用本地绑定。无后台或认证实现变更。

进一步用真实 Edge 对全部 41 项新旧图片地址及历史静态头像共 83 个 URL 执行 Image.decode()，全部成功，naturalWidth/naturalHeight 与原始尺寸匹配；证据 browser-decode.json。两张镜像图片重新读取公开原响应，SHA 与 mirror-media 文件完全相同：WebP 622,004 bytes / b548a951dfa2041ee72a9894104655ec8565a39e737f0b56871404b3d05bec4d；JPEG 37,732 bytes / 2f138ac880ab5539f8a20a877ed2177648c6feb8969c40eb982408135f47d3a2。证据 download-byte-verification.json，无重新编码。

浏览器条件：隔离 Edge 156、1440×1000 / 900×1000 / 390×844、deviceScaleFactor=1、相同日期/主题/壁纸第 0 帧、真实本地图与字体。原有静态截图遮罩仅隐藏 Sakura/Pio/打字/音乐等动态区域，截图定时夹具仅用于定格；生产代码和独立动态测试仍运行真实动画。滚动经过真实 content-visibility 卡片再回顶部，避免把屏外高度估算当作布局差异。

18 组最终截图 geometry 全部相同。RGB 单通道差异超过 16 的最大像素比例 0.1586%，差异图集中在原有图片纹理和边缘；与栅格化/合成波动相符，未将根因断言为某一 GPU 实现。人工查看前后与差异图未见布局或内容/质量变化。不是“逐像素完全相同”的声明。所有源图 SHA、头像静态输出字节/像素相同，首页十份 CSS 的 URL 顺序和完整字节也相同。证据 visual-comparison.json；截图目录 output/playwright/frontend/asset-before-settled 与 asset-after-settled。

桌面 Banner 和移动全屏等前后截图位于上述两个目录，文件名分别为 visual-1440-banner-dark.png、visual-390-fullscreen-light.png。截图与原始网络证据仅保留在本地忽略目录，不随源补丁上传；报告保留元数据、哈希与可重复执行的验证步骤。

| 视口-模式-主题 | 布局几何 | RGB 差 >16 的像素比例 |
|---|---|---:|
| 1440-banner-light | 一致 | 0.0351% |
| 1440-banner-dark | 一致 | 0.0000% |
| 1440-fullscreen-light | 一致 | 0.0000% |
| 1440-fullscreen-dark | 一致 | 0.0000% |
| 1440-none-light | 一致 | 0.0000% |
| 1440-none-dark | 一致 | 0.0000% |
| 900-banner-light | 一致 | 0.0000% |
| 900-banner-dark | 一致 | 0.0000% |
| 900-fullscreen-light | 一致 | 0.1586% |
| 900-fullscreen-dark | 一致 | 0.0000% |
| 900-none-light | 一致 | 0.1586% |
| 900-none-dark | 一致 | 0.0027% |
| 390-banner-light | 一致 | 0.0000% |
| 390-banner-dark | 一致 | 0.0000% |
| 390-fullscreen-light | 一致 | 0.0000% |
| 390-fullscreen-dark | 一致 | 0.0000% |
| 390-none-light | 一致 | 0.0000% |
| 390-none-dark | 一致 | 0.0000% |

动态浏览器回归：output/playwright/frontend/after-asset/results.json，桌面与移动两轮，errors=[]、failures=[]；包含真实 Banner/全屏切换、20 次归档/相册往返、10 次文章往返、主题切换、移动 TOC、观察器释放和持久节点检查。记录的切换时图片 ready，原图能解码；未改控制器或预加载/解码实现。该证据使用确定的本地音乐响应，不代表外部音乐平台可用性。

补充 browser-delivery.json：before/after/mirror 真实浏览器字体及样式请求、Swup 后公式、相册灯箱与放大测试均通过；原图 1920×1356，点击已有 toggleFull 控件后显示到 1920×1356。公开快照当前没有公式，测试仅在本地响应中注入同一 KaTeX 渲染夹具，没有修改文章或生产内容。三组页面错误为 0，无 /api/v1 请求；中文字体请求数为 1，CSS 请求 URL 去重后仍为 10，没有新增相同 CSS/字体下载。

未通过/未执行项：首次 type-check 失败已修复；CSS 加载收窄实验出现明显颜色/样式变化，已全部撤回，Layout.astro、ImageWrapper.astro、main.css 与 HEAD 无差异。早期截图中屏外 content-visibility 高度估算差异通过真实滚动稳定后不再复现。Windows 运行通过；Linux/Node22 的 GitHub CI 已配置但因未推送尚未运行，不伪称远程绿灯。构建既有大 chunk、SSR getStaticPaths、Pagefind 重定向/中文词干提示仍存在，不是本补丁新失败。

## E. 网络验证

### HTTP 压缩：CONFIRMED（本次网络路径未返回压缩）

取样时间 2026-10-25T18:17:42.473Z，目标 https://star-0vl490158.maozi.io。curl 明确发送 Accept-Encoding，保存未自动解压的响应体；记录 size_download 并用 Node zlib 在有 Content-Encoding 时解码。本次所有响应均无 Content-Encoding，响应体保存字节数等于解码字节数。表中为实际下载的响应体字节，不包含 TCP/TLS、HTTP 头或 chunk framing，不是本地模拟 gzip 体积。

| 路径 | Accept-Encoding | HTTP | Content-Type | Content-Encoding | Content-Length | 下载体 bytes / 解码 bytes |
|---|---|---:|---|---|---:|---:|
| `/` | gzip, br | 200 | text/html;charset=utf-8 | 未返回 | 未返回（chunked） | 272936 / 272936 |
| `/` | identity | 200 | text/html;charset=utf-8 | 未返回 | 未返回（chunked） | 272936 / 272936 |
| `/` | gzip | 200 | text/html;charset=utf-8 | 未返回 | 未返回（chunked） | 272936 / 272936 |
| `/` | br | 200 | text/html;charset=utf-8 | 未返回 | 未返回（chunked） | 272936 / 272936 |
| `/pio/static/pio.css` | identity | 200 | text/css;charset=utf-8 | 未返回 | 6892 | 6892 / 6892 |
| `/pio/static/pio.css` | gzip | 200 | text/css;charset=utf-8 | 未返回 | 6892 | 6892 / 6892 |
| `/pio/static/pio.css` | br | 200 | text/css;charset=utf-8 | 未返回 | 6892 | 6892 / 6892 |
| `/_astro/page.CyagqWpp.js` | identity | 200 | text/javascript;charset=utf-8 | 未返回 | 1832 | 1832 / 1832 |
| `/_astro/page.CyagqWpp.js` | gzip | 200 | text/javascript;charset=utf-8 | 未返回 | 1832 | 1832 / 1832 |
| `/_astro/page.CyagqWpp.js` | br | 200 | text/javascript;charset=utf-8 | 未返回 | 1832 | 1832 / 1832 |

全部 Cache-Control=max-age=1200、Vary 未返回；cf-cache-status=MISS，同时 My-Cache-Status=HIT。可以确认响应标记了帽子云层缓存命中与外层 MISS，不能把二者混为“所有缓存未命中”。HTML 为 Transfer-Encoding: chunked，无 Content-Length；CSS/JS 有明确 Content-Length。原始 http-*.headers 与 http-*.body、完整 http-compression.json 均保存在 .axis/asset-integrity。

可复现请求（PowerShell，路径取上表；不加 --compressed，避免自动解码掩盖实际编码）：

~~~powershell
curl.exe --silent --show-error --header 'Accept-Encoding: gzip, br' --dump-header headers.txt --output body.bin --write-out '%{http_code} %{size_download}' 'https://star-0vl490158.maozi.io/'
~~~

### 平台支持与操作：UNVERIFIED（未声称修复）

检查了帽子云官方[介绍](https://www.maoziyun.com/docs/introduction)、[快速开始](https://www.maoziyun.com/docs/quick-start)、[常见问题](https://www.maoziyun.com/docs/asked-question)，没有找到可确认的 gzip/Brotli 开关名称或受支持服务器配置。当前没有本任务授权的控制台配置操作；不能据“使用 OpenResty/CDN”推断可编辑 nginx 或自动生效 .gz/.br。

具体交接步骤：

1. 由项目拥有者进入[帽子云控制台](https://dash.maoziyun.com/)，选择绑定 startuo/Axis 的现有应用及 star-0vl490158.maozi.io 域名。先检查该应用/CDN 是否公开提供 HTTP 响应压缩设置；不要修改构建命令来伪装服务器压缩。
2. 若存在有文档支持的设置，确认作用于 text/html、text/css、JavaScript，启用平台明确支持的 gzip/Brotli；缓存变体需正确依据 Accept-Encoding 协商，并提供相应 Vary 或平台明确说明的等效缓存行为。具体开关名称和值在看到该平台设置前保持未确认。
3. 若界面没有设置，通过官方常见问题提供的支持渠道询问：“此应用是否支持动态或边缘 gzip/Brotli？HTML/CSS/JS 如何启用？是否需要清理既有 identity 缓存？请给出此账户可用的精确设置。”附上上述真实请求与原始响应，保留 My-Cache-Status: HIT 证据。本轮未替用户发送消息。
4. 经授权操作后再对上表三个 URL 分别请求 identity、gzip、br，先按平台指引处理缓存，再记录 Content-Encoding、Vary、Content-Length、原始下载字节和缓存标记；解码 SHA 应与 identity 相同且编码体实际更小，才可宣称完成。当前状态仍是未修复。

### CSS 加载：CONFIRMED

基线/最终首页 HTML 都引用 10 份 stylesheet，合计 444,918 bytes；对应构建文件实际存在。真实 Edge 首页请求了这 10 个不同 URL，PerformanceResourceTiming 的 renderBlockingStatus 均为 blocking。其中独立 katex CSS 29,249 bytes、Fancybox CSS 32,654 bytes；另有 2 份路由样式含 KaTeX 声明、1 份含 Fancybox 声明，属于语义样式重叠，不能误称完全相同 URL 被下载多次。首页无公式和灯箱触发元素仍无条件加载，问题成立。

首次与最终十份 CSS URL 顺序及 SHA 一致；没有引入新同步样式。根因线索是 ImageWrapper 的宽泛 import.meta.glob 与跨路由样式依赖。尝试收窄 glob 后丢失既有全局样式；显式补 main.css 后仍出现颜色差异，因此两个实验改动全部撤回，保留原行为。没有为减小传输强行拆全站 CSS。文章公式和 Fancybox 在 Swup 后的正确性已实测。

重复的相同 CSS 请求：NOT REPRODUCED；基线、最终静态产物和镜像首页均没有 preload/modulepreload/preconnect/dns-prefetch 链接，未发现此类重复或失效提示。轮播通过现有 JS 预加载，独立动态行为测试保留。线上 HTML 的 stylesheet 引用也已记录；render-blocking 的浏览器结论来自本地相同构建资源，未声称完成线上交互验收。

## F. 未解决事项

1. 本次帽子云网络路径未压缩 HTML/CSS/JS；平台账户可用的精确 gzip/Brotli 设置仍未确认。按 E 中步骤由拥有者确认/授权处理后才能复验，不能称已修复。
2. 首页无条件阻塞加载 KaTeX/Fancybox、跨路由样式语义重叠仍存在。收窄依赖实验不能证明视觉等价，已撤回。当前报告保留实测证据，不交付会改变画面的优化。
3. 41 个历史扩展名/MIME 例外继续保留以保证旧 URL；不能在未确认外部/生产引用已迁移时删除。新增规范 URL 已正确。
4. 历史 package.json 的 test-font-compression 指向缺失的 scripts/test-font-compression.js，仍未修复；本轮实际字体无压缩配置，已通过独立字节/输出/浏览器验证。没有把该命令当作质量门禁。
5. 本报告发布前验收阶段未执行远程 CI 与生产部署；此处证据覆盖本地 Windows、POSIX 路径夹具、双构建和明确的线上只读压缩采样。后续授权发布的远程结果单独核验，不追溯改写本地测试结论。

### 附录：首次全量图片身份表（105 张）

此表来自完整读取并与 Git HEAD 对照的原始文件；这些文件全部保留，完整字节、格式、宽高未变。引用迁移详见 B 的 41 项表与可重建的审计 JSON。

| 原始文件 | 真实格式 | bytes | 像素 | SHA-256 |
|---|---|---:|---|---|
| `docs/image/1.webp` | webp | 188352 | 1080×2031 | `30fbcb2e699e536a4792d136004585243866c2f07a8c34b22cfce1b619b23c5f` |
| `docs/image/2.webp` | webp | 275860 | 1079×2043 | `5c711e46db75f58729fb6303f7072e80937c2f871e43b8c06e3ac48e89af77da` |
| `docs/image/3.webp` | webp | 132540 | 1080×2033 | `1fe0c03bc06cad5b7bbd8ef4ded7b4e46210b9ae42ab1cc41b9fd4f49b2ffa9c` |
| `docs/image/4.webp` | webp | 56942 | 1078×2057 | `653424c6940320b9e1fae0dfe5709904a7ac483e52a6920334a51253450f11ee` |
| `docs/image/5.webp` | webp | 125430 | 1079×2036 | `e304a26fce903d6f989b0b8f8b3ea917fb47f521112f1ab47b9a28aa9f39d167` |
| `docs/image/6.webp` | webp | 79196 | 1080×2042 | `a731dfb56844f63f1fa3d55b7f7fc38bb5aa1fd40fd77c0f0d9c157a91055e38` |
| `logo.png` | png | 388937 | 2364×722 | `5ba6c8c5f9ba9583567ab99bb65f000fdab71147eeea2f15231253ff096d89d8` |
| `public/assets/anime/AIR.webp` | avif | 10854 | 240×320 | `10ae06d85f4a9b83c03983d5350afca4a823c5be776f2c6422315b831ecf5638` |
| `public/assets/anime/CLANNAD.webp` | avif | 14968 | 308×410 | `7828087b867bb7e8a4031979361cdb8fc5bf1d80a6bfb32ebdb401b1154b57c0` |
| `public/assets/anime/Charlotte.webp` | avif | 16200 | 308×410 | `9f00b2b6444fb9bea9a5972f3e1fb6032005ac6764a7d2deb332ffca4b68c4bb` |
| `public/assets/anime/OVERLORD.webp` | avif | 22354 | 308×410 | `b991be6117315b9e3a0d15dcb09072f00796a82da0485e402ad1d16d8680c9e7` |
| `public/assets/anime/Re：clksdysjsh.webp` | avif | 23238 | 308×410 | `e385ba0c648c59449f40f5132ccc5ceb2f81c71ebcf8e77c4d5c15b343d71a87` |
| `public/assets/anime/bg.webp` | avif | 9744 | 308×410 | `a8c6525f9bcd8f27bb4ac1e7c6e2fb8fe219f36dba232b9165ab9838877a1aec` |
| `public/assets/anime/ddd.webp` | avif | 20968 | 308×410 | `61e42405cce0d088a10d7c81a5620040933eaee44a9cca3a79e86f8c0a74d8da` |
| `public/assets/anime/eva.webp` | avif | 20277 | 308×410 | `c575a72241f6e258da6e1ddc57e31fa9fc67ddb234d49371ec8a13bf8bcefd0a` |
| `public/assets/anime/gzxb.avif` | avif | 23234 | 308×410 | `32158539c0cccc9e3aa1a2e65ec4b6b63b0a8a75f3228bab84621185712c591d` |
| `public/assets/anime/hydxjxrwgb.webp` | avif | 19039 | 308×410 | `34cee1efe4c8f91acbe77414814db14b832e6578c694f31b7a328bb1cf5bbc8e` |
| `public/assets/anime/jdgjj.webp` | avif | 19720 | 308×410 | `9b5fbcebee1fe270acb331fcdec392d84b98e58f388e25669e5740ea9308c607` |
| `public/assets/anime/lg.webp` | avif | 3548 | 308×410 | `bdb0c71e23c56f8daea5090276bce77f97811f891bbeef849d82788235e24206` |
| `public/assets/anime/mkxdcdcp.webp` | webp | 76854 | 660×880 | `d2359ce3d90f783b1781306ad2fe94f0594c2107b5fde320cf38085a516199aa` |
| `public/assets/anime/sczndgmtx.webp` | avif | 16459 | 308×410 | `92a4e85fae87a7b477d6a6b45857c50e45677e37c45bffb52cc617aa16f09372` |
| `public/assets/anime/xfhclrzf.webp` | avif | 19282 | 308×410 | `c8f4ebe1e1a802c620e3029514ee7d5d027848e4b0f17cfa4cd97cd50c085d74` |
| `public/assets/anime/xrkd.webp` | avif | 28928 | 308×410 | `00d32b7043a7b1c1741758affdd81b3eb3a70e73659bfc8b087b8f9c376d147c` |
| `public/assets/anime/yszm.webp` | avif | 26762 | 308×410 | `4a6dbf6a8ac303a7f75295b32f9a2922f788c2c5fedb3d564d400435d9c1c891` |
| `public/assets/anime/yzk.webp` | png | 374131 | 452×640 | `a30e8aff05c1ccd85ca0d69d4ec61e478966c4107d034cecf995359e0e8a42d6` |
| `public/assets/anime/yzsc.webp` | avif | 22898 | 308×410 | `c5fafd023c9813f7101a227c45083a9881eb60ab2a84e2328c3620280fa790b3` |
| `public/assets/anime/zebyytla.webp` | avif | 12555 | 308×410 | `bd6dc38de466200e8aa57e99fa88fe9238ccb7622e69c646b2aebb3aab1b7df3` |
| `public/assets/anime/zgmssdywt.webp` | avif | 17409 | 308×410 | `292cdd7d6dc8caaa5021cb33482182df23e4f62e431bd5555638b0edbc0db59c` |
| `public/assets/anime/zllyhhy.webp` | avif | 11376 | 308×410 | `c3d5a0e155cab54c58a49b6a1af0a39c6d6cbb41e5c2ac162a333943199c5f92` |
| `public/assets/anime/zxfdnyw.webp` | avif | 19755 | 308×410 | `36492d06fee346f60af628a477cc83683ce72662f475c376b0ffdbec6d14e5d1` |
| `public/assets/desktop-banner/1.webp` | jpeg | 690713 | 2358×1450 | `66e53fe0349fd864ca8130a74fff96bc3884ba77c2453d3fc6b2f21711adb950` |
| `public/assets/desktop-banner/2.webp` | png | 2473481 | 2308×1298 | `34c1267501dd6c14d95b78ffe9c3452ebb7096f94d565e078a81d2e45fe465fb` |
| `public/assets/desktop-banner/3.webp` | jpeg | 3464680 | 3840×2160 | `345a1a5abef95be8f3baa7c0c104cf456d0ea1c3fa8e5c65129dd4a60327fc62` |
| `public/assets/desktop-banner/4.webp` | jpeg | 3038307 | 3840×2160 | `4e94b4a1baec9c95b988ac91b3722d374832c575b9cb7c6fee7c6e1d94411942` |
| `public/assets/desktop-banner/5.webp` | png | 3512492 | 3840×2160 | `ad606a4cf7505c53c13015b148bad435a21b05bdcc43c78821e4acdbeefdd7d1` |
| `public/assets/desktop-banner/6.webp` | png | 10132492 | 4252×2392 | `e5ea237463a0831eb922d292697316127bd1476ed9aa14216824aa111719583d` |
| `public/assets/home/default-logo.png` | png | 388937 | 2364×722 | `5ba6c8c5f9ba9583567ab99bb65f000fdab71147eeea2f15231253ff096d89d8` |
| `public/assets/home/home-light.png` | png | 1040107 | 1130×1254 | `bffd60400b400f30dc69cea3bf6b5072ff95af6df01fc20788558c97c0a8b6b8` |
| `public/assets/home/home.png` | png | 389125 | 940×1024 | `847ea3ed695ad3e235c5fb391ca5b70ef671abca322cd40c8ab0ae8f08a1fffe` |
| `public/assets/mobile-banner/1.webp` | jpeg | 595488 | 1179×2556 | `ac534a02972ee2c0006a046aa77c3ff4a3ccaa98c0290aba609f5833172cf0e6` |
| `public/assets/mobile-banner/2.webp` | jpeg | 1519604 | 2358×3304 | `70236f640a14dde579bf4694615136135fe7131a8e7088da42c073d39b7ca680` |
| `public/assets/mobile-banner/3.webp` | jpeg | 773983 | 1350×2700 | `d762f5f6c5e2218d8c50abd4058244b8388a350f5a38e04a70823e48fb2398ff` |
| `public/assets/mobile-banner/4.webp` | png | 7368891 | 1440×3120 | `86e34219b592f4e7e3484f7d7d566961d0161347979b69d67960a0dc25d9d4a8` |
| `public/assets/mobile-banner/5.webp` | jpeg | 517824 | 1894×4096 | `b314979fc2e66a532b4ac170b328c577c8230d3adb9153178a9e8a6c23666006` |
| `public/assets/mobile-banner/6.webp` | jpeg | 598230 | 1080×2340 | `302913eb380bd3556c34b35d0d4851f8623e43395a26623154b1bd6d8c25328c` |
| `public/assets/music/cover/cl.jpg` | jpeg | 6019 | 130×130 | `c80ffd87835a334a98c212442a9bf20357dd34a8bf8a1b127db30ec1f68425e6` |
| `public/assets/music/cover/hitori.jpg` | jpeg | 5675 | 130×130 | `491085f0f99a3a2720ef5bc3ac9437d93e96712045d4b05ab8a95a88cdd5ea73` |
| `public/assets/music/cover/xryx.jpg` | jpeg | 134958 | 500×500 | `5e0020d7f62abc3eb7c909a1eee886f65753c605148da88d6ea79bea7f69197a` |
| `public/favicon/favicon.ico` | png | 1040107 | 1130×1254 | `bffd60400b400f30dc69cea3bf6b5072ff95af6df01fc20788558c97c0a8b6b8` |
| `public/images/albums/AcgExample/1.webp` | webp | 399554 | 1920×1356 | `2a5ba8065c4b98cfae5998f62a4961ebebb9c4dac86e48dfd0823c02e9178dc5` |
| `public/images/albums/AcgExample/1a7a9ff30d0b7cf03b9fdbd1dd4cf0ad90a344eb.jpg` | jpeg | 1808999 | 2655×3700 | `9f9e0a17dc4a26b8805a00e85dd5c3d0edd687e36539eac36fc0dbeaa7dd58d0` |
| `public/images/albums/AcgExample/2.webp` | webp | 286146 | 1920×1080 | `5e8ddf84b213f9e102606332fe834e7942e8710eea01155edb14fe0607e06efb` |
| `public/images/albums/AcgExample/3.webp` | webp | 894866 | 6400×3396 | `9e60db2bf5942758fa48a1ed9eaba23ff8f66aee759d99801bbc94a53c0587e9` |
| `public/images/albums/AcgExample/4.webp` | webp | 323436 | 2000×1200 | `610a733fb32b8990f9b6a7fbe2a6fbe98d2157674fd166bfcead7382e2531cab` |
| `public/images/albums/AcgExample/464b547c424f36e7c6c38e0c2c151759a3bc68ec.jpg` | jpeg | 919783 | 1000×1414 | `88fea4fccab6f19e6e29438d89293a2e1221adf060e07c08e66adcb8e28b224c` |
| `public/images/albums/AcgExample/4986499bffa3b14c572c22c1ce441fc2cd94d63f.jpg` | jpeg | 1330564 | 1914×1080 | `87c685e54dcd36ffa9bca5df367c576c8300b31629f1eeef1c13d33a73843e2a` |
| `public/images/albums/AcgExample/5d662a33907ffe4edd7261ea4b374ff0a01e2dde.jpg` | jpeg | 1389658 | 1031×1403 | `5b39141ee69f8d15ad2ebe3ed53771be4bb5cdb78dbbdad223683beeb2c0f45d` |
| `public/images/albums/AcgExample/6765bb292ea65ebcff37845ee718cc0e290750052.jpg` | jpeg | 1091008 | 1192×2000 | `714bab3ba96a92771a2246b0a721e4087a3045e0cea0302e377fb3b44bea2c52` |
| `public/images/albums/AcgExample/711ce964e0a5c708aa174d8f6d7ee4e4bb60d356.jpg` | jpeg | 1080199 | 1447×2047 | `a4ce5dd920a1c51a416b87182a165e5336abb4185a4072486570fbf941c747fb` |
| `public/images/albums/AcgExample/91ae6186d2cf1af536b57c78ad7134ca1c8cbfe0.jpg` | jpeg | 4249669 | 2160×3054 | `965ff112d71c0dedbcc45768ebc24d017e0baabdc55b378a6a322d6add3606e7` |
| `public/images/albums/AcgExample/ca3c3f88c47fac7bdda5b8b29ca638dcee769704.jpg` | jpeg | 3368409 | 1976×2874 | `d12a3bf67fc7bf880a272bb05a24aa7b1f5b1aaeaa93e51483977898a04b2632` |
| `public/images/albums/AcgExample/cover.jpg` | png | 7978244 | 6400×3396 | `a3d050fdab74c9fe4c692bd02b53c31be458aede3d3d4caaf867778a9f0d5899` |
| `public/images/albums/AcgExample/d1.webp` | webp | 922748 | 5856×3904 | `8929c56d72d2a9da773852f78a0a93b1a5401c43733e2d64ff1d341cb2ab091b` |
| `public/images/albums/AcgExample/d2.webp` | webp | 323436 | 2000×1200 | `610a733fb32b8990f9b6a7fbe2a6fbe98d2157674fd166bfcead7382e2531cab` |
| `public/images/albums/AcgExample/d3.webp` | webp | 217054 | 2560×1440 | `7ff61b4f85bfcad409819d9750d6da3efc496d6ea2dd2963d6e5496631d995ff` |
| `public/images/albums/AcgExample/d4.webp` | webp | 539850 | 3840×2160 | `800914da23988b8518d594f1baf57e684a7971161b09ddbf2214b39d9a9bb474` |
| `public/images/albums/AcgExample/d5.webp` | webp | 512232 | 2048×1152 | `e47162972b5e2131b031ec13974ecbc44541eb77ef7d00f9d678534970f1b26f` |
| `public/images/albums/AcgExample/d6.webp` | webp | 372210 | 1920×1080 | `316a0cfb2f77f5466a523041ad8372296484efbe6854d6f1f526cb020b544df0` |
| `public/images/albums/AcgExample/d7.webp` | webp | 372122 | 1920×1080 | `dcef4079a40334a5a372d0c0698dc8fbab34b4113b4dd0b5c7358ad6ff10cc82` |
| `public/images/albums/AcgExample/d8.webp` | webp | 283704 | 2880×1620 | `28b14d8d70c5bd4a3bf8bfda96cc4e92dac024f135632c45a9c518752320b8b6` |
| `public/images/albums/AcgExample/db67d185b865ebeb42be0ee1948952586147971e.jpg` | jpeg | 1752457 | 1307×2059 | `d765a6bc1377023c4e5e0e28859ec3907f04c21c74e3eaa742e6fdede0ea90aa` |
| `public/images/albums/AcgExample/fd450b78411a7548183aa291bb4cbb99d0bc2bed.jpg` | jpeg | 2028909 | 2000×2828 | `0ad6478812d7c815a85c48872384aff12a13c099a6786e330e080ebf5d3e61de` |
| `public/images/device/ipad11.png` | jpeg | 65495 | 1200×630 | `3f398e988aa575e7dc4fea512f5e419fbbc39b398820fe852581b1b7c17c528d` |
| `public/images/device/iphone17pro.png` | jpeg | 66893 | 653×653 | `bc4cca5c8c56da2293f11aff7756a564cb891dac3ca97e3b3725ba55d6ee3733` |
| `public/images/device/k60ultra.png` | jpeg | 75071 | 800×800 | `f48b728bfadf7d696ee5cc76c19d2dcc83560b62fc76a3957fa48965d86e93a6` |
| `public/images/device/macminim4.png` | jpeg | 26779 | 980×551 | `d92712aabfb614099bc6cd2be8b83292e673b0ca89cad7eda3d479bb3e1ff425` |
| `public/images/device/y9000p.png` | jpeg | 239049 | 1280×720 | `d6040dc73cff1ba916fddebb637f63659e7b0ecb2e45f37f5eeb53a0ba6ac85f` |
| `public/images/diary/1.jpg` | jpeg | 1310388 | 1080×1920 | `6c313c20452f7a9451ef976e5a2a519a711fdd125844486d3cb8a1a3da67fe46` |
| `public/images/diary/sakura.jpg` | jpeg | 221260 | 1350×900 | `4051fe28a395139e2ad671063af9a9dd1e19304374e0858f963f6b2a8dd880ea` |
| `public/images/obsidian/agentic-os.png` | png | 3139596 | 1536×1024 | `ed67c933ee33ee86462ebcc6d5c166be0c589a601d0bd69afecc76a877c97911` |
| `public/images/obsidian/ai-creator-start.png` | png | 2653055 | 1536×1024 | `80395c79c16aad04ff7d4cd87633d491e26016c5ed75df7cc70b58e4d0e53f83` |
| `public/images/obsidian/apple-design.png` | png | 1786996 | 1536×1024 | `8846a9ad70d04e2050fc5850147d6287c8cf5e75ad2f78dfc481aafb0993ac28` |
| `public/images/obsidian/automated-editing.png` | png | 2320985 | 1536×1024 | `8ad9879aad8aea7f9eff96304d45e598e55eed7b71996cc2fd83f1e048790b4e` |
| `public/images/obsidian/claude-code-loops.png` | png | 2232106 | 1536×1024 | `6a7a1882902fbd7d11ef05bbd2814a07e2c554830a0c1a0f302f43769e5fed78` |
| `public/images/obsidian/codex-skill-workflow.png` | png | 2406435 | 1536×1024 | `449150a564b505c1a9736f674195174d661c42c51f1e1c19f38a248b89503ada` |
| `public/images/obsidian/continuous-learning.png` | png | 2930984 | 1536×1024 | `747d6229c2c8d73d47418c8f46d3452231da812960a39728ccdba2f3deb11b85` |
| `public/images/obsidian/douyin-growth.png` | png | 2380233 | 1536×1024 | `35de0e0c0cc825f89ef39d06ccd4697cae9fc7857fe26793356ae7f7f434dbc4` |
| `public/images/obsidian/dynamic-workflows.png` | png | 2187011 | 1536×1024 | `fbdbb9426f9728b2c7f7c1f33835b3adef25d16b9563b2d52ec369115def7786` |
| `public/images/obsidian/graph-four-problems.png` | png | 3152326 | 1536×1024 | `1adce4d635d02c0a1b8cc3ebcddf65621edde88bd67f30e7af99252b8f23a5e1` |
| `public/images/obsidian/graph-roadmap.png` | png | 2845387 | 1536×1024 | `5513192926a8bcec3ca3be56a137a762f4d8cd0d955d1f0ea437d878935bdbfd` |
| `public/images/obsidian/harness-engineering.png` | png | 2441441 | 1536×1024 | `b6f1013139ab304b30d7c676ed273576799b5f400de43bf36a55478efc1434e6` |
| `public/images/obsidian/harness-loop-graph.png` | png | 2375363 | 1536×1024 | `3222f26830ea277ffec27131374c8a47cddec70dde8eabda7b85ab32790f0b15` |
| `public/images/obsidian/hyperframes-workflow.png` | png | 2204999 | 1536×1024 | `75bf498affa96229c8773e64fab2e71308f20ab24f46c6942c4411cc048a852d` |
| `public/images/obsidian/instruction-subtraction.png` | png | 2322196 | 1536×1024 | `6e8b33cf497c24a6bd5114bb49379e30e5db56dfd7d2101c83cfacc64c2de3ec` |
| `public/images/obsidian/karpathy-loop.png` | png | 2566085 | 1536×1024 | `582640f70c3cf53fc86d11dfc68810ccbc2713d5ee97aa79fd31b3c514fe1ecd` |
| `public/images/obsidian/shared-memory.png` | png | 2458466 | 1536×1024 | `7862295fce6446589e9f3324474d65f4621eb04d8312f16ef570d209e8face22` |
| `public/images/obsidian/steelman-thinking.png` | png | 2536335 | 1536×1024 | `b9da5d42468f408b58dc0918bbfa20ee45f38fab93ba2c30fc12a13d923f27ba` |
| `public/images/obsidian/visual-dictionary.png` | png | 2686918 | 1536×1024 | `a48c5cfbd3aaa4fa1462eeb1da85858202b78d4ada504597a48eccd6fc5391bf` |
| `public/images/obsidian/wechat-publishing.png` | png | 2447429 | 1536×1024 | `fec2080c5360c913d3e8de193cb7c9c10fbc8bafd83bfc9829b91d0030b2545e` |
| `public/pio/models/pio/textures/default-costume.png` | png | 603024 | 1024×1024 | `53d6884d5eb3af0dd08490ca63239a34d58cbd4305681f4c8c9aeceaecfa36d0` |
| `public/pio/models/pio/textures/pajamas-costume.png` | png | 470154 | 1024×1024 | `ceb6b0fe134dcd713fc771b3011a87f4f23b7abe559aa1e0c78c4e9cb0cffcb9` |
| `public/pio/models/pio/textures/school-costume.png` | png | 564818 | 1024×1024 | `6db85b8d05f7bc430aca27fa1d7904ee8a9f5158f8022f1c26d97fff34975bc8` |
| `public/pio/static/avatar.jpg` | jpeg | 4372 | 80×80 | `4e6279fd8ae8d54a2eb561477fc1a3db61f80a04c996364d5d94458372d6956e` |
| `public/sakura.png` | png | 43921 | 328×304 | `427f7a363b07e17ab7900d38d315c2bb2e4e66f8239f837c72de4321931117d9` |
| `src/assets/images/avatar.webp` | png | 394277 | 602×602 | `03129bb68eeae86dfdc313748ab8f32f7a173ee0fa8e13675684bfd31c6d7e04` |
