# 静态资源与历史 URL 维护

`scripts/asset-integrity-baseline.json` 是显式审查的资源契约。生成器只复制字节，不转码、不改尺寸，也不使用重定向。

- `originals[].classification = historical`：保留历史文件的 SHA、大小、格式和宽高；`source` 指向唯一规范源。`aliases[]` 必须同时登记旧路径、规范路径、原因和独立固定的 `sha256`。40 个 public 旧路径在构建产物中生成；旧 src 头像导入通过 Vite resolver 兼容，开发服务器直接请求也可读取。
- `immutable`：字体和已发布的静态优化头像等固定资产。不得仅为通过检查更新 SHA。
- `content`：普通内容图片允许经过审查后更新。它仍然要求显式修改具体记录的 SHA、大小、格式和宽高，并说明内容更新原因、引用影响及视觉验证。分类不是忽略校验的开关。
- 有历史别名的 Banner、头像等，必须保留原字节及旧映射。内容变化时使用新版本文件名，并让新引用指向新资源；不能让固定的历史 URL 返回新图。不能通过把分类改成 content 来放松历史别名的独立 SHA。
- 新增资源的扩展名必须符合实际文件签名；超预算是可见告警，不自动压缩。不要手工把旧副本放回 public/src，不要自动批量重写基线。

维护步骤：

1. 修改规范资源或新增版本，检查所有 Markdown、配置和原图引用，保留历史文件与映射。
2. 只在明确内容更新且审查通过时，更新对应普通内容记录。历史映射及字体不做批量重置。
3. 执行 `pnpm audit:assets`、`pnpm test:assets`、`pnpm test-font-compression`、`pnpm check`、`pnpm type-check`。
4. 执行目标构建，再执行 `pnpm test:build <cloudflare|static|mirror> <产物目录> [镜像输入快照]`。审计指定产物可用 `pnpm audit:assets --output <目录>`。
5. 对内容变化执行对应的浏览器验证；部署需要单独授权。

共同 Astro integration 覆盖 `pnpm build:cloudflare`、`pnpm build:mirror <快照>`、`pnpm build:static`、`pnpm build` 及直接 Astro build。`AXIS_OUT_DIR` 指定输出目录；静态包装器给该目录建立 Pagefind。`pnpm dev` 用虚拟路由提供旧 URL，不生成源文件；`pnpm preview` 读取已构建的历史资源。

构建前校验整个映射，拒绝路径穿越、大小写冲突、链接/目录联接、缺失源、源 SHA 漂移和不同字节的目标碰撞；构建后重新核对旧 URL 及规范 public 输出。已有相同字节的输出可复用，已有不同字节的输出会使构建失败。

CI 保留 Windows/Ubuntu 门禁，另设 Ubuntu 重型构建。`scripts/fixtures/asset-build-snapshot.json` 是无凭据、无需生产 API 的确定性输入，包含历史 Markdown 图片、数学公式、封面与相册原图。烟雾检查验证真实产物、历史 URL、资源引用、Pagefind、镜像版本、公式渲染及相册顺序。`pnpm test-font-compression` 实际执行压缩脚本并确认当前禁用配置不改写字体；失效的 `lint` 命令已移除，不以它代替现有检查。

构建产物仍保留历史 URL 的字节副本。源码去重不会自动减少某一页面的网络传输，也不会清除 Git 历史中的 blob。
