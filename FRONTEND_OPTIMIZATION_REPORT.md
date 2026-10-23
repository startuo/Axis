# Frontend Optimization Report

验证日期：2026-10-22～23。修改前基线：`164cc29`。本报告记录发布前的本地验收，范围为前端、构建配置与本地测试；该阶段未提交、推送或部署，未访问生产数据库或修改生产配置。后续发布状态以对应 Git 提交、平台构建检查和线上验收结果为准。

## A. Executive Summary

本次完成了实际代码修复，重点是 Swup 导航后旧文档、监听器、定时器与 Observer 的生命周期。主要问题已通过修改前复现、修改后相同路线复测确认；不以 Lighthouse 分数或单次内存下降作为结论。

- **实证修复**：小型 Astro processed script 被内联后由 Swup 重复执行；解析页媒体活动保留整份旧 Document；文章计时器、站点统计、目录相关副作用累积；相册脚本无条件请求全部照片；灯箱跨页残留。
- **实证修复**：Sakura resize 监听器引用错误、异步初始化后复活、隐藏时继续 RAF；轮播重复初始化、不可见模式和非当前平台仍调度；主题 Observer 持有旧代码块；移动目录回首页保留旧标题并在卸载时误移除其他模块钩子。
- **资源与竞态缓解**：Pio 脚本等待有界且可取消；音乐请求与延迟回调在真实卸载时取消；海报使用可撤销 Blob URL 并释放临时 Canvas；上传变体检查 HTTP 状态、释放 ImageBitmap，局部失败明确反馈且保留成功原图。受控测试覆盖这些路径，不能据此宣称所有外部服务故障已完成生产验收。
- **视觉约束**：原图片、布局、裁切、叠加、模糊、CSS 动画时长及曲线保留。Banner 仍为 2.5 秒、500ms 过渡；全屏仍为 5 秒、1000ms 过渡。预加载保留，切换前等待目标图 decode；没有重新编码图片、降低分辨率、删减樱花或关闭 Pio/音乐。

### 运行机制与资源归属

| 模块 | 创建 / 初始化 | 激活、暂停、恢复 | 清理与再次初始化 |
|---|---|---|---|
| Layout 全局服务、主题与菜单 | 浏览器文档执行一次；外链 processed module 由浏览器缓存去重 | Swup 生命周期只更新当前 main | 页面级引用在 content:replace 前释放；新页面重新扫描；整页关闭由浏览器释放 |
| Banner / 全屏控制器 | 持久 root 的 WeakMap 保证同一实例 | 仅可见模式、当前平台且 document 可见时一个 interval；Banner 另保留 hover/touch 暂停 | destroy 取消定时器、异步代次和自有监听；Swup 导航保留 root 与索引 |
| Sakura | 共享初始化 Promise、固定 resize 引用、单 Canvas | 可见时一个 RAF；隐藏暂停，恢复继续 | stop/destroy 使待完成加载失效；释放监听、RAF、Canvas；可重新初始化 |
| 音乐、Pio | 位于 Swup main 外；原持久实例保留 | 导航持续播放/显示，不按页销毁 | 真正卸载时取消本组件请求/等待/回调；既有后台管理入口行为保留 |
| TOC、文章最后修改时间、主题代码块 | 仅当前页有相应 DOM 时工作 | 当前文章一个计时器；隐藏暂停；目录观察当前标题 | 替换前断开 Observer、取消 RAF/延迟、清空旧 DOM；仅注销本组件钩子 |
| Fancybox、海报 | 入口按需加载 / 创建 | 灯箱保留原图与缩放；海报仍绘制相同像素 | 离页关闭灯箱；海报卸载撤销 Blob、取消回调、清空临时 Canvas |
| Swup 解析文档媒体副本 | Swup 解析完整 HTML，再克隆 main | 不是用户正在播放的 audio/video | 克隆完成后只清理非 live document 中的废弃媒体，解除浏览器原生活动保留链 |

### 初始问题与优先级

