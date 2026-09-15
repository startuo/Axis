---
title: Apple 设计语言深度分析
published: 2026-09-14T00:00:00.000Z
updated: 2026-09-14T00:00:00.000Z
description: 本文以 Apple Human Interface Guidelines（HIG）官方《Design Principles》为核心，结合 WWDC 设计专场、Apple 设计史与行业评论，对 Apple 的设计语言做一次系统的深度拆解。
tags:
  - 知识沉淀
category: 设计
lang: zh_CN
draft: false
image: /images/obsidian/apple-design.png
---

## Apple Design Language — A Deep Bilingual Analysis

> 本文以 Apple Human Interface Guidelines（HIG）官方《Design Principles》为核心，结合 WWDC 设计专场、Apple 设计史与行业评论，对 Apple 的设计语言做一次系统的深度拆解。
>
> **版本说明**：Apple 于 **2026 年 6 月 8 日**在 HIG 重新发布设计原则，将经典的三大原则（Clarity / Deference / Depth）升级为 **八条原则**（Purpose / Agency / Responsibility / Familiarity / Flexibility / Simplicity / Craft / Delight）。本文以新版八原则为主体，同时梳理其历史源流、视觉语言（Liquid Glass）与批判性视角，做到"知其然，亦知其所以然"。

---

## 目录 Table of Contents

