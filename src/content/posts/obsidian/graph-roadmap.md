---
title: Graph Engineering with Claude — 14 步从零到图架构师（完整课程）
published: 2026-08-01T00:00:00.000Z
updated: 2026-08-01T00:00:00.000Z
description: 这是一篇实操课程，不是理论文章。它用 14 步教你把单线程的线性 Agent 脚本重构成一张真正的图——能并行扇出、验证自己的发现、收敛到单个 Agent 装不下的结果。
tags:
  - graph-engineering
  - claude-code
  - workflow
  - multi-agent
  - parallel-execution
  - agent-architecture
  - orchestration
  - production-engineering
category: Agent 工程
lang: zh_CN
draft: false
image: /images/obsidian/graph-roadmap.png
---

## 30 秒答案

这是一篇**实操课程**，不是理论文章。它用 14 步教你把单线程的线性 Agent 脚本重构成一张真正的图——能并行扇出、验证自己的发现、收敛到单个 Agent 装不下的结果。

核心原语：**Claude Code 的 Workflow 系统**。Claude 写一段纯 JavaScript 编排脚本，然后 spawn 一支协同的 subagent 舰队去执行——编排本身消耗零模型 token，因为是代码，不是对话。

最重要的一个思维转变：

> 提示词是一句话。循环是一个周期。Harness 是 Agent 站的地板。
> 但**工作本身的形状**——什么在什么之前运行、什么可以同时运行、什么必须等所有东西完成——那个形状是**图**。
>
> 节点做思考。边传递结果。

---

## 一、课程骨架：14 步不是列表，是递进

这 14 步构成了一条从"会用 Agent"到"会设计图拓扑"的成长曲线：

```
阶段一：理解基本单元（01-04）
  节点、边、合约 → 建立图的"词汇"

阶段二：掌握核心拓扑（05-07）
  fan-out、fan-in、菱形 → 图的"语法"

阶段三：增加控制能力（08-11）
  条件路由、验证器、故障隔离、收敛循环 → 图的"修辞"

阶段四：优化与自动化（12-14）
  模型分层、拓扑成本、自路由 → 图的"风格"
```

---

## 二、阶段一：理解基本单元（01-04）

### 01. 节点是工作，边是流动

> 一张图只有两样东西，把它们搞对就能解决大部分困惑。

| 概念 | 定义 | 反模式 |
|---|---|---|
| **节点（Node）** | 一个工作单元——一个 Agent、一个有界任务、一个输入进一个输出出 | 把"然后顺便"当成节点 |
| **边（Edge）** | 一个依赖——这个节点的输出喂给那个节点的输入。仅此而已。 | 把"接着"当成边 |

**最关键的测试：**

> "总结这个文件，然后告诉我天气"——这两者之间没有边。天气不消费总结。
> 它们是两个独立节点，被线性脚本无意义地串了起来。
>
> 边只在**数据真正穿过它**时才存在。对你 Agent 中的每一个"然后"，问：下一步读上一步的输出吗？如果不读，就没有边，等待就是浪费的。

**画法：**

```
方框 = 一个 agent() 调用
箭头 = 一个变量，从一个调用的返回值传进另一个调用的 prompt
如果你画不出箭头——没有变量穿过——两个方框就是独立的
独立 = 你将在整个课程中利用的东西
```

### 02. 你的线性脚本是一张退化图

当你写"做 A，然后 B，然后 C，然后 D"，你画了一张图——一条不分叉的单链。每个节点恰好一条边进、一条边出。

它运行正确，但也运行得**又慢又脆弱**：

> 链没有冗余：如果 C 卡住了，D 永远不会发生，A 的工作被困在上游无处可去。

**图工程的第一个真正技能：重画这条链。**

把你线性 Agent 中的每一根箭头拿过来，问步骤 01 的问题。大多数链有两三根箭头不携带数据——它们只是你碰巧打字的顺序。剪掉那些箭头，链就坍缩成更宽的东西：几个独立节点可以**同时**运行，喂给一个需要它们全部结果的节点。

### 03. 给每个节点一个合约

> 你无法推理的节点，就是你无法并行化的节点。

修复方案是**合约**：有界输入、有界输出、恰好一个工作。