| 优先级 | 源码与复现证据 | 影响 | 验证方式 |
|---|---|---|---|
| P1 | 20 次归档往返后原生文档 5→45、DOM 4,833→146,243；Heap snapshot 的 Pending activities → RemotePlayback → audio → Document 链 | 整页残留，不能只统计当前 document.querySelectorAll | CDP GC 后原生 DOM counters、保留路径复核 |
| P1 | 构建产物中小型 processed module 内联；导航重复执行；统计 interval、全局监听随轮次增长 | 长期运行重复计算、事件重复 | 相同 Swup 路线、监听注册栈、timer 探针 |
| P1 | Sakura add/remove 分别 bind；目录/主题持有旧节点 | 泄漏及卸载后副作用 | 反复启停、异步竞态、真实文章往返与 detached Observer 检查 |
| P2 | 隐藏全屏组两个 5s interval，所有 12 张图常驻 will-change | 无效调度、潜在合成资源驻留 | 模式计时器、切换 readiness、CSS 提示数量 |
| P2 | 相册 DOMContentLoaded 中遍历 new Image；海报保留大 Data URL；变体上传忽略非 2xx | 懒加载失效、临时资源滞留、错误被掩盖 | 80 图隔离样本、海报逐像素对照、HTTP 503/解码失败测试 |
| P2 | 模式切换 write/read offsetHeight，主题逐块读写布局 | 多余同步布局 | 同一路线逐帧位置轨迹、原 CSS 保留、布局计数采样 |

## B. Before / After

### 测量方法

同机 Windows、Node 24、pnpm 10.22、Edge 155.0.4283.62；隔离临时浏览器上下文，DPR 1，桌面 1440×1000、移动 390×844，补充 900×1000 平板截图。本地静态 HTTP 服务，真实原图片、字体和 Pio 资源；音乐仅网络响应换为确定的本地 120 秒音频和歌单，使用真实播放器组件和 audio 播放。分析脚本被阻断以减少外部噪声，无线上写操作。

主路线包含多周期轮播、三模式反复切换、四次主题切换、文章、20 次首页与归档/相册往返、10 次文章往返、高清灯箱以及持久组件验证。每个内存采样先执行 CDP `HeapProfiler.collectGarbage`。这是本机带诊断探针的实验，不代表真实手机、生产网络或全部浏览器。

### 生命周期与长期运行

| 指标 | 修改前 | 修改后 | 变化 / 测试方法 |
|---|---|---|---|
| Banner / 全屏 / None 的活动轮播 interval | 三种模式均 3 个（1×2500ms + 2×5000ms） | 分别 1 / 1 / 0 | 两尺寸实测；不是取消预加载，而是暂停隐藏调度 |
| 单路线 20 次归档往返，原生 Document | 5→45 | 5→5 | 独立诊断路线，GC 后 CDP counters |
| 同上原生 DOM 节点 | 4,833→146,243 | 4,825→4,833；稍后 4,832 | 排除只看当前可见 DOM 的误判 |
| 同上事件监听器 | 231→1,288 | 241→242 | 监听注册栈与原生计数共同定位重复脚本 |
| 完整路线末尾 Document，桌面 / 移动 | 70 / 67 | 5 / 2 | 两尺寸各 20+10 次往返；持久服务的正常文档保留 |
| 第 10→20 轮监听器，桌面 | 826→1,356 | 263→263 | 模块预热后不再按导航次数增长 |
| 第 10→20 轮监听器，移动 | 808→1,338 | 246→246 | 同一操作序列；最终灯箱模块加载另有正常常量开销 |
| 首次采样 JS Heap，桌面 / 移动 | 4.068 / 2.943 MiB | 4.090 / 3.008 MiB | 基本相当，未宣称首屏堆下降 |
| 第 10→20 轮 JS Heap，桌面 | 6.660→7.283 MiB，+0.623 | 5.979→6.086 MiB，+0.107 | 预热后增长明显收敛；仍允许正常模块/缓存增长 |
| 第 10→20 轮 JS Heap，移动 | 5.384→5.980 MiB，+0.596 | 4.748→4.855 MiB，+0.107 | 同上；不是浏览器总内存 |
| 完整路线末尾 JS Heap，桌面 / 移动 | 8.566 / 7.243 MiB | 6.624 / 5.325 MiB | 两次路线的末点观察；主要结论由文档保留链与趋势支撑 |
| 文章返回首页后的 detached Observer 标题 | 46 | 0 | 两尺寸，第 1、5、10 轮均验证；主题与桌面/移动目录一起检查 |
| 完整路线首页的站点小时 interval / 文章秒 interval | 66 / 12 | 1 / 0 | 文章内仍保留一个 1000ms 更新时钟 |
| 全屏图片长期 will-change | 12 张 | 稳定状态 0；切换期间 2 张，1000ms 后释放 | DOM 样式实测 + 生命周期测试；实际 GPU 图层 / 显存 N/A |
| Sakura 25 次启停、并发加载 / 提前销毁 | 原 bind 引用与加载竞态测试失败 | 全部通过；单 Canvas、单自有 RAF | 源码驱动测试，不减少原粒子数 |
| 受控隐藏 / 恢复 | 未有可靠原生对照 | 轮播 interval 1→0→1；总 RAF 2→1→2；Canvas 始终 1 | Browser getter/event fixture；剩余 RAF 来自持久 Pio，不伪称原生后台验证 |

