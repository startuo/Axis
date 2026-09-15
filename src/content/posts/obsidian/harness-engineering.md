---
title: Agent Harness 工程学习总结
published: 2026-07-08T00:00:00.000Z
updated: 2026-07-08T00:00:00.000Z
description: 在深入四个 Harness 系统之前，我们必须先精确理解它们在解决什么问题。这不是"AI 不够聪明"的问题，而是工程约束的系统性缺失。
tags:
  - AI
  - Agent
  - Harness
  - Claude Code
  - 自动化
  - 学习笔记
category: Agent 工程
lang: zh_CN
draft: false
image: /images/obsidian/harness-engineering.png
---

## 一、问题起源：裸跑 Claude Code 的三类系统性故障

在深入四个 Harness 系统之前，我们必须先精确理解它们在解决什么问题。这不是"AI 不够聪明"的问题，而是工程约束的系统性缺失。

### 故障一：上下文腐烂（Context Rot）

当你让 Agent 重构一个模块，它改了 5 个文件后发现测试挂了，开始调试。调试过程中产生了大量临时代码、错误日志、废弃方案。这些内容会永久污染上下文窗口。到第 10 个文件时，Agent 已经分不清哪些是当前任务的目标状态，哪些是调试过程中的历史噪声。它开始把之前被否决的方案当成新指令重新执行——你看着它绕圈，但它自己不知道。

### 故障二：无强制流程（Missing Gates）

Claude Code 的 Plan Mode 是一个"建议"而非"门禁"。Agent 可以随时跳过 spec 编写、跳过测试、跳过 Code Review，直接冲向写代码。它不关心软件工程的最佳实践，只关心"用户的最后一句话让我干什么"。等你发现的时候，git diff 已经不可逆地爆炸了。

### 故障三：单一视角（Single Perspective）

你让 Agent 写代码，它就只从写代码的角度往前冲。没有人从产品价值角度问"这个功能到底有没有人用"，没有人从安全角度问"这个接口有没有做权限校验"，没有人从 QA 角问"边界条件覆盖了吗"。Agent 可以非常稳定地、高效地、极其自信地往一个错误的方向执行到底。

---

## 二、Harness Engineering：研究范式的演进

理解 Harness 的定位，需要看清 AI 工程研究的三个层次:

**Prompt Engineering（提示词工程）**
研究怎么问问题。核心问题是"什么样的输入能让模型输出我们想要的结果"。这是最早期的研究方向，现在的共识是: 提示词能做的事有限，它无法解决上下文管理和流程约束问题。

**Context Engineering（上下文工程）**
研究怎么给信息。核心问题是"在有限的上下文窗口内，应该放什么、不放什么、以什么顺序放"。GSD 是这个方向最典型的实践——通过上下文隔离和持久化 artifacts，让每个子任务只在干净的信息环境中执行。

**Harness Engineering（马具工程）**
研究怎么搭系统。核心问题是"除了大模型本身不研究，别的什么都研究"——包括流程门禁、角色协作、上下文路由、状态管理、错误恢复、多 Agent 编排。Harness 不研究怎么让模型更聪明，而是研究怎么让模型在工程约束下稳定输出。

Harness 这个词来自"马具"——套在马身上用来控制马的装备。大模型是一匹强大的马，不加约束就会脱缰。而这套控制系统的完整定义就是: **Harness = Agent - Model**。

---

## 三、四大 Harness 系统深度分析

### 3.1 Super Powers：纪律层

**核心贡献者**: Jesse Vincent (obra)，开源老兵，创建过 Request Tracker、K-9 Mail、Keyboardio

**核心洞察**: 规则可以被合理化绕过，门禁不能。Plan Mode 是"你最好按这个做"，Super Powers 是"你不按这个做就走不下去"。

**实现方式**: 7 个阶段，每个阶段对应一个 Markdown Skill，Agent 必须按顺序通过每个阶段的"硬门"才能进入下一阶段。不是建议，是强制。

**最值得学的设计**:

1. **铁律（Iron Law）**: 在测试之前写的代码必须被删除。这个规则极其激进，但效果显著——它从根源上消灭了"先写代码再补测试"的诱惑，因为你知道写了也没用。

2. **1% Rule**: 只要存在 1% 的可能性该 skill 适用，就必须调用它。这解决了 Agent 倾向于"我觉得不需要"的自我合理化倾向。

3. **为低水平执行者设计**: Jesse 的哲学是"为热情但缺乏判断力的初级工程师写 plan"。Plan 必须详细到连粗心的 subagent 都能正确执行。这本质上是承认了 AI Agent 在执行层面的不可靠性，并从系统层面解决了它。