| 合约要素 | 要求 |
|---|---|
| **输入** | 节点读取什么——显式传入，绝不从共享窗口假设 |
| **输出** | 定义好的形状，理想情况下是验证过的——下一个节点可以消费而不需要猜测 |
| **职责** | 恰好一个工作，不多不少 |

**在 Workflow 中，合约通过 schema 强制执行：**

```javascript
// 有真正合约的节点：有界入，验证出，一个工作
const ITEM = {
  type: 'object', additionalProperties: false,
  properties: {
    title:   { type: 'string' },
    url:     { type: 'string' },
    impact:  { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['title', 'url', 'impact'],
};

const result = await agent(source.prompt, {
  label:  `research:${source.key}`,
  schema: ITEM,           // 强制验证的结构化输出
  agentType: 'general-purpose',
});
// result 现在是下一个节点可以信任的形状——不是自由文本
```

> 这是"可以接入图的节点"和"只有人类读输出才能工作的节点"之间的区别。

当你在 `agent()` 调用中传入 JSON Schema 时，subagent Claude 被强制返回验证过的结构化数据——验证发生在 tool-call 层，所以 Claude 在不匹配时**重试**，而不是给你一段需要自己解析和祈祷的自由文本。

### 04. 把边当作数据合约

> 一条边不只是"B 在 A 之后"。它是关于**什么穿过来的承诺**：A 产生这个形状，B 被构建来消费这个形状。

当你**用数据命名边**——而不是用顺序——两件事变简单了：
1. 你一眼就能看出边是否真实（数据真的在移动吗？）
2. 你可以在不破坏图的情况下**交换边两端的节点**，只要形状保持不变

**在实践中的边：纯 JavaScript，零 token**

```javascript
// 边：纯 JS，不需要 agent，零 token
const flat = collected.flatMap((c) => c.items);
log(`Collected ${flat.length} items`);
```

> 图思维最安静的胜利之一：人们烧模型 token 做的大部分事情实际上是一条边，而边是免费的。
>
> 诱惑是 spawn 一个 Agent 来"合并结果"。抵抗它。如果合并就是 flatten-and-dedupe，那是 `results.flatMap(...)` 和一个 `Set`——确定性、即时、零 token。
>
> **把 Agent 留给判断，而不是管道。** 一张每条边都是 Agent 的图，是一张为自己的布线付租金的图。

---

## 三、阶段二：核心拓扑（05-07）

### 05. 用 parallel() 扇出

> 这是为一切买单的那个动作。

| 场景 | 做法 |
|---|---|
| N 个独立节点——N 个来源要查、N 个文件要审、N 条路由要审计 | **不要串行。扇出，同时跑。** |

在 Workflow 中，`parallel()` 接收一个 thunk 数组，每个 thunk spawn 一个 subagent，全部并发执行，然后返回结果数组。

**两个让它健壮的细节：**

| 特性 | 行为 |
|---|---|
| **barrier** | `parallel()` 等待**每个** thunk 才返回，所以下一阶段看到完整集合 |
| **null-on-failure** | 一个 thunk 抛异常 resolve 为 `null` 而不是拒绝整批，所以一个脆弱的 Agent 不会沉掉整次运行 |
| **concurrency cap** | 并发上限约等于核心数，超出的排队——你可以传 100 个 thunk，它们全部会完成 |

```javascript
phase('Research');

// 九个来源，九个 Agent，全部同时
const raw = await parallel(
  SOURCES.map((s) => () =>
    agent(s.prompt, {
      label: `research:${s.key}`,
      phase: 'Research',
      schema: ITEM_SCHEMA,
      agentType: 'general-purpose',
    }),
  ),
);

const collected = raw.filter(Boolean);  // 丢弃失败 Agent 的 null
```

> 扇出活在 Claude 写的代码里，而不是模型对话里。Claude 自己的上下文从不持有九个来源——每个 subagent 携带自己的，只有最终答案返回。
>
> 这就是让 Claude 把 Workflow 扩展到几十几百个 subagent 而不淹死会话的东西。**编排层消耗零 token，因为它不是 Claude 思考的另一轮。**

### 06. 在 barrier 处扇入

> 扇出只在有东西收集它时才是有用的。扇入是边汇聚的节点——一个 Agent（或一段代码）看到所有上游结果，做需要完整集合的事情：跨来源去重、按影响排序、总数为零时提前退出。