### 视觉、动画与图片

| 指标 | 修改前 | 修改后 | 变化 / 测试方法 |
|---|---|---|---|
| Banner 周期间隔 | 约 2500ms | 桌面 2496～2503ms；移动 2497～2505ms | MutationObserver 去除同次切换的重复 class 记录；所有已观察目标图 ready |
| 全屏周期间隔 | CSS/配置 5000ms；基线未保存切换时间序列，实测 N/A | 桌面 4999.2ms；移动 4999.1ms | 实际 style 切换时间差，目标图 ready；不伪造基线时间戳 |
| Banner / 全屏 CSS 过渡 | 500 / 1000ms | 500 / 1000ms | 保留 CSS 曲线、裁切、叠加及原图；未缩短动画 |
| Banner / 全屏 RAF 间隔 p95，桌面与移动 | 均约 6.2ms | 均约 6.2ms | 8s / 10.5s 窗口；本机高刷新率 RAF，不是 GPU 渲染耗时或手机 FPS |
| Banner >50ms 帧间隔 | 桌面 2 次、移动 0 | 两尺寸均 0 | 单次窗口的观察，不据此承诺普遍帧率提升 |
| 主流程 initial 采样已完成图片资源，桌面 | 20 条 / 36.882 MiB | 25 条 / 47.162 MiB | Resource Timing transferSize；高清双平台预加载的前期成本更高 |
| 同上移动 | 17 条 / 24.024 MiB | 21 条 / 45.571 MiB | 不是网络请求下降；浏览器可能重取大封面，整段导航总传输未宣称降低 |
| 80 图相册样本首屏图片请求 | 80 | 24 | 相同原图字节、独立 query，恢复原生 lazy；仍随浏览器预取距离变化 |
| Fancybox | 原图可看；离页仍残留 1 个容器 | 原图可看且缩放面积 1,167,356→2,603,520 CSS px²；离页 0 个容器 | 真实控件缩放、打开状态直接 Swup 导航；普通 Escape 关闭也经主路线验证 |
| 海报 | 850×734，Data URL | 850×734，Blob URL；活动 URL 1→0 | 与原实现 raw pixels 对照；卸载后撤销 |
| 三种模式切换的主布局轨迹 | full/none top 74.796875px；banner 350px | 各帧相同 | 每种模式逐帧采样 1 秒；left=0、width=1440 相同；每种模式原 2 次强制 offsetHeight 读取移除 |
| 18 组布局截图 / 海报像素 | 基线原构建 | 原始截图差异 0～0.466%；4 组补充等待后复测差异 0～0.540%；海报 raw pixels 完全相同 | 每像素 RGB 最大通道差 >8 计为变化；图像边缘与 Pio 欢迎框时序差异如实保留，不宣称全页逐像素相同 |

