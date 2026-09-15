---
title: Claude Code 循环系统入门指南
published: 2026-07-08T00:00:00.000Z
updated: 2026-07-08T00:00:00.000Z
description: 一句话总结：不是所有任务都需要复杂循环。从最简单的方案开始，按需选择循环类型，用验证技能和明确停止条件管理质量和成本。
tags:
  - AI
  - Agent
  - Claude Code
  - Loop
  - 自动化
  - 系统设计
  - 学习笔记
category: Agent 工程
lang: zh_CN
draft: false
image: /images/obsidian/claude-code-loops.png
---

> **一句话总结**：不是所有任务都需要复杂循环。从最简单的方案开始，按需选择循环类型，用验证技能和明确停止条件管理质量和成本。

---

## 1 · 什么是循环

Claude Code 团队的定义：**Agent 重复工作周期，直到满足停止条件。**

循环按四个维度分类：
- 如何触发
- 如何停止
- 使用什么 Claude Code 原语
- 适合什么类型的任务

> 核心原则：**不是所有任务都需要复杂循环。从最简方案开始，选择性使用这些模式。**

---

## 2 · 四种循环类型

### 2.1 Turn-based Loop（基于回合的循环）

| 维度 | 内容 |
|------|------|
| **触发** | 用户 prompt |
| **停止** | Claude 判断任务完成或需要额外上下文 |
| **原语** | 普通 prompt + SKILL.md |
| **适用** | 不属于常规流程的短任务 |

**运作方式**：你发送的每个 prompt 都启动一个手动循环。Claude 收集上下文 -> 采取行动 -> 检查工作 -> 如需重复则重复 -> 响应。你手动检查结果，然后写下一条 prompt。

**优化方式**：把手动验证步骤编码为 `SKILL.md`，让 Claude 自己做更多端到端检查。检查越量化，Claude 自我验证越容易。

**Skill 示例**：

```markdown
---
name: verify-frontend-change
description: Verify any UI change end-to-end before declaring it done.
---

# Verifying frontend changes
Never report a UI change as complete based on a successful edit alone.
Verify it the way a human reviewer would:

1. Start the dev server and open the edited page in the browser.
2. Interact with the change directly. For a new control (button, input,
   toggle): click it, confirm the expected state change, and screenshot
   before/after.
3. Check the browser console: zero new errors or warnings.
4. Use the Chrome Devtools MCP, run a performance trace and audit
   Core Web Vitals.

If any step fails, fix the issue and rerun from step 1 - do not hand
back partially verified work.
```

**关键设计**：Skill 必须包含工具或连接器，让 Claude 能看到、测量或交互结果。量化检查优于定性判断。

---

### 2.2 Goal-based Loop（基于目标的循环 `/goal`）

| 维度 | 内容 |
|------|------|
| **触发** | 实时手动 prompt |
| **停止** | 目标达成 OR 达到最大回合数 |
| **原语** | `/goal` |
| **适用** | 有可验证退出条件的任务 |

**运作方式**：定义成功条件后，Claude 不需要自行判断"够好了"而提前退出。每次 Claude 尝试停止时，评估模型检查条件，未满足则送回继续工作。

**为什么确定性条件有效**：测试通过数量、Lighthouse 分数阈值等--Claude 不需要做主观判断。

**示例**：
```bash
/goal get the homepage Lighthouse score to 90 or above, stop after 5 tries.
```

**Token 管理**：设置明确的完成条件和显式回合上限（如"5 次后停"）。

---

### 2.3 Time-based Loop（基于时间的循环 `/loop` 和 `/schedule`）

| 维度 | 内容 |
|------|------|
| **触发** | 指定时间间隔 |
| **停止** | 你取消它，或工作完成（PR 合并、队列清空） |
| **原语** | `/loop`（本地）、`/schedule`（云端） |
| **适用** | 重复性工作，或与外部系统对接 |

**两种场景**：
1. **重复性任务**：任务不变，只有输入变。如每天早上总结 Slack 消息。
2. **外部系统对接**：检查间隔 + 对变化的反应。如 PR 可能收到 code review 或 CI 失败。

**`/loop` vs `/schedule`**：
- `/loop` 跑在你的电脑上，关机就停
- `/schedule` 把循环移到云端持续运行

**示例**：
```bash
/loop 5m check my PR, address review comments, and fix failing CI
```

**Token 管理**：设更长间隔，或基于事件反应而非固定时间。

---

### 2.4 Proactive Loop（主动循环）

| 维度 | 内容 |
|------|------|
| **触发** | 事件或计划，无实时人类参与 |
| **停止** | 每个任务达标即退出；routine 本身运行到你关闭 |
| **原语** | `/schedule` + `/goal` + skills + dynamic workflows + auto mode |
| **适用** | 重复性的、定义良好的工作流：bug 报告、issue 分类、迁移、依赖升级 |

**组合示例**：
```bash
/schedule every hour: check the project-feedback channel for bug reports.
/goal: don't stop until every report found this run is triaged,
actioned, and responded to. When fixing a bug, use a workflow to
explore three solutions in parallel worktrees and have a judge
adversarially review them.
```