**使用 barrier 的唯一正确理由：一个阶段真正需要每一个先前结果在一起。**

| 情况 | 用 barrier？ |
|---|---|
| 跨所有来源去重 | ✅ 正确 |
| 只是 flatten 一个列表 | ❌ 那是边，内联做 |
| "阶段感觉是分离的" | ❌ 不是理由 |

> 嗅探测试残酷而简单：如果你写了 parallel → transform → parallel，而中间那个 transform 没有跨项目依赖，你**应该用 pipeline 并完全跳过 barrier。**

### 07. 菱形：split → work → merge

> 把扇出和扇入放在一起，你得到了每个严肃 Agent 图的主力拓扑：**菱形**。

```
         ┌──────────┐
         │  Split   │  ← 一个节点分解工作
         └────┬─────┘
    ┌─────────┼─────────┐
    │         │         │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Worker 1│ │Worker 2│ │Worker 3│  ← 多个节点并行工作
└───┬───┘ └───┬───┘ └───┬───┘
    │         │         │
    └─────────┼─────────┘
         ┌────▼─────┐
         │  Merge   │  ← 一个节点合并
         └──────────┘
```

**标准形式有一个值得记住的名字：fan out → reduce → synthesize。**

| 阶段 | 做什么 | 用什么 |
|---|---|---|
| **Fan out** | 收集广度 | 多个 subagent 并行 |
| **Reduce** | 压缩 | 纯代码（flatMap、Set、filter） |
| **Synthesize** | 写出答案 | 最终一个 Agent |

> 一旦你看见了菱形，你就不再问"我怎么让 Agent 做更多步骤"，而是开始问"split 在哪，merge 在哪"——这才是真正能规模化的问题。

---

## 四、阶段三：增加控制能力（08-11）

### 08. 运行时用条件路由边

> 不是每张图都是固定的。有时走哪条边取决于节点发现了什么。

**路由器节点**检查结果，决定哪个下游路径触发：
- 分类工单 → 分支到正确的处理者
- 检查 diff 大小 → 小改快速审查，大改启动完整审计

在 Workflow 中，这就是 JavaScript 的 `if` 或 `switch`，作用在节点验证过的输出上——因为控制流活在代码里。

```javascript
// 路由器节点：Agent 做分类，代码选边
const { severity } = await agent(
  `Classify this diff's risk:\n${diff}`,
  { schema: { type: 'object',
      properties: { severity: { enum: ['low', 'high'] } },
      required: ['severity'] } },
);

if (severity === 'high') {
  // 重路径：完整并行审计
  review = await parallel(FILES.map((f) => () => agent(`Audit ${f}`)));
} else {
  // 轻路径：一次快速通过
  review = await agent(`Quick review of ${diff}`);
}
```

> 这就是确定性变成功能而非限制的地方。路由器的**决定**可以是 Claude 驱动的（subagent 做分类），但**路由本身**是 Claude 写的代码——所以相同的分类每次都走相同的路径。
>
> 你在节点处获得 Claude 的判断力，在边处获得脚本的可靠性。不会出现"Claude 决定跳过审计"的意外——因为跳过必须写进图里，而它不在那里。

### 09. 在边上放验证器

> 一张图真正的杠杆不是更多的 Agent——而是你可以围绕它们包裹的结构，用来产生**信心**。

**验证器节点**坐在边上，在结果被允许流向下游之前，它唯一的工作是**试图杀死这个发现**。如果它存活，通过。如果没有，永不抵达答案。

三种模式值得握在手里：

| 模式 | 做法 | 适用场景 |
|---|---|---|
| **对抗验证（Adversarial）** | 对每个发现 spawn N 个独立怀疑者，prompt 他们去反驳；只保留多数存活的 | 需要排除 plausible-but-wrong 的发现 |
| **视角多样验证（Perspective-diverse）** | 给每个验证者不同的透镜——正确性、安全性、可复现性——多样性捕获 N 个相同检查永远捕获不到的失败模式 | 失败模式分属不同维度 |
| **裁判团（Judge Panel）** | 从不同角度生成 N 个尝试，用并行裁判打分，从胜出者合成同时嫁接亚军最好的部分 | 解空间宽广，需要探索不同方向 |

### 10. 隔离节点，一个失败不能毒害整张图

> 在链中，失败级联——C 死了，D 永不运行，整件事停摆。
> 在图中，失败应该被**包含在它的节点内**。

**部分已经为真：** `parallel()` 内部抛异常的 thunk resolve 为 `null`，八个好 Agent 仍然返回，坏的那个只是 dropout。你的 `.filter(Boolean)` 就是那个容纳。

**关键设计原则：每个扇入都设计为容忍缺失输入，而不是假设完整集合。**

**更微妙的失败：节点互相踩踏。** 当 Agent 并行写文件时，它们可能碰撞。

修复方案是 `isolation: "worktree"`——每个 Agent 在自己的 git worktree 中运行，在沙箱中工作，干净合并。但**只在节点实际并行写文件时才用它**——它是需要它的那个拓扑的安全带，不是每次运行的默认税。

### 11. 加一个循环——但让它收敛

> 有时你在进入之前不知道工作有多大：未知规模的发现、一次 bug 扫荡找到一个会揭示三个。

这需要一个**循环**——一条受控的边回到更早的节点。

危险是显然的：**一个不收敛的循环是一个无限循环**，spawn Agent 直到预算烧光。

**收敛的模式：loop-until-dry。** 持续 spawn finder，直到连续 K 轮没有新东西浮出水面，然后停止。

**几乎所有人第一次都会犯的错误：你针对什么去重。**

> 针对**所有见过的**去重，而不是只针对已确认的。否则被拒绝的发现每轮都重新出现，循环永不干涸，你造了一台付费重新发现相同死胡同的机器。

```javascript
const seen = new Set(); const confirmed = []; let dry = 0;