4. **Empirical Skill Engineering**: 用 RED-GREEN-REFACTOR 的方法论来写 prompt——观察 Agent 在哪里失败，分析它用了什么借口跳过规则，然后改写 skill 堵住这个借口。这是一种"对抗性 prompt engineering"的实践。

**局限**: 本质仍然是 Markdown Skills + 提示词约束。如果上下文窗口太长或出现指令冲突，模型仍然可能跳过某个阶段。需要配合 GSD 的上下文隔离才能发挥最大效果。

### 3.2 GSD：上下文层

**核心贡献者**: TÂCHES (Lex Christopherson)，独立开发者

**核心洞察**: 上下文会腐烂，且腐烂是不可逆的。长任务的失败不是因为模型变笨了，而是因为上下文被污染了。

**实现方式**: 把长任务拆成多个原子阶段，每个阶段启动一个新的 subagent 带干净 200K token 上下文。执行结果写入持久化 artifacts (PROJECT.md / REQUIREMENTS.md / ROADMAP.md / STATE.md)，下一个阶段从 artifacts 读取需要的信息，而不是继承上一阶段被污染的上下文。

**最值得学的设计**:

1. **多 Agent 分职**: 不是"一个 Agent 干到底"，而是 Researcher、Planner、Executor、Verifier 各司其职。每个角色只处理自己职责范围内的上下文，不被其他角色的噪声干扰。

2. **Wave 并行执行**: 无依赖关系的任务在同一波中并行执行，有依赖关系的顺序推进。这是"又快又稳"的工程实践在 AI Agent 领域的直接翻译。

3. **原子提交 + 持久化状态**: 每个任务一个 git commit，所有状态写入文件系统。这解决了两个问题: (1) git bisect 可以精确定位问题，(2) 会话中断后可以从文件恢复而不是从零开始。

4. **v2 的进化**: 从纯 prompt 框架进化为独立 CLI 工具，拥有真正的 agent harness 控制能力——清除上下文、注入文件、管理 git 分支、检测死循环、追踪 token 成本。这是从"请求 LLM 做事"到"真正控制 Agent 行为"的质变。

**代价**: 拆任务、启动 subagent、写 artifacts 都产生额外 token 消耗。不是每个小需求都需要 GSD——它是给长任务买保险，保费不低。

### 3.3 G-Stack：角色层

**核心贡献者**: Garry Tan，Y Combinator CEO，Initialized Capital 联合创始人。这个人不是工程师出身，但恰恰因为他站在"产品-工程"交界处，他看到了 AI 编程最核心的盲区。

**核心洞察**: 大多数 AI 编程失败不是"写不出代码"，而是"非常稳定地往错误方向执行"。一个不做工程的 Agent 自己审查自己的代码，就像一个人既当运动员又当裁判——它总会判自己赢。

**实现方式**: 26+ 个专家角色，每个角色有独立的 prompt 和审查标准。Agent 不再是一个"全能助手"，而是一个可以按需召唤的"虚拟团队"。Conductor 编排器可以在隔离 worktree 中同时运行多个 Agent 会话。

**最值得学的设计**:

1. **Thin Harness, Fat Skills**: 维持一个极薄的核心系统（~200 行），所有能力通过可插拔的 skill 文件注入。这避免了系统自身膨胀吞噬上下文窗口——工具定义本身也消耗 token。

2. **对抗性审查**: CEO 角色的职责不是同意你的方案，而是挑战它。`/office-hours` 是 6 个强迫性问题，`/plan-ceo-review` 是战略范围审查。让"另一个自己"来挑自己的刺。

3. **视角分离**: 工程师审架构，QA 审质量，CSO 审安全。每个视角独立运行，互不污染。这是人类团队组织结构的数字化映射。

4. **Conductor 编排**: 10-15 Agent 并行，各自独立 worktree。这不是"并发执行同一个任务"，而是"不同角色同时做不同的事"——一个人在审 PR，一个人在做 QA，一个人在设计新功能。

**关键提醒**: 不要迷信全套 26 个角色。Garry Tan 的原话是"缺什么视角就拆哪个角色来用"。缺安全视角就用 CSO，缺产品思考就用 office-hours。全套上反而增加决策成本和 token 消耗。

### 3.4 Archon：编排层

**核心贡献者**: coleam00

**核心洞察**: AI 编程太自由了。当你可以用自然语言让 AI 做任何事的时候，每一次执行都是不同的。而工程的核心恰恰是"可重复性"——同样的输入产生同样的输出。Archon 用 YAML DAG 把 AI 的自由关进了工程纪律的笼子。

