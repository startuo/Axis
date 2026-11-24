---
title: 从 Agent Demo 到 Agent Platform — 六层工程能力深度拆解
published: 2026-11-13T00:00:00.000Z
updated: 2026-11-13T00:00:00.000Z
description: 这是 [企业级 Agent 架构 - LLM 只是能力组件而非系统](/posts/obsidian/enterprise-agent-architecture/) 的姊妹篇：上篇是宣言（LLM 只是能力组件），本篇是工程手册（六个能力层怎么做）。
tags:
  - agent-platform
  - orchestration
  - permission
  - memory
  - observability
  - evaluation
  - idempotency
  - durable-workflow
category: Agent 工程
lang: zh_CN
draft: false
---

## 30 秒答案

这是 [企业级 Agent 架构 - LLM 只是能力组件而非系统](/posts/obsidian/enterprise-agent-architecture/) 的姊妹篇：上篇是宣言（LLM 只是能力组件），本篇是工程手册（六个能力层怎么做）。

> 一个 Agent Demo 的核心是让模型**完成任务**；一个真正的 Agent Platform 必须解决的是任务执行过程中的**权限、状态、调度、记忆、可靠性、可观测性，以及出了问题之后如何恢复**。

六层逐一拆解，每层一个核心命题：

| 层 | 核心命题 |
|----|---------|
| Orchestration | 子 Agent 越多不等于越智能；不确定性在哪，Agent 才应该在哪 |
| 工具与权限 | MCP 解决接口标准化，不解决安全；自主决策 ≠ 无限授权 |
| Memory | 向量数据库 ≠ 长期记忆；四类记忆各有生命周期 |
| 长任务可靠性 | 不能因为上下文压缩、重启、API 超时丢掉已完成的工作 |
| Observability & Evaluation | 记不住「为什么」，就永远不知道「为什么成功/为什么失败」 |
| Gateway 与治理 | 几十个 Agent 出现后，统一治理从可选变成必需 |

**终局判断**：从 Agent Demo 到 Agent Platform，中间隔着的不是更多 Prompt，也不是更多子 Agent，而是一整套真正的软件工程能力。

---

## 一、Demo 与 Platform 的分界线

现在很多人做 AI Agent 还停留在：接一个大模型 + 配置几个 Tool + MCP 连外部服务 + 写一套 Prompt 让模型自主规划调用工具——就觉得自己做出了完整系统。

**能调用工具 ≠ 能稳定交付任务。** Demo 的验收标准是「它完成了这个任务」；Platform 的验收标准是「它在真实业务约束下，持续、可靠、可控地完成任务」。Demo 阶段的惊艳，在遇到任务中断、状态丢失、重复执行、权限冲突、API 限流和上下文污染后就会褪色——这些不是模型能力问题，是系统工程问题。

---

## 二、六层深度拆解

### 2.1 Orchestration：不确定性在哪，Agent 才应该在哪

真正的 Agent 在 **Plan → Act → Observe** 之间持续循环：根据工具返回结果重新判断下一步，必要时拆解任务给子 Agent，同时管理上下文、执行状态、重试和异常恢复。

**最大的误区：子 Agent 越多，系统越智能。** 实际上多个 Agent 同时工作带来的是：

- 上下文传递成本（每个 Agent 都要建立世界模型）
- 状态同步问题（谁改了哪个状态）
- 执行冲突（两个 Agent 改同一个文件/数据）
- 调度成本（等待、排队、死锁）

**决策原则：如果一个确定性的 Workflow 就能完成任务，完全没有必要引入 Agent。** 真正应该交给模型的，是**需要动态判断和不确定性处理的部分**——不是把所有步骤都包装成自主决策。

这与 [图工程实战 - 如何构建替代循环的代理系统](/posts/obsidian/graph-engineering-practice/) 的四题筛选完全一致：**「大多数任务不需要图」在编排层的表述就是「大多数步骤不需要 Agent」。**

### 2.2 工具与权限：MCP 解决发现，不解决安全

MCP 的价值 = 标准化接口发现和调用外部工具。但一个拥有 GitHub、数据库、文件系统和企业业务系统访问能力的 Agent，**没有权限边界时非常危险**。

真正的 Agent Platform 需要独立的 **Permission Engine**：

| 操作类型 | 权限要求 |
|---------|---------|
| 读数据 vs 改数据 | 不同权限级别 |
| 删除文件、执行命令、发邮件、改生产库 | 明确限制 + 人工审批 |

> Agent 可以拥有自主决策能力，但**自主决策不等于无限授权**。

这一层的完整答案在 [DeepSeek 超级代理设计 - 注意力经济学与领域模型](/posts/obsidian/deepseek-superagent-design/) 里：Gate（确定性准入）+ Mandate（不可变授权范围）+ 准入表。权限必须由代码路径强制执行，Prompt 里的「请先检查权限」只是祈祷。