while (dry < 2) {                       // 两轮空后停止
  const found = (await parallel(
    FINDERS.map((f) => () => agent(f.prompt, { schema: BUGS }))
  )).filter(Boolean).flatMap((r) => r.bugs);

  const fresh = found.filter((b) => !seen.has(key(b)));
  if (!fresh.length) { dry++; continue; } // 没有新的 → 向干涸推进
  dry = 0;
  fresh.forEach((b) => seen.add(key(b))); // 针对 SEEN 去重，不是 confirmed

  // 每个新鲜发现经过视角多样验证才计数
  const judged = await parallel(fresh.map((b) => () =>
    parallel(['correctness', 'security', 'repro'].map((lens) => () =>
      agent(`Judge "${b.desc}" via ${lens} — real?`, { schema: VERDICT })))
    .then((v) => ({ b, real: v.filter(Boolean).filter((x) => x.real).length >= 2 }))));

  confirmed.push(...judged.filter((v) => v.real).map((v) => v.b));
}
```

---

## 五、阶段四：优化与自动化（12-14）

### 12. 跨节点分层模型

> 不是每个节点都需要你最好的模型。

图让这件事变得显而易见，而单个 Agent 永远做不到：

| 节点类型 | 例子 | 用什么模型 |
|---|---|---|
| 有界重复 | 提取这个字段、分类这个工单 | 便宜模型 |
| 真正判断 | 合成报告、裁决发现 | 贵模型 |

**在 Workflow 中：** 每个 subagent 继承你的会话模型，除非脚本覆盖。在单个 `agent()` 调用上加 `model` 选项，把扇出的重复节点路由到更便宜的模型，保持 merge 节点在高端。

> 这是把一张吃 token 的图从昂贵变成经济、不改变其形状的杠杆。

### 13. 拓扑就是你的成本和延迟

> 图的形状不是装饰——它是墙上时间的最大杠杆。

**绊倒所有人的选择：`parallel()` vs `pipeline()`。**

| 原语 | 行为 | 墙钟时间 |
|---|---|---|
| `parallel()` barrier | 让一切等待最慢节点，然后下一阶段才开始 | 最慢节点的时间 |
| `pipeline()` | 每个项目独立流过所有阶段，没有 barrier——项目 A 可以在阶段 3 而项目 B 还在阶段 1 | 最慢单项目链的时间 |

**默认用 pipeline()。** 只在一个阶段真正需要每个先前结果在一起时才伸手拿 barrier。

> "代码更干净"和"阶段感觉是分离的"不是理由。barrier 延迟是真实的、可测量的、被浪费的时间。**分离不是同步的同义词。**

### 14. 让 Claude 画图——自路由

> 最后的动作：为你无法预先计划的工作，停止手动画图。

**三种入口：**

| 方式 | 怎么做 |
|---|---|
| **说"workflow"** | 在 prompt 中提到，Claude 为当前任务写一个编排脚本 |
| **运行已保存的** | `/deep-research` 就是生产中的真实图：scope → parallel search → fetch → adversarial verify → synthesize |
| **开启 ultracode** | Claude 为会话中每个实质性任务规划一个 workflow |

当一次运行效果好时，按 `s` 将其脚本保存到 `.claude/workflows/`——版本控制，按名可重新运行，任何 clone 仓库的人都能启动的图。

---

## 六、Workflow 原语速查表

这张表把 14 步中涉及的所有 Workflow 编程原语汇总在一起：

| 原语 | 类型 | 作用 | 零 token？ |
|---|---|---|---|
| `agent(prompt, opts)` | 节点 | spawn 一个 subagent，返回其输出 | ❌ subagent 消耗 token |
| `parallel(thunks)` | 扇出 | 并发执行所有 thunk，barrier 等待全部完成 | ✅ 编排层零 token |
| `pipeline(items, ...stages)` | 流水线 | 每个项目独立流过所有阶段，无 barrier | ✅ 编排层零 token |
| `phase(title)` | 分组 | 将后续 agent() 调用归入一个进度组 | ✅ |
| `log(message)` | 日志 | 向用户发出进度消息 | ✅ |
| `budget` | 预算 | `budget.total` / `budget.spent()` / `budget.remaining()` | ✅ |
| `schema` (on agent) | 合约 | 强制 subagent 返回验证过的结构化 JSON | ❌ 但消除重试成本 |
| `isolation: "worktree"` | 隔离 | 每个 Agent 在独立 git worktree 中运行 | ❌ 约 200-500ms 设置成本 |
| `model` (on agent) | 分层 | 为单个 agent() 调用覆盖模型 | ✅ 编排层零额外成本 |
| `workflow(name, args)` | 嵌套 | 在另一个 Workflow 中运行已保存的 Workflow | ✅ |
| `args` | 参数 | 传递给 Workflow 脚本的输入值 | ✅ |

---

## 七、六张本周就能构建的图

课程最后给出了六个实战模板：

| 图 | 拓扑 | 适用场景 |
|---|---|---|
| **安全扫描** | fan-out 每条路由 → verify → report | 审计每个路由文件的缺失认证 |
| **引用报告** | scope → parallel search → fetch → adversarial verify → synthesize | `/deep-research`，已在生产 |
| **逐文件移植模块** | fan-out 翻译 → 测试门禁 → 失败循环 → 对抗审查 | Bun 天花板，缩放到你的仓库 |
| **Diff 对抗审查** | 按 diff 大小路由 → 小改快速过 / 大改完整并行审计 → 裁判团合成 | 代码审查 |
| **定时生态扫描** | fan-out 多源 → barrier 排序 → 写摘要 | 保存一次，永远重复运行 |
| **未知规模发现** | parallel finders → dedupe vs seen → verify → loop-until-dry | 不知道有多少 bug 存在 |

---

## 八、与 Vault 已有知识的深度连接

### 8.1 与四个硬问题的关系

[四个硬问题研究](/posts/obsidian/graph-four-problems/) 提出了**问题**，本篇提供了**解方的代码实现**：

| 硬问题 | 本篇的对应步骤 |
|---|---|
| 节点配得上存在吗？ | Step 01-03：节点合约 + 边的数据测试 |
| 状态干净吗？ | Step 03-04：Schema 合约 + 数据边 + worktree 隔离 |
| 路由可信任吗？ | Step 08：条件路由——Agent 做判断，代码做路由 |
| Agent 互相点头吗？ | Step 09：对抗验证 + 视角多样验证 + 裁判团 |

### 8.2 与三层架构研究的关系

[Harness vs Loop vs Graph Engineering - 三层架构深度研究](/posts/obsidian/harness-loop-graph/) 讲了 LangGraph 和 GraphFlow 两个框架。本篇补充了**第三个实现路径——Claude Code Workflow**：

| 框架 | 定位 | 特色 |
|---|---|---|
| LangGraph | 低层编排基础设施 | 持久执行 + 状态 + Human-in-the-Loop |
| GraphFlow (AutoGen) | 有向图 Agent 执行 | 四种模式原生支持 |
| **Claude Code Workflow** | **纯代码编排 → Agent 舰队** | **编排层零 token，节点合约通过 JSON Schema 强制** |

### 8.3 与 Karpathy 环路的关系

[环路工程-卡帕西方法](/posts/obsidian/karpathy-loop/) 的三要素在图中有清晰映射：

| Karpathy 要素 | 在 Workflow 图中的实现 |
|---|---|
| **验证器（Verifier）** | Step 09：对抗验证 / 视角多样验证 / 裁判团 |
| **状态（State）** | Step 03-04：Schema 合约 + 数据边；Step 10：checkpoint |
| **停止条件（Stop Condition）** | Step 11：loop-until-dry（连续 K 轮无新发现）；Step 06：barrier 处的 early-exit |

### 8.4 与 Harness 四层体系的关系

[Harness工程学习总结](/posts/obsidian/harness-engineering/) 中 GSD 的 Wave 并行执行，在本篇中获得了**原生语言支持**——`parallel()` 和 `pipeline()` 就是 Wave 执行模式的代码实现。GSD 通过 subagent 上下文隔离来保护每个 Wave，Workflow 通过 `isolation: "worktree"` 实现同样的效果。

### 8.5 与 Skill 创建方法论的关系

[Codex Skill 工作流沉淀方法论 - 深度研究](/posts/obsidian/codex-skill-workflow/) 中"先做最小可用版本，用到什么再增加"的哲学，在 Workflow 中有完整体现——Step 14：先让 Claude 为当前任务写一个一次性的 workflow script，跑好了按 `s` 保存为可复用资产。**Workflow 本质上就是可执行的 Skill。**

---

## 九、一句话思维模型

> 提示词工程师问一个问题。图架构师画一张图。
>
> 线性 Agent 从来不是天花板——它只是第一个形状，每个人伸手去拿它，因为它匹配我们打字的方式。一行，一个头，一件事一次。
>
> 一旦你能看见节点和边，你就不再要求 Agent 做更多，而是开始要求**图**做得更宽：工作独立的地方扇出，信心重要的地方在边上加门禁，不需要判断的地方分层降级模型。
>
> 大多数人会继续把步骤排成一行。学会画图的人将运行一支舰队——并且永远注意不到其他人困在下面的天花板。

---

## 十、核心提炼：一张图总结 14 步

```
┌─────────────────────────────────────────────────────────────┐
│            GRAPH ENGINEERING WITH CLAUDE                    │
│                                                             │
│  阶段一：基本单元                 阶段二：核心拓扑            │
│  ┌──────────┐                   ┌──────────┐               │
│  │ 01 节点边 │                   │ 05 扇出   │               │
│  │ 02 退化图 │                   │ 06 扇入   │               │
│  │ 03 合约   │                   │ 07 菱形   │               │
│  │ 04 数据边 │                   └──────────┘               │
│  └──────────┘                                              │
│                                                             │
│  阶段三：控制能力                 阶段四：优化自动化          │
│  ┌──────────┐                   ┌──────────┐               │
│  │ 08 条件路由│                   │ 12 模型分层│              │
│  │ 09 验证器 │                   │ 13 拓扑成本│              │
│  │ 10 故障隔离│                   │ 14 自路由  │              │
│  │ 11 收敛循环│                   └──────────┘               │
│  └──────────┘                                              │
│                                                             │
│  核心公式：                                                  │
│  菱形 = fan-out(parallel) → reduce(code) → synthesize(agent)│
│  验证 = adversarial + perspective-diverse + judge-panel     │
│  收敛 = loop-until-dry + dedupe-vs-SEEN-not-confirmed       │
│                                                             │
│  三条铁律：                                                  │
│  1. 边是数据，不是"然后"                                    │
│  2. Agent 管判断，代码管管道                                │
│  3. 默认 pipeline()，只在需要完整集合时用 barrier            │
└─────────────────────────────────────────────────────────────┘
```

---

原笔记来源：Graph Engineering with Claude: 14-Step roadmap from 0 to graph architect (Full Course)，发表于 movez.substack.com