**组件分工**：
- `/schedule`：定时检查新报告
- `/goal`：定义完成条件
- Skills：文档化验证方法
- Dynamic workflows：编排 agent 分类、修复、审查
- Auto mode：无需逐次确认权限

**Token 管理**：常规操作路由到更小更快的模型，判断决策用最强模型。

---

## 3 · 速查表

| 循环类型 | 你交出去的 | 适用场景 | 使用原语 |
|----------|-----------|---------|---------|
| Turn-based | 验证检查 | 探索或决策中 | 自定义验证 Skill |
| Goal-based | 停止条件 | 你知道"完成"长什么样 | `/goal` |
| Time-based | 触发器 | 工作按计划在项目外发生 | `/loop`、`/schedule` |
| Proactive | 整个 prompt | 工作重复且定义良好 | 以上全部 + dynamic workflows |

---

## 4 · 维护代码质量

循环输出的质量取决于围绕它的系统：

| 原则 | 做法 |
|------|------|
| **保持代码库干净** | Claude 跟随代码库中已有的模式和约定 |
| **给 Claude 自我验证的方式** | 用 Skill 编码"什么是好的" |
| **文档触手可及** | 框架和库的文档保持最新最佳实践 |
| **用第二个 agent 做代码审查** | 新鲜上下文的审查者偏见更少，不受主 agent 推理影响 |

> **关键**：当单个结果不达标时，不要只修这个问题，要把它编码进系统，改善未来所有迭代。

---

## 5 · 管理 Token 用量

| 策略 | 说明 |
|------|------|
| **选对原语和模型** | 小任务不需要多 agent 或循环；用更便宜更快的模型 |
| **定义明确的成功和停止条件** | 具体说"完成"长什么样，让 Claude 更快到达解（但不要太快） |
| **大规模运行前先试点** | Dynamic workflows 可能生成数百 agent；先在小切片上估算用量 |
| **确定性工作用脚本** | 跑脚本比推理便宜。PDF Skill 可以附带填表脚本，Claude 每次直接运行而非重新推导 |
| **不要比需要更频繁地运行** | 间隔匹配你观察的东西的变化频率 |
| **审查用量** | `/usage` 按技能/子代理/MCP 分解用量；`/goal`（无参数）显示回合数和 token 用量；`/workflows` 显示每个 agent 的 token 用量，可随时停止单个 agent |

---

## 6 · 如何开始

1. **看你已经在做的工作**
2. **找到一个你是瓶颈的任务**
3. **问自己能交出去哪一块**：
   - 能写出验证检查吗？
   - 目标足够清晰吗？
   - 工作是否按计划到达？
4. **运行循环，观察结果**--哪里卡住、哪里过度延伸
5. **不要怕迭代循环本身**

---

## 7 · 与现有体系的关联

### 循环类型与 Agentic OS 的对应

本文的四种循环类型在 [Agentic OS - Fable 5 构建者指南](/posts/obsidian/agentic-os/) 中有直接映射：

| Claude Code 循环 | Agentic OS 实现 |
|-----------------|----------------|
| Turn-based | 手动 `make tick`（L1 报告期） |
| Goal-based | `done_when` 谓词 + `/goal` 自动写入 standing goal |
| Time-based | cron 触发 `loop.sh` + `verify-goals.sh` |
| Proactive | `/schedule` + dynamic workflows + auto mode = 完整自治管道 |

### 与环路工程的对应

[环路工程-卡帕西方法](/posts/obsidian/karpathy-loop/) 的循环三要素在本文中体现为：

| 环路要素 | Claude Code 实现 |
|---------|-----------------|
| 验证器 (Verifier) | SKILL.md 中的量化检查 + `/goal` 的评估模型 + 第二个 agent 审查 |
| 状态 (State) | Claude 的上下文（回合内）+ 外部系统状态（时间循环轮询） |
| 停止条件 (Stop Condition) | 回合上限（`stop after 5 tries`）/ 目标达成 / 手动取消 |

### 三篇笔记的层次关系

```
环路工程-卡帕西方法        理论层：为什么要循环、循环三要素
        ↑
Claude Code 循环入门       工具层：Claude Code 提供的四种循环原语
        ↑
Agentic OS 构建者指南      系统层：用这些原语搭建完整自治系统的 8 个 BUILD
```

从理论到工具到系统，三篇笔记构成完整的知识链路。

---

## 8 · 行动清单

- [ ] 审查当前手动工作中哪些是瓶颈：验证检查 / 停止条件 / 触发器，能交出去哪块？
- [ ] 为高频任务编写验证 Skill（如 `verify-frontend-change`），包含量化检查
- [ ] 对有明确完成条件的任务，试用 `/goal` 并设回合上限
- [ ] 对重复性外部对接任务，试用 `/loop` 或 `/schedule`
- [ ] 大规模运行前先小切片试点，用 `/usage` 审查 token 消耗
- [ ] 确定性工作写成脚本而非让 agent 推理
- [ ] 当结果不达标时，编码进系统而非只修个案

---

原笔记来源：Getting started with loops - ClaudeDevs