### 2.3 Memory：向量数据库 ≠ 长期记忆

最常见的误解：接一个 Vector DB 就实现了长期记忆。实际上四类记忆**根本不是一回事**：

| 类型 | 解决的问题 | 生命周期 | 丢失的后果 |
|------|-----------|---------|-----------|
| **Session Memory** | 当前对话上下文 | 单会话 | 需重新解释 |
| **Task State** | 执行进度、工具结果、外部操作是否完成、失败从哪里恢复 | 任务期间 | 重复执行、重复扣费 |
| **Long-term Memory** | 跨会话的信息保留与检索 | 长期 | 重新学习 |
| **User Preferences** | 用户偏好 | 长期 | 体验退化 |

**Task State 是最容易被忽视的一类**——它不等同于任何「记忆」直觉，它其实是**工作流引擎的老问题**：Task Queue、Durable Workflow、Checkpoint、幂等设计。

### 2.4 长任务可靠性：数字人 Agent 的教训

案例：数字人 Agent 执行「口播稿生成 → 数字人视频生成 → 字幕处理 → 视频包装 → 文件上传 → 最终交付」，涉及多个外部 API，持续数分钟。

**关键问题**：如果执行到视频上传时失败，系统应该知道前面哪些步骤已完成——而不是重新生成一次数字人、重新扣一次 API 费用、把整个任务重跑一遍。

工程要点：

- **明确区分**：哪些操作可以安全重试（纯计算），哪些已产生外部副作用（生成视频 = 扣费）
- **幂等键**：同一任务的重复请求返回同一结果，而不是重复执行
- **任务状态**：持久化每一步的进度与产物引用
- **补偿机制**：无法回滚的副作用（扣费）通过状态记录避免二次触发

> 长时间运行的任务，不能因为模型上下文被压缩、服务重启或某个 API 超时，就把之前完成的工作全部丢掉。

### 2.5 Observability & Evaluation：从「发生了什么」到「为什么」

Agent 执行失败时，你至少应该能回答：它当时收到了什么任务、选了哪个模型、调了什么工具、工具返回了什么、为什么做下一步决策、失败发生在哪个环节。

没有完整的 Trace、日志、Token 成本记录和评测机制，你甚至无法区分：是模型推理错误、工具接口异常、权限不足，还是上下文管理问题。

**记录只是第一步**。[RSI 与自我提升记忆 - Harness 自修复的闭环](/posts/obsidian/rsi-self-improvement-memory/) 的教训：可观测性平台普遍止步于「发生了什么」，把「为什么坏、怎么修、如何不再坏」留给人工。真正成熟的做法是建立**可复现的评测与回归测试**：

- 每次改 Prompt、模型、工具接口或编排逻辑，都验证任务成功率、成本、延迟和失败类型是否变化
- 否则**系统越复杂，你越不知道它为什么成功，也不知道它为什么失败**
- 评测分三层：模型级（回答正确率）→ 任务级（端到端成功率）→ 业务级（业务状态是否一致）——后两者才是企业真正关心的

### 2.6 Gateway 与统一治理：从一到多的质变

只有一个 Agent 时，很多问题简单代码就能解决。当企业有几十个 Agent（销售、客服、内容、研发、数据分析）时，**统一治理从可选变成必需**：

- 统一身份认证（Identity & Auth）
- Agent Registry（哪些 Agent 存在、版本、状态）
- 模型路由（哪个任务用哪个模型）
- 工具注册（工具的发现与版本）
- 权限策略（策略版本化，谁在什么范围能做什么）
- 版本管理与审计（谁改了什么、当时为什么）

> Agent Platform 的价值不只是把多个 Agent 放到一起，而是提供一套**统一的执行和治理体系**——让不同 Agent 复用基础设施，在明确的权限和资源边界内完成任务。

[DeepSeek 超级代理设计 - 注意力经济学与领域模型](/posts/obsidian/deepseek-superagent-design/) 的领域模型（Source/Policy/Mandate/Ticket）本质上就是这一层的学术版规范：治理概念不随 Agent 数量增长而膨胀。

---

## 三、七问的正面回答

文章结尾的七个问题，用决策规则回答：

| 问题 | 决策规则 |
|------|---------|
| 什么时候用确定性 Workflow，什么时候用 Agent 动态规划？ | **不确定性分布原则**：步骤的分支数量 × 分支可预见性。分支少且可枚举 → Workflow；分支随环境动态变化 → Agent |
| 什么时候引入子 Agent？ | 图工程四题筛选：任务可分解为**独立子任务**且**上下文隔离收益 > 同步成本**时才拆 |
| 如何管理长任务？ | 持久化 Task State + Checkpoint + 幂等键；进程可死，状态不可丢 |
| 如何设计可恢复的执行状态？ | 每个副作用操作前先写状态；恢复 = 读状态 + 补偿未完成步骤 |
| 如何控制高风险工具调用？ | 按「爆炸半径 × 可逆性」分级：可逆且小 → 自动；不可逆或大 → 审批队列 |
| 如何评测 Agent 是否比上一版本更可靠？ | 三层评测 + 回归测试套件：从真实失败中生长，每次修复锁一个用例 |
| （隐含）这一切的起点是什么？ | **先建 Trace**。没有 Trace，失败不可复现，后面一切免谈 |