**实现方式**: 把工作流写成 YAML 文件，每个节点是 Prompt / Bash / Loop / 条件分支，节点之间有 `depends_on` 依赖关系。工作流文件提交到 `.archon/workflows/` 目录，版本控制，团队共享。

**最值得学的设计**:

1. **Prompt 和 Bash 混合节点**: 既不是纯 AI（不可靠），也不是纯脚本（不够灵活）。确定性操作（lint、test、git）用 Bash 节点，创造性操作（规划、生成、审查）用 Prompt 节点。

2. **fresh_context**: 循环节点的每次迭代启动新的 Claude 会话。这是一个把 GSD 的上下文隔离思想原生集成到工作流引擎的设计。

3. **交互式审批门**: `interactive: true` + `until: APPROVED`，在关键节点暂停等待人类确认。这把 Super Powers 的"硬门禁"思想从线性流程扩展到了 DAG 流程。

4. **工作流即代码**: YAML 文件提交到仓库，团队共享，版本控制。一个工作流写一次跑一百次，每次只改输入参数。这解决了"重复沟通成本"——你不能每次都重新向 AI 解释你的开发流程。

**代价**: 需要理解 DAG、git worktree、YAML 配置。安装维护有成本。模板质量和节点设计直接影响执行质量——垃圾工作流跑出来的还是垃圾。

---

## 四、四层体系的逻辑关系

这四个系统不是"同一条赛道的四个选手"——它们是同一个 Agent 系统里的四层答案:

```
Archon     (编排层)    YAML DAG    "流程标准化，跑一百次都一样"
  ↑
G-Stack    (角色层)    26+ 专家    "不同视角轮流拦，不让它往错误方向冲"
  ↑
GSD        (上下文层)  200K 隔离   "每个子任务干净上下文，长任务不腐烂"
  ↑
Super Powers (纪律层) 7 阶段门禁  "先想清楚再动手，测试先于代码"
```

**叠加逻辑**:

- Super Powers 是第一层: 先让 Agent 不乱来。这是成本最低、回滚最容易的选择。
- GSD 是第二层: 当任务开始跑长（1 小时以上），上下文的积累效应会让 Super Powers 的纪律也失效。GSD 管住上下文质量。
- G-Stack 是第三层: 当代码能写出来但方向总摇摆时，问题不在执行而在决策。G-Stack 补上多视角。
- Archon 是第四层: 当所有这些流程需要在团队中标准化、批量执行、可观察时，Archon 提供编排和可视化。

**顺序很重要**: 别第一天就追全家桶。每一层解决一个具体痛点，先确认痛点存在再装对应层。

---

## 五、关键心智模型

### 5.1 Harness = Agent - Model

这是一个定义性公式。它告诉我们: Harness 的工作不是让模型更聪明，而是在模型周围搭建一个工程系统。模型的能力是给定的（而且会持续进步），Harness 的能力是可以自己设计和迭代的。

### 5.2 Rule vs Gate vs Hook

Jesse Vincent 的三级分类:
- **Rule（规则）**: "你最好按这个做"。Agent 可以找借口跳过。
- **Gate（门禁）**: "不按这个做就走不下去"。Agent 无法跳过。
- **Hook（钩子）**: "到这个点自动触发这个动作"。Agent 不需要记得。

好的 Harness 用 Gate 和 Hook，少用 Rule。

### 5.3 Thin Harness, Fat Skills

Garry Tan 的核心设计原则: 保持核心系统极薄，把所有能力放在可插拔的 skill 文件中。反模式是"Fat Harness"——核心系统堆积了 40+ 工具定义，自身消耗大量上下文窗口。

### 5.4 上下文腐烂是不可逆的

一旦上下文被噪声污染，Agent 不会"自动清理"。它会带着这些噪声继续执行，产生更多噪声，形成正反馈循环。唯一的解法是隔离——给每个子任务一个干净的起点。

### 5.5 对抗性设计

AI Agent 天然倾向于: 跳过测试、避免冲突、合理化自己的选择、走阻力最小的路径。好的 Harness 必须对抗这些倾向——不是"信任它"，而是"假设它会找借口，然后堵住所有借口"。

---

## 六、实践建议

### 安装路线