持久组件实测：两尺寸 Banner、audio、Pio 均为同一 DOM 实例。桌面音乐导航后 42.587s，20 轮后 87.847s，末尾 118.691s，持续播放；移动分别 41.069s、85.696s、115.698s。音量保持 0.7。该证据验证本地音频传输下的真实播放生命周期，不代表第三方在线歌单可用性。

截图差异已结合 diff 图和前后画面人工复核：未见布局、裁切、主题或原图质量变化。4 个初始差异画面补充等待可见图片 decode、fonts.ready 和有限入场动画后复测；差异位置随重采样变化，包含独立于 Pio canvas 的欢迎浮层以及图片/文字渲染边缘。后续测试截图 CSS 已覆盖 `.pio-dialog`，正式 Pio 显示未修改。保留原始与复测结果，不以仅挑选像素相同的画面代替说明。

### 首屏重复采样

构建与主浏览器任务结束后串行执行前后采样；每个尺寸、每个版本 5 次新 context，HTTP 缓存隔离，无网络限速。每个浏览器进程后续 context 仍会受到 OS/字体/编译预热影响，未随机化执行顺序，因此仅报告本机中位数与区间，不外推生产收益。

| 指标（桌面 / 移动） | 修改前 | 修改后 | 解释 |
|---|---|---|---|
| LCP 中位数（5 次范围） | 184ms（176～456） / 188ms（172～220） | 184ms（180～420） / 192ms（180～204） | 本地首屏总体相近，未取得普遍加载加速证据 |
| CLS 中位数 | 0.000514 / 0.001921 | 0.000525 / 0.002189 | 均较小；原入场/动态组件仍存在，不承诺 CLS=0 |
| 长任务个数中位数 | 1 / 0 | 1 / 0 | 未宣称首屏长任务减少 |
| 5 次中的最大长任务 | 87ms / 56ms | 144ms / 65ms | 首个桌面 context 出现 144ms 冷启动长任务；不能用较好中位数掩盖该点 |
| 累计 LayoutDuration 中位数 | 163.9ms / 155.5ms | 170.0ms / 169.9ms | 是整个首屏采样窗口累计值，含实际资源加载，不能当成单次模式切换耗时 |
| 累计 RecalcStyleDuration 中位数 | 225.1ms / 178.5ms | 238.3ms / 181.9ms | 未宣称全站重排/重绘耗时下降；本次收益集中在消除导航后的重复工作 |

原始数据：`output/playwright/frontend/before-load-final/results.json`、`after-load-final/results.json`；各目录 `metrics-summary.json` 提供相同口径的紧凑读数。

**指标口径**：JS Heap 只覆盖 V8 堆；CDP 原生节点包含浏览器持有的解析文档，当前可见 DOM 数不能替代它。正常首次加载模块和缓存允许增长，重点比较预热后的第 10→20 轮及保留路径。WorkingSet/PrivateMemory 已记录进 JSON，但进程共享页与分配器缓存使其波动很大，不能相加当作物理总内存或 GPU 显存。实际 GPU 图层数及显存节省为 **N/A**；移除合成提示不等于量到了 GPU 内存下降。

## C. Code Changes