---

## 四、深度思考：三个补充判断

**Q1：为什么「子 Agent 越多越智能」是危险的？**
因为它把**计算量**当成了**智能**。子 Agent 的价值 = 上下文隔离带来的专注度提升（Anthropic 多智能体研究：+90.2%），代价 = 传递与同步成本。净值为正的条件很苛刻：子任务彼此独立、每个子任务上下文足够复杂、结果可以确定性汇合。大多数「多 Agent」演示里，拆出来的子任务既不独立也不复杂——拆分的收益为零，成本全付。**正确顺序是先做对，再拆开**：一个单 Agent 环都跑不稳的系统，拆成十个 Agent 只会坏得更难查。

**Q2：长任务可靠性本质上是老问题还是新问题？**
是老问题（工作流引擎、数据库事务、分布式系统已经研究了几十年），但**在 Agent 语境下被重新激活了**，因为 Agent 引入了新的不可靠源：模型输出不确定 → 步骤本身可能变（动态规划）→ 传统 Workflow 引擎假设的「固定 DAG」不成立。所以 Agent 时代的长任务可靠性 = 传统 Durable Workflow + 一层新东西：**状态要能被模型理解**（[图工程实战 - 如何构建替代循环的代理系统](/posts/obsidian/graph-engineering-practice/) 的 STATE.md 就是这个设计——状态文件同时是机器的恢复点和模型的上下文）。

**Q3：六层能力应该按什么顺序补？**
按「损失暴露速度」排序，而不是按流行度：

1. **Trace/Observability**（第一优先——没有它，其他层的错误都看不见）
2. **Task State + 幂等**（长任务一上生产就暴露）
3. **Permission Engine**（第一个高风险工具接入时暴露）
4. **Evaluation/回归测试**（第一次「改坏 Prompt 不知道」时暴露）
5. **Memory 分层**（跨会话体验退化时暴露）
6. **Gateway 统一治理**（Agent 数量超过一只手时暴露）

**单 Agent 阶段就全建 = 过度工程；等损失暴露了才建 = 已经付了学费。** 正确节奏是：在损失暴露的前一步建好。这就是 [企业级 Agent 架构 - LLM 只是能力组件而非系统](/posts/obsidian/enterprise-agent-architecture/) 里说的「按风险、规模和真实业务需求选择架构」的操作化。

---

## 五、与既有知识体系的连接

| 已有文章 | 连接点 |
|---------|--------|
| [企业级 Agent 架构 - LLM 只是能力组件而非系统](/posts/obsidian/enterprise-agent-architecture/) | 本篇 = 上篇的工程手册版；六层逐一展开 + 七问决策规则 |
| [DeepSeek 超级代理设计 - 注意力经济学与领域模型](/posts/obsidian/deepseek-superagent-design/) | 权限层（Gate/Mandate）与治理层（Source/Policy）的学术版答案 |
| [图工程实战 - 如何构建替代循环的代理系统](/posts/obsidian/graph-engineering-practice/) | 子 Agent 拆分的判据（四题筛选）；STATE = 可被模型理解的恢复点 |
| [RSI 与自我提升记忆 - Harness 自修复的闭环](/posts/obsidian/rsi-self-improvement-memory/) | Observability 的闭环终点：trace → 根因 → 修复 → 回归锁定 |
| [Claude 记忆架构 - 梦境整理与智能体记忆的组成部分](/posts/obsidian/claude-memory-architecture/) | 四类记忆中的 Long-term Memory 设计原则；「只记不可恢复的信息」 |
| [SuperPlane 工厂模式 - 大规模运行编码代理](/posts/obsidian/superplane-factory-pattern/) | 审批队列、幂等（trigger 两次只建一个 Ticket）、任务状态的产品化 |
| [Skill 自进化改造指南 - Agent 帮我进化，我只负责反馈](/posts/obsidian/skill-self-evolution-guide/) | Evaluation/回归测试 = 指南的「验证机制」层 |

## 六、一句话带走

> 模型决定了 Agent 的能力上限，而 **Orchestration、Runtime、Memory、Permission、Observability、Evaluation 决定了这些能力能不能真正转化成可交付的系统。** 从 Demo 到 Platform，隔着的是软件工程能力——不是更多 Prompt，也不是更多子 Agent。

---

原笔记来源：个人对 Agent 工程进阶的思考沉淀（[企业级 Agent 架构 - LLM 只是能力组件而非系统](/posts/obsidian/enterprise-agent-architecture/) 的姊妹篇，整理 + 补充）