```
Week 1: Super Powers -> 立纪律
  - 安装: Claude Code 内 /plugin install superpowers@claude-plugins-official
  - 场景: 所有日常开发任务
  - 验证: Agent 是否严格按 7 阶段执行

Week 2-3: GSD -> 管长任务
  - 安装: npx get-shit-done-cc@latest
  - 场景: 预计超过 1 小时的任务
  - 触发条件: 涉及 5+ 文件修改

Week 4: G-Stack -> 补视角
  - 安装: 30 秒自动安装脚本
  - 场景: 产品方向不确定、上线前审查
  - 选择: 缺什么视角装什么角色，不要全上

后续: Archon -> 规模化
  - 场景: 团队协作、批量重复任务
  - 前提: 已熟悉 git worktree 和 YAML
```

### 不要做的事

- 不要第一天装全套——先确认痛点
- 不要让 G-Stack 的 26 个角色全上——挑需要的
- 不要用 Archon 处理 30 分钟的小任务——杀鸡用牛刀
- 不要指望任何单一系统解决所有问题——它们是四层，不是四个替代品

---

## 七、核心结论

Harness Engineering 的底层逻辑是: **AI Agent 的能力上限不由模型决定，由围绕模型的工程系统决定。** 一个没有 Harness 的 Agent 就像一个没有刹车、没有方向盘、没有仪表盘的引擎——马力再大，你也只能看着它失控。

四个系统解决四个问题:
- Super Powers 解决"Agent 乱来"
- GSD 解决"跑长了质量崩塌"
- G-Stack 解决"方向偏了没人拦"
- Archon 解决"每次都要重新沟通流程"

四层叠加，不是四派互斥——这就是 Harness 体系的完整答案。

---

## 八、DeepSeek Harness Boost - 自增强执行层

在完成四层 Harness 体系的安装和理解后，进一步设计了一个整合层: **deepseek-harness-boost**。它不是一个独立的第五层，而是一个"调度器"——将四层 Harness 和已有的检查清单 (code-review-checklist / frontend-commit-checklist / spec-interview) 整合为单一自动触发协议。

### 为什么需要这一层

四层 Harness 各司其职，但它们不会自动配合。你需要在正确的时机激活正确的层、启动正确的 Agent、执行正确的检查清单。这一层就是那个"正确的时机"的决策引擎。

而且，这四个 Harness 系统都是针对 Claude 模型设计的——需要根据自己的特性做针对性调优。DeepSeek 的优势是推理更深、上下文更长，劣势是更容易在长任务中累积噪声、更容易过度自信。

### 核心设计

**任务复杂度自动分级 (L1-L5)**:
- L1 微调 (≤1 文件, ≤30 行): 仅 Super Powers 纪律
- L2 小改 (1-3 文件, ≤200 行): + code-review-checklist 自查
- L3 中改 (3-10 文件, ≤1000 行): + GSD + 双 Agent 并行审查
- L4 大改 (10+ 文件): + G-Stack + 三 Agent 审查 + frontend 检查
- L5 重构 (API 契约变更): + spec-interview 前置 + 四 Agent 审查

**Multi-Agent 分支时序**:
```
Phase 1: 设计先行  -> 明确目标 + 受影响文件 + 需求澄清
Phase 2: 并行执行  -> 主 Agent 写代码 + Agent A/B 同步审查设计
Phase 3: 交叉验证  -> 所有 Agent 对完整 diff 审查
Phase 4: 合并决策  -> Critical -> 修复 -> Important -> 评估 -> 确认
```

**自我审查五问**（每次交付前强制逐问作答）:
1. 如果是对手，怎么攻击这段代码？
2. 数据量翻 100 倍，哪里最先崩？
3. 新人最可能误解哪一行？
4. 网络在第三行断了，会发生什么？
5. 测试覆盖了哪些没写的场景？

### 这个设计的本质

deepseek-harness-boost 不是让 Agent 更聪明，而是让 Agent 更"自觉"——它知道自己容易在哪里犯错，所以在那些地方设置了强制检查点。它相当于把"一个有经验的工程师的自我审查习惯"编码成了一个自动触发的协议。

*补充时间: 2026-05-14*

---

## 关联

- **相关笔记**: 
  - [环路工程-卡帕西方法](/posts/obsidian/karpathy-loop/) - 循环与验证的设计哲学，与 Harness 的门禁思想互补
  - [Harness vs Loop vs Graph Engineering - 三层架构深度研究](/posts/obsidian/harness-loop-graph/) - Harness/Loop/Graph 三层架构的完整对比与诊断框架
  - [How to Build an AI That Never Stops Learning - 深度研究](/posts/obsidian/continuous-learning/) - Agent Skills 的自主发现流水线
- **相关 Skill**: context-engineering · incremental-implementation · test-driven-development
- **相关概念**: doubt-driven-development · code-review-and-quality

---

原笔记来源：Agent Harness 工程学习总结