| 文件 | 类型与技术理由 |
|---|---|
| `astro.config.mjs` | **Bug / 重复计算**：JS processed module 不再被小资源阈值内联，浏览器只执行一次；其他资源仍保持 4KiB 阈值。不新增依赖。 |
| `src/layouts/Layout.astro` | **Bug / 泄漏**：委托 Banner 控制器；全局 inline bootstrap 标记 Swup 忽略重放；动态分析脚本同样标记；替换后释放 inert parsed media；离页关闭 Fancybox，并仅在该离页实例中禁止 Hash 插件 history.back 与 Swup 争抢 URL，普通关闭仍保留原行为。 |
| `src/utils/parsed-media.ts` | **泄漏根因**：只处理 Swup 废弃的解析文档副本，禁用 RemotePlayback、移除媒体源并 load/remove；明确拒绝 live document，不重建持久播放器。 |
| `src/utils/banner-carousel.ts` | **生命周期 / 维护性**：root 单实例，单 interval，自有 AbortController；模式/平台/可见性与 hover/touch 状态协调；过期 decode 不写 DOM。 |
| `src/utils/fullscreen-wallpaper.ts`、`src/components/misc/FullscreenWallpaper.astro` | **计算 / 合成提示**：仅当前可见组调度；两张切换图片临时 will-change，1000ms 后撤销；保留原高清图片与原 CSS 叠加效果。单图随机分支视觉实现保留。 |
| `src/utils/image-ready.ts` | **预加载 / 竞态**：复用 DOM Image 与 WeakMap decode Promise，不额外保留 new Image；失败可重试。 |
| `src/layouts/MainGridLayout.astro` | **计算 / 维护性**：移除经逐帧对照确认多余的 offsetHeight；类提交完成后发出有限事件；Swup 按实例绑定；背景明确使用 original 规格。 |
| `src/utils/sakura-manager.ts` | **Bug / 泄漏**：稳定监听引用，共享并可失效的异步初始化，可见性控制单 RAF，完整释放 Canvas；DPR 处理保留显示尺寸与原粒子数量。 |
| `src/scripts/theme-optimizer.js` | **泄漏 / 重排**：钩子单次绑定、替换前断开 Observer 并清空 DOM 集合，取消旧回调；先批量读取几何再写入；恢复原 transition/will-change 值。 |
| `src/components/widget/TOC.astro`、`src/components/MobileTOC.svelte` | **Bug / 泄漏**：新旧页交界清理标题、Observer、RAF、timer；移动首页也执行清理；只 off 自己的钩子，不移除其他订阅。 |
| `src/components/widget/MusicPlayer.svelte` | **Bug / 竞态**：空曲目不把 audio src 解析为站点根路径；真正卸载才 abort 歌单请求、清理延迟回调和 RAF；Swup 持续复用同一 audio。 |
| `src/components/widget/Pio.svelte` | **竞态缓解**：按脚本实际 ready 顺序等待，共享已有 script，15 秒有界超时，可取消监听/等待；取消递归 100ms 重试，保留原持久实例策略。 |
| `src/components/misc/SharePoster.svelte` | **资源 / 竞态**：防重复生成与卸载后提交；加载回调可取消；PNG 使用 Blob URL 并在卸载撤销，临时 Canvas finally 清空；尺寸和绘制逻辑不变。 |
| `src/components/console/api.ts` | **Bug / 资源**：display/thumb 分别检查 HTTP 状态；失败警告返回调用端且保留成功原图；Bitmap finally close、临时 Canvas 清零。 |
| `src/components/console/EntryEditor.svelte`、`Member.svelte`、`Operations.svelte` | **错误反馈**：展示局部变体失败信息，避免将其静默当成全部成功。 |
| `src/components/misc/ImageWrapper.astro` | **质量边界**：新增明确 original/display 选择，默认维持原策略；灯箱 data-src 指向 original；异步解码。未批量替换相册原图为未经高 DPR 验收的变体。 |
| `src/pages/albums/[id]/index.astro` | **网络 / 内存**：移除全页 new Image 预加载，恢复原生 lazy；Fancybox 继续获取原图。 |
| `src/scripts/last-modified.ts`、`src/pages/[permalink].astro`、`src/pages/posts/[...slug].astro` | **重复计时器 / 维护性**：两份文章计时脚本归并为当前页单时钟；离页与隐藏停止，不持有旧文章。 |
| `src/components/Navbar.astro`、`widget/Calendar.astro`、`widget/SideBar.astro`、`widget/SiteStats.astro` | **重复执行**：持久 inline bootstrap 标记 `data-swup-ignore-script`，保留其已有按页更新入口。 |
| `scripts/frontend-lifecycle.test.mjs`、`scripts/frontend-browser.mjs`、`package.json` | **回归测试**：新增 16 项源码驱动的 VM/单元测试，以及实际 Edge/Swup、资源采样、截图、80 图相册、海报和可见性自动化；仅测试进程注入探针，生产无诊断统计开销。 |