1. [导论：Apple 设计语言是什么](#1-导论apple-设计语言是什么)
2. [溯源：Apple 设计哲学的三大源流](#2-溯源apple-设计哲学的三大源流)
3. [核心：2026 新版八条设计原则详解](#3-核心2026-新版八条设计原则详解)
4. [对照：经典三原则与新八原则的关系](#4-对照经典三原则与新八原则的关系)
5. [视觉层：从拟物到 Liquid Glass 的演进](#5-视觉层从拟物到-liquid-glass-的演进)
6. [系统层：Apple 设计系统的基本构件](#6-系统层apple-设计系统的基本构件)
7. [批判性视角：Apple 设计语言的争议与边界](#7-批判性视角apple-设计语言的争议与边界)
8. [学习启示：把 Apple 原则转化为自查清单](#8-学习启示把-apple-原则转化为自查清单)
9. [参考来源](#9-参考来源)

---

## 1. 导论：Apple 设计语言是什么

### 1.1 一句话定义

Apple 在 WWDC26「Principles of great design」中将设计定义为 **"making something with intention"（带着意图去造物）**。整部 HIG 都在回答一个问题：**如何让软件像 Apple 的硬件一样，做到克制、精确、可信赖。**

### 1.2 一个关键心智模型：设计是在消费用户的资源

Apple 认为，每加入一个功能，都在索取用户的三样稀缺资源：

> Every feature you add asks for a person's time, attention, and trust.
> （你添加的每个功能，都在索取一个人的时间、注意力与信任。）

因此，**决定"不做什么"和决定"做什么"同样重要**。这是理解 Apple 一切设计决策的总纲——简洁不是审美偏好，而是对用户资源的尊重。

### 1.3 HIG 的地位

HIG（Human Interface Guidelines，人机界面指南）是 Apple 设计语言的"宪法"，覆盖 iOS / iPadOS / macOS / watchOS / tvOS / visionOS 全平台。它包含四层内容：

| 层级 | 内容 | 举例 |
| --- | --- | --- |
| 设计原则 | 形而上的指导（what to believe） | 本文件的八原则 |
| 平台主题 | 各平台的气质（where you are） | macOS 的大窗口/深度任务 |
| 交互模式 | 规范化的范式（how to behave） | 导航、手势、反馈 |
| 组件与系统 | 可用的零件（what to build with） | SwiftUI 组件、材质、SF Symbols |

学习 Apple 设计语言，应当**自上而下**：先理解原则（为什么），再学习组件（是什么）。

---

## 2. 溯源：Apple 设计哲学的三大源流

Apple 的设计语言不是凭空出现的，它至少有三个清晰的源头。

### 2.1 Dieter Rams 与德国理性主义设计（Braun / Ulm 学派）

Apple 产品设计与德国工业设计师 **Dieter Rams（迪特·拉姆斯）** 及 **Braun（博朗）** 的关系是设计史最著名的案例之一。Rams 在 Ulm 设计学院的理性主义土壤中，为 Braun 确立了"功能主义 + 诚实材料 + 极简形式"的路线。

Rams 的 **Ten Principles of Good Design（好设计的十项原则）** 几乎就是 Apple 的教义：创新（innovative）、实用（useful）、美学（aesthetic）、易懂（understandable）、克制（unobtrusive）、诚实（honest）、持久（long-lasting）、彻底（thorough）、环保（environmentally friendly）、尽可能少的设计（as little design as possible）。

其中对 Apple 影响最深的是 **"Weniger, aber besser"（Less, but better，少而更好）**。注意：这句话常被误记为乔布斯的名言，实际出自 Rams。Rams 本人对 Apple 的评价是：

> "Apple has managed to achieve what I never achieved: using the power of their products to persuade people to queue to buy them."
> （Apple 做到了我从未做到的事：用产品的力量让人排队购买。）

### 2.2 Snow White 与 frog design 的设计语言

1980 年代，乔布斯请德国设计师 **Hartmut Esslinger（哈特穆特·艾斯林格）** 创立的 **frog design** 为 Apple 打造了 **"Snow White"（白雪公主）** 设计语言——以白色为主、强调水平线条、用"微妙的装饰性条纹"消解体量的设计系统。它奠定了 Apple "白、净、轻盈"的视觉基因，也是最早把"设计语言"作为系统性概念引入消费电子的尝试之一。

### 2.3 Jony Ive 与 1997 年后的现代 Apple

**Jony Ive（乔纳森·艾维）** 1997 年回归主导 Apple 工业设计后，将 Rams 的极简主义推向极致：iMac、iPod、iPhone、iPad 都以"消除多余、单一材质、精密圆角"著称。Ive 时代的另一贡献是把**触感与光**引入设计语言——"如何让一块玻璃看起来像有生命"，这条线索直接通向了 2013 年的 iOS 7 和 2025 年的 Liquid Glass。

**小结**：Apple 设计语言 = 德国理性主义的"克制" × Snow White 的"纯净" × Ive 的"材质与光"。这是一脉相承的哲学，只是载体从家电变成了屏幕。

---

## 3. 核心：2026 新版八条设计原则详解

Apple 在 2026 年 6 月 8 日重新发布的八条原则，是当前官方口径。它们不是平级的技术规范，而是一套**价值判断系统**。Apple 特别强调：**没有组合公式，原则之间可能存在张力，需要设计师用判断力（judgment）去权衡。**

下面逐条展开，每条包含：官方定位、中文解读、具体例子、常见误读。

### 3.1 Purpose — 目的

> Make something meaningful. Design starts with intention; focus on what matters most to the people you're designing for.
> （做有意义的东西。设计始于意图；把注意力放在对你所服务的人最重要的事情上。）

**中文解读**：在设计任何东西之前，先问"它存在的理由是什么"。功能不能因为"别人有所以我们也要有"而存在，必须能说清它对用户的价值。

**具体例子**：
- iPhone 的静音拨片与后续的 Action Button —— 每个硬件控制都有明确目的，而非堆料。
- 备忘录 App 几十年只做"快速记录"一件事，没有塞进日程、日历、社交。
- 反例：很多 App 首页塞满运营位、直播入口、金币任务——每个元素都在"索取"用户注意力，却没有清晰目的。

**常见误读**："Purpose 等于做功能规划。" 其实它更接近一种**负责任的取舍纪律**：敢于砍掉与核心价值无关的功能。

### 3.2 Agency — 能动性（用户掌控感）

> Let people do things their own way. Give people freedom to act, keep them informed, and make it easy to recover from mistakes.
> （让人们用自己的方式做事。给人行动的自由，让他们保持知情，并让他们易于从错误中恢复。）

**中文解读**：Agency 是 Apple 对"用户控制权"的现代表述，包含三根支柱：

1. **自由行动**：给选择、允许按自己的节奏探索，不把用户硬推上预设路径。
2. **保持知情**：系统状态要透明，用户永远知道"我在哪、发生了什么、接下来会怎样"。
3. **容错（forgiveness）**：因为人一定会犯错，所以**撤销（undo）**至关重要；确认弹窗只留给真正破坏性、不可逆的操作。

**具体例子**：
- iOS 的「摇一摇撤销输入」、macOS 全局 Cmd+Z —— 让用户敢于试错。
- 删除照片先进入"最近删除"而非直接消失 —— 给后悔留余地。
- 深色模式、控制中心的自由度 —— 用户可以按自己的方式配置系统。

**常见误读**："有撤销 = 有 Agency。" 不，Agency 还要求**不替用户做决定**。比如默认勾选"同意所有权限"就是剥夺 Agency。

### 3.3 Responsibility — 责任

> Act in people's best interest. Prioritize safety and privacy, and be transparent about what your product does and why.
> （以用户的最大利益行事。把安全与隐私放在首位，并坦率说明你的产品做什么、为什么这么做。）

**中文解读**：这是八原则里在 AI 时代被 Apple 特别强调的一条。它包含：

1. **隐私是人权**（Privacy is a human right）：不要在 App 启动瞬间就抛出一堆权限弹窗；只在真正需要的时刻、带着清晰语境去请求数据。
2. **预见伤害**：在设计任何功能前，问自己——这个功能可能被怎样滥用？谁会受伤？如何防止？
3. **AI 责任**：例如一个食谱 App，必须防止 AI 向已登记过敏的用户推荐含过敏原的菜。Apple 的态度很明确：**如果风险大于价值，宁可移除功能，而不是靠免责声明（disclaimer）糊弄过去。**

**具体例子**：
- 系统级「App 跟踪透明度（ATT）」——强制 App 在跨 App 追踪用户前征得同意。
- 照片的"仅选中的照片"授权模式 —— 最小化数据暴露。
- 健康 App 对敏感数据的端到端加密与本地处理。

**常见误读**："责任 = 合规清单。" 不，它要求设计者**主动预判最坏情况**，而不是在事后贴一份隐私政策。

### 3.4 Familiarity — 熟悉感

> Build on what people already know. Use effective metaphors, follow established conventions, and apply them consistently.
> （建立在人们已知的事物之上。使用有效的隐喻，遵循既有惯例，并一致地应用它们。）

**中文解读**：用人们已有的心智模型，降低学习成本。三个抓手：

1. **隐喻（metaphor）**：不过于字面（recreate 现实），也不过于抽象。废纸篓=删除、齿轮=设置、书页=文档。
2. **惯例（convention）**：物理世界与数字世界的既有习惯要遵循；用户不必重新学习"什么是可点击的"。
3. **一致性（consistency）**：看起来相同的东西行为应该相同；常用操作应待在固定的位置。

**具体例子**：
- macOS 的滚动方向、Command 键的位置，几十年没变 —— 迁移成本为零。
- iOS 所有列表左滑 = 删除/更多操作，形成肌肉记忆。
- 键盘快捷键、触控板手势与物理直觉对齐。

**常见误读**："熟悉 = 不做创新。" 恰好相反，Familiarity 是**创新的地基**：只有基础交互是熟悉的，用户才有认知余量去接受真正的创新（比如 Face ID）。

### 3.5 Flexibility — 灵活性

> Adapt to diverse contexts and needs. Support many devices, interaction types, and perspectives; design inclusively.
> （适应多样化的情境与需求。支持多种设备、多种交互方式与多种视角；包容性地设计。）

**中文解读**：同一个用户在不同场景下需求完全不同，不同用户的能力也各不相同。设计应当**适配**而非假设"一个方案适合所有人"。

1. **跨情境**：同一个人在家、跑步、开车时与音乐的关系完全不同——iPhone 上要快速点按，CarPlay 上要免提，Mac 上要做深度工作流。
2. **跨设备**：为每个平台的优势设计，而不是简单搬运。
3. **跨能力（无障碍）**：支持 VoiceOver、动态字体、触觉替代视觉、键盘导航。
4. **个性化**：当没有单一方案适合所有人时，允许用户重排或隐藏控件。

**具体例子**：
- Dynamic Type（动态字体）：用户可以把系统文字调到最大，界面必须仍然可用。
- iOS 主屏的 Widget 与 App 图标重排、控制中心自定义。
- iPadOS 的"台前调度（Stage Manager）"——兼顾窗口化与全屏两种心智。

**常见误读**："灵活性 = 堆选项。" 真正的灵活性是**自适应**（界面自己调整），而不是把复杂度转嫁给用户。

### 3.6 Simplicity — 简洁

> Be clear and direct. Remove the unnecessary, establish hierarchy, and ensure every element earns its place.
> （清晰而直接。移除多余，建立层级，确保每个元素都配得上它的位置。）

**中文解读**：Apple 在这里有一句重要的官方澄清——**"Simplicity isn't minimalism"（简洁不是极简主义）**。把功能藏进菜单让界面"看起来干净"，实际上是更难用。真正的简洁是**消除摩擦（removing friction）**：

1. **言简意赅**：用最简单、最通用的词标注控件、传达概念。
2. **建立层级**：通过顺序、间距、对比，让"最重要的元素"一眼可见。
3. **元素必须"赚到"它的位置**：无法自证价值的元素就是噪音。
4. **有时候简洁意味着"加内容"**：比如一个播放/暂停按钮，在长时间暂停后重新出现时，应该同时显示"我在哪、还剩多少时间"——额外的上下文帮助用户做决定。

**具体例子**：
- Apple 官网产品页：一屏只有一个主角、一个 CTA。
- 计算器、秒表这类工具 —— 功能极简到极致，但每个数字键都清晰。
- 2026 Apple 设计奖获奖应用 **Grug**：每天只给一条人生小建议，没有 streaks（连续打卡）、没有奖励、没有进度追踪——把"极简"当作产品策略。

**常见误读**：把"少"当目标。Apple 的意思是"**少而清晰**"，为了清晰，该加的信息要加（见上面的播放器例子）。

### 3.7 Craft — 工艺

> Care about every detail. Deliver polished visuals, smooth animations, precise wording, and maintain quality over time.
> （在意每一个细节。交付打磨过的视觉、流畅的动画、精确的措辞，并长期维持质量。）

**中文解读**：Craft 是"用户能感受到的用心"（the care the user can feel）。一个没反应的按钮、卡顿的滚动、错位的图标、旋转屏幕就崩掉的布局——会让人怀疑整个产品的质量。Craft 体现在：

1. **每个决定都刻意**：漂亮的排版、随明暗模式自适应的颜色、清晰的图标、流畅的动画反馈。
2. **迭代与实验**：尽早做原型、试新路、扔掉不行的、在真实环境测试。
3. **持续维护**：发布不是终点。界面要跟随新平台能力与设计范式演进。

**具体例子**：
- 原生 App 的触觉反馈（Haptic）——按钮按下的一瞬，硬件与软件同步响应。
- 深色模式下图标、材料、阴影的逐一适配。
- 系统级字体排印（SF Pro）在标点、数字、粗细上的精雕细琢。

**常见误读**："Craft = 像素级打磨的末期工作。" 不，Craft 是**全程纪律**，且与产品命运绑定——细节的质量决定用户对整体的信任。

### 3.8 Delight — 愉悦

> Make it human. Identify the emotion you want to inspire and deliver it in a way that is satisfying, enriching, and a joy to use.
> （让它有人性。找到你想唤起的情感，并以一种满足、充实、愉悦的方式交付它。）

**中文解读**：Delight 是八原则里最容易被误读的一条。Apple 的官方立场非常明确——**愉悦不是靠彩带和撒花制造出来的（not manufactured with confetti or flourishes），它是其他所有原则做对之后自然涌现的结果。**

1. **先确定情绪**：你想让用户感到放松、自信，还是兴奋？然后在整个设计中反复强化这种情绪。
2. **创造定义性时刻**：每一次交互——哪怕是一条错误提示——都是注入产品性格的机会。
3. **警惕为愉悦而愉悦**：为了效果而牺牲核心目的，就是自嗨。

**具体例子**：
- iMessage 里泡泡的"破裂"特效——情绪到位，但不喧宾夺主。
- Apple Watch 的站立提醒：一个温柔的小动画，比"弹窗警告"更贴合"陪伴"的情感。
- 2026 Apple 设计奖获奖游戏 **Is This Seat Taken?**：用简单机制与迷人的叙事，把日常社交情境变成引人入胜的谜题——愉悦来自玩法本身，而非花哨特效。

**常见误读**："Delight = 更多动效/更多彩蛋。" 恰恰相反——**过度的愉悦是对用户注意力的掠夺**，会变成噪音。

---

## 4. 对照：经典三原则与新八原则的关系

Apple 历史上最经典的 HIG 三原则是 2013 年 iOS 7 时代由 Jony Ive 团队确立的：**Clarity（清晰）、Deference（遵从）、Depth（纵深）**。2026 年的八原则不是推翻它们，而是**扩展与再语境化**。

| 经典三原则 | 核心含义 | 在新八原则中的映射 |
| --- | --- | --- |
| Clarity 清晰 | 文字在任何尺寸都可读、图标精确、装饰克制 | → **Simplicity**（清晰直接）+ **Craft**（排印与图标细节） |
| Deference 遵从 | 界面让位于内容，"内容为王"，不抢戏 | → **Purpose**（聚焦最重要的事）+ **Simplicity**（去掉抢戏的元素） |
| Depth 纵深 | 用视觉层次、材质、真实动效传达层级 | → **Craft**（材质与动效）+ **Delight**（体验的丰盈感） |

### 4.1 新八原则的增量在哪里

经典三原则回答的是**"界面看起来/用起来应该怎样"**（表层），而新八原则回答的是**"设计者应该怀着怎样的价值观造物"**（深层）。具体增量：

- **Purpose / Responsibility** 是全新的价值观层——尤其 Responsibility 直面 AI 时代的产品责任，这是 2013 年不存在的话题。
- **Agency / Familiarity / Flexibility** 是把"用户中心"拆成了三个可操作的维度（控制感 / 心智模型 / 情境适配）。
- **Craft / Delight** 把"质量"与"情感"从隐性要求变成显性承诺。

一句话总结：**三原则是"作品标准"，八原则是"创作者伦理"**。前者教你如何把界面做好，后者教你如何把人当人。

---

## 5. 视觉层：从拟物到 Liquid Glass 的演进

### 5.1 三个时代

| 时代 | 时间段 | 代表 | 视觉特征 |
| --- | --- | --- | --- |
| 拟物 Skeuomorphism | 2007–2013 | iOS 1–6 | 皮革、木纹、金属质感，尽量模仿现实物体 |
| 扁平化 Flat / 层级 | 2013–2025 | iOS 7–18 | 去质感、强层级（Clarity/Deference/Depth） |
| Liquid Glass 液态玻璃 | 2025– | iOS 26 起 | 半透明、实时渲染、动态折射，"像活物一样"的界面 |

### 5.2 Liquid Glass 是什么

**Liquid Glass（液态玻璃）** 是 Apple 自 iOS 7 以来最大的一次软件设计变革，于 WWDC 2025（iOS 26 / macOS Tahoe 26 等）发布。它从 **visionOS 的空间计算**设计语言中汲取了深度与维度，让 2D 屏幕上的界面像真实玻璃一样：**反射并折射周围内容、随环境光智能变化、随运动产生高光**。

核心特征：

1. **自适应半透明（Adaptive Translucency）**：材质颜色由周围内容决定，亮环境下"发亮"、暗环境下"柔化"，始终保持可读。
2. **内容优先（Content-First）**：控件、工具栏、导航条成为浮在内容之上的一层"功能玻璃"，需要时出现、滚动时让位。
3. **硬件-软件和谐**：控件与窗口圆角与新一代硬件的圆角"完美同心"，消除软件与硬件的割裂感。
4. **跨平台统一**：首次让 iOS / iPadOS / macOS / watchOS / tvOS 共享同一套视觉哲学，同时保留各平台气质。

### 5.3 值得注意的张力

Liquid Glass 是 GPU 密集型效果，老硬件会降级；复杂背景上白字的对比度、阳光下的可读性都引发过讨论。Apple 的设计语言始终在**"美学克制"与"功能性"之间走钢丝**——这也是学习它时最值得体味的部分：没有免费的视觉，每一种材质都要为可用性买单。

---

## 6. 系统层：Apple 设计系统的基本构件

原则需要落成零件。Apple 设计语言在系统层的几个关键构件（学习 Web/跨平台设计时，可直接借鉴其思想，不必照搬数值）：

### 6.1 字体：SF Pro（San Francisco）

- 苹果自有字体族，分为 SF Pro（iOS/macOS 界面）、SF Pro Rounded、SF Mono（等宽，代码/时间）等。
- 核心思想：**"界面文字要像报纸正文一样经得起细看"**——所有字重、行距、字符间距都经过排印级调校。
- 对 Web 的启示：优先保证字体排印的**可读性与层级**，宁可少用字重也要把字距行高调准。

### 6.2 颜色：系统色 + 语义色

- 系统色（System Colors）随深浅模式自动切换：systemBlue、systemRed、systemGray 等。
- 语义色（Semantic Colors）：用"含义"而非"色相"命名——tintColor（主题色）、label（正文）、secondaryLabel（次要文字）、separator（分隔线）。界面深色/浅色/个性化主题切换时，颜色自动跟着语义走。
- 对 Web 的启示：用 **CSS 自定义属性（design tokens）** 表达语义色，而不是把十六进制色值散落在组件里。

### 6.3 材质（Materials）

- iOS 的工具栏、侧栏、小组件使用系统材质：ultraThin / thin / regular / thick / ultraThick，透明度从极薄到厚实，配合 blur（模糊）。
- 原则：**背景内容可见但不可喧宾夺主**，模糊保证前景可读，透明度保留空间语境。

### 6.4 动效（Motion）

- 系统动效遵循真实物理：**缓动曲线（easing）** 模拟加速/减速，弹跳只出现在"理应弹性"的交互（如下拉刷新）。
- 时长普遍短促（百毫秒级），强调"有因有果"的反馈，而非观赏性。
- 关键：**尊重 "Reduce Motion"（减弱动态）** 无障碍设置——设计必须为运动敏感用户提供降级路径。

### 6.5 圆角、间距与图标

- 圆角：从图标（圆角矩形）到卡片、按钮，圆角是"亲和力"与"硬件一致"的载体。
- 间距：以 8pt 为基准的节奏（8 / 16 / 24 / 32），保证呼吸感与视觉对齐。
- 图标：**SF Symbols** 是一套数千枚的统一图标库，用统一的视觉语言保证图标一致性，还支持粗细、彩色、层级变化。

### 6.6 一致性与无障碍是横切面

Apple 反复强调：无障碍不是附加功能，而是设计的基本面。VoiceOver、动态字体、辅助触控、键盘导航、对比度——这些不是"可选项"，而是 Craft 与 Flexibility 的具体表现。

---

## 7. 批判性视角：Apple 设计语言的争议与边界

深度学习一套设计语言，不能只看它的光环。以下是业界对 Apple 设计语言最常见的批评，理解它们能帮助你**借鉴而非盲从**：

### 7.1 同质化与"橱窗效应"

Apple 的极简美学高度统一，带来了辨识度，也带来可预测性。批评者认为：当所有 App 都套用同一套系统组件与排版，**产品的差异化被抹平**，只剩下内容差异。学习启示：统一是手段，不是目的；要给品牌留出表达空间。

### 7.2 控制欲与封闭性

Apple 的"一致性"依赖对生态的强控制（审核、限制侧载、封闭 API）。这种控制成就了体验下限，但也限制了创新自由度。对独立产品而言，**你要在"一致性"与"自由度"之间自己选择立场**，而不是默认 Apple 的答案。

### 7.3 视觉优先的代价

Liquid Glass 等效果带来惊艳视觉，但存在实测代价：GPU 开销、复杂背景可读性下降、低配设备降级。这提醒我们：**视觉语言的美丽不能以核心任务可用性为代价**，要在审美与性能之间做有依据的取舍。

### 7.4 原则之间的内在张力

Apple 自己承认八原则没有公式、会互相拉扯。例如：
- **Delight vs Simplicity**：加一个惊艳动画可能提升愉悦，却可能违背"消除摩擦"。
- **Agency vs Responsibility**：给用户完全自由，可能让缺乏经验的人做出有害选择。
- **Familiarity vs Innovation**：太熟悉 = 无聊，太创新 = 无法理解。

优秀的设计师不是消灭张力，而是**根据具体情境决定此刻哪条原则优先**。

---

## 8. 学习启示：把 Apple 原则转化为自查清单

把八原则翻译成可执行的设计审查问题，无论你在做 App、Web 还是其他数字产品，都可以用它做上线前的"设计体检"。

| 原则 | 自查问题（Design Review Question） |
| --- | --- |
| Purpose 目的 | 这个功能/元素存在的理由是什么？能一句话说清它对用户的价值吗？砍掉它用户会损失什么？ |
| Agency 能动性 | 用户能否按自己的节奏行动？他们随时知道"我在哪、发生了什么"吗？错误能否轻易撤销？ |
| Responsibility 责任 | 这个功能可能被怎样滥用？谁会受伤？我是否在最小化收集用户数据？AI 能力是否会伤害用户？ |
| Familiarity 熟悉感 | 我用了哪些用户已有的心智模型？看起来相同的东西行为一致吗？常用操作位置固定吗？ |
| Flexibility 灵活性 | 在不同设备/场景/能力下体验是否依然成立？字体放大、键盘导航、读屏可用吗？是否允许个性化？ |
| Simplicity 简洁 | 界面是否消除了摩擦而非只是"看起来少"？最重要的元素一眼可见吗？每个元素都赚到位置了吗？ |
| Craft 工艺 | 动画流畅吗？深色模式适配了吗？空态/错误态/加载态都打磨过吗？细节经得起放大看吗？ |
| Delight 愉悦 | 用户使用时应感到什么情绪？这个情绪在整个体验中被反复强化吗？有没有为了炫技而牺牲核心？ |

**补充一条元原则**：每次只改一个变量。Apple 的克制，本质上是一种**设计节奏**——一次只做一件对的事，做透，再进入下一件。

---

## 9. 参考来源

- [Design principles | Apple Developer Documentation](https://developer.apple.com/design/human-interface-guidelines/design-principles)
- [Principles of great design — WWDC26 Session](https://developer.apple.com/videos/play/wwdc2026/250/)
- [Principles of great design（WWDC 速览笔记）](https://wwdc-quick-look.swiftgg.team/en/articles/wwdc2026-250/)
- [Apple introduces a delightful and elegant new software design（Liquid Glass 官方发布）](https://images.apple.com/om/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Liquid Glass — Wikipedia](https://en.wikipedia.org/wiki/Liquid_Glass)
- [What is Liquid Glass – Apple's New Design Language](https://www.techlusive.in/news/what-is-apples-new-liquid-glass-ui-everything-you-need-to-know-about-the-translucent-real-time-interface-unveiled-at-wwdc-2025-how-ios-26-macos-26-and-ipados-26-are-getting-a-fluid-glas-1563441/)
- [Apple's Liquid Glass Eliminates Interface Chaos — Yanko Design](https://www.yankodesign.com/2025/09/15/apples-liquid-glass-eliminates-interface-chaos-without-clean-design-compromise/)
- [An Apple Inspiration — Cooper Hewitt, Smithsonian Design Museum（Braun/Dieter Rams 影响）](https://www.cooperhewitt.org/2013/09/24/an-apple-inspiration/)
- [Apple iOS App Design Guidelines（经典三原则参考）](https://www.bairesdev.com/blog/ios-design-guideline/)
- [We studied the 2026 Apple Design Award winners](https://become.team/blogs/we-studied-the-2026-apple-design-award-winners-heres-what-great-design-actually-looks-like)

---

*本文档为学习笔记，内容基于 Apple 官方文档与公开资料整理。Apple 设计原则与 HIG 内容版权归 Apple Inc. 所有；本文仅用于个人学习与设计研究。*