`public/`、`src/assets/`、`src/config.ts`、`workers/`、`shared/`、锁文件无本次改动；未变更 API 契约、D1 Schema、权限和后端核心逻辑。

## D. Validation

| 命令 / 检查 | 结果与范围 |
|---|---|
| `pnpm check` | 125 文件，0 errors、0 warnings；4 个既有 hints（diary 相关）。 |
| `pnpm test:frontend` | 16/16：Sakura 多轮启停/并发/卸载竞态/高 DPR/隐藏恢复；Banner 与全屏单调度/解码竞态；主题旧任务/Observer；解析媒体 live document 保护；Pio 卸载和成功初始化；移动目录独立钩子；变体 HTTP/解码失败与资源释放。 |
| `pnpm test:worker` | 33/33 通过；后端源码未改。 |
| `pnpm build:static` | 成功，Pagefind 28 页索引。原构建未依赖生产凭据；zh-cn 不支持词干提示不影响索引。 |
| `pnpm build:cloudflare` | 成功；保留构建既有 path builtin externalized、Astro middleware sequence 循环分块提示。 |
| 本地 Wrangler / D1 / KV | 用 `--local --persist-to .axis/frontend-local-state` 的独立空数据库应用现有迁移；首页、归档、相册、API health 与打包 JS 均 200。示例文章不在该空 D1 中，302→404，未当作文章 SSR 验收；静态文章浏览器流程另测。Wrangler 报既有 right-sidebar-layout CommonJS/ESM 提示，相关源文件未改。 |
| `git diff --check` | 通过；Git 的 LF→CRLF 提示不是校验错误。 |
| 最终 Edge 自动化 | `after-delivery-final`：completed=true；两尺寸各 30 次往返、18 组稳定截图、80 图媒体样本、缩放与灯箱离页、海报、受控隐藏恢复全部通过；errors=[]、failures=[]。 |

主要原始证据（本地保留，未加入发布资源）：

- `output/playwright/frontend/before-diagnosis/results.json`、`after-media-cleanup-diagnosis/results.json`：根因定位与原生 DOM 曲线。
- `output/playwright/frontend/before-final/results.json`、`after-delivery-final/results.json`：两尺寸相同路线、定时器、堆、持久组件、轮播准备与帧间隔。
- `output/playwright/frontend/before-visual-final/`、`after-delivery-final/`：18 组稳定截图；截图仅在测试中固定日期和轮播时钟，隐藏动态樱花/Pio/打字文字/音乐和外部歌单失败提示，正式源码没有禁用这些功能。动态功能另以实际播放、周期与单实例断言验证。
- `output/playwright/frontend/before-visual-settled/`、`after-visual-settled/`：4 组差异画面的补充等待复测；原始 `comparison.json` 与汇总 `comparison-settled.json` 均在 `after-delivery-final/`，记录比较使用的来源与差异数值。
- `output/playwright/frontend/media-before/`、`after-delivery-final/poster.png`：80 图相册隔离样本与海报原图对照。
- `.axis/frontend-check.log`、`frontend-tests.log`、`frontend-worker-tests.log`、`frontend-static.log`、`frontend-cloudflare.log`、`frontend-delivery-final-browser.log`、`frontend-local-ssr-results.json`：执行日志。

复现浏览器流程（先完成静态构建；运行 Cloudflare 构建会替换 dist，因此需要先保留静态输出）：

```powershell
pnpm build:static
$env:AXIS_TEST_DIST = 'dist'
# 已安装 Playwright 时无需此覆盖；本机使用随工作区运行时提供的包。
$env:AXIS_PLAYWRIGHT_MODULE = 'C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
$env:AXIS_TEST_MEDIA = '1'
$env:AXIS_TEST_VISIBILITY_FIXTURE = '1'
pnpm test:frontend:browser
```

诊断、截图和首屏重复采样可分别通过 `AXIS_TEST_DIAGNOSE=1`、`AXIS_TEST_VISUAL_ONLY=1`、`AXIS_TEST_LOAD_SAMPLES=1` 选择；`AXIS_TEST_VISUAL=0` 跳过稳定截图。未安装 Playwright 的环境应提供已有包或自行安装测试依赖，本次未改变项目依赖树。

失败与修正记录：基线 Sakura 测试确实失败；早期截图错误地 mask 全屏 Canvas，已废弃并改为测试截图 CSS；旧解析文档在只修空 audio src 后仍增长，最终依据 native 保留路径补齐解析副本清理；最终文章往返又暴露移动目录残留，补测后修复；灯箱离页残留从基线实测复现后修复，第一次补 close 仍触发 Hash 历史回退使 Swup 导航超时，因此进一步修正离页实例的 Hash 行为后复测。原生隐藏测试未能可靠改变 document.hidden，未伪记为通过。

旧测试构建目录的递归清理被自动审批策略阻止，保留了这些仅本地的临时副本，没有尝试绕过。

## E. Remaining Risks

- 原生后台页签：当前 Edge 自动化环境即使切前台、最小化、关闭焦点模拟或独立启动也未稳定得到 `document.hidden=true`；因此该项实际 OS 路径为 **N/A**。受控 hidden/visibilitychange 与单元测试验证暂停/恢复和无重复循环，但不能替代真实用户后台验收。
- 高清预加载仍有成本：保留两平台原图预加载会占用网络与浏览器解码缓存；本次减少隐藏调度与长期合成提示，没有降低图片质量。GPU 显存、浏览器全部物理内存节省没有可靠量化结论。
- 首屏实验为本地、DPR 1；手机高 DPR/低端 GPU、真实弱网、Safari/Firefox、实际生产缓存和第三方歌单服务尚未验证。没有证据支持全站性能或生产 LCP 的百分比承诺。
- 页面截图没有达到全页逐像素相等；可见差异图、重采样范围与人工复核结论已保留。海报像素和主布局轨迹严格相同；其他视觉结论只覆盖本机已检查的状态与交互。
- 本地 Cloudflare SSR 使用隔离空 D1，只验证壳页面/静态资源/API health；含真实发布内容和登录的生产端到端流程不在本地验收范围。构建通过不能单独证明线上已生效。

## F. Final Engineering Verdict

**是，已实证提高前端工程质量、资源使用效率和长期运行稳定性。** 核心证据是旧 Document 的原生保留链解除、相同导航路线下文档/节点/监听器增长收敛、旧页 Observer 归零，以及隐藏轮播与重复计时器消除。16 项前端测试、33 项 Worker 测试、两类构建和完整浏览器流程提供了可复测证据。

改动保留原高清资源与视觉功能；收益来自明确资源归属、取消重复执行和过期工作，而非降低画质或删减效果。不能把这些结论扩展为生产站点已更新、浏览器总内存或 GPU 显存下降、真实手机性能通过。原生后台与生产 SSR 内容的验证边界见上文。

验收红线：

- [x] 视觉未主动简化；原高清图片未修改或重编码。
- [x] Banner / 全屏预加载保留，原间隔与 CSS 过渡保留，目标图准备后切换。
- [x] 主要轮播单实例、单可见调度；持久组件复用，页面级资源清理。
- [x] Sakura、全局监听、主题与目录 Observer 具有明确生命周期和回归证据。
- [x] 移除实测多余重排，减少长期 GPU 合成提示；不宣称已测得 GPU 显存下降。
- [x] 相册恢复 lazy；灯箱高清原图/缩放、Pio 和音乐跨页行为实际验证。
- [x] 静态/Cloudflare 构建、必要本地兼容检查与测试完成，局限如实记录。
- [x] 本地优化阶段未自动提交、推送或部署，未修改生产数据、凭据或配置；后续发布另行按授权执行。
