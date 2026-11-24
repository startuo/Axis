---
title: 图工程实战 — 如何构建替代循环的代理系统
published: 2026-10-22T00:00:00.000Z
updated: 2026-10-22T00:00:00.000Z
description: 循环中的单个 AI 代理可以规划、编码、测试、审查。但任务一旦复杂，它就卡壳：上下文窗口满了，推理退化，你又回到椅子上读每一个 diff。
tags:
  - graph-engineering
  - agent-graphs
  - ci-automation
  - multi-agent
  - gates
  - state-management
  - loop-engineering
  - workflow-engineering
category: Agent 工程
lang: zh_CN
draft: false
---

## 30 秒答案

循环中的单个 AI 代理可以规划、编码、测试、审查。但任务一旦复杂，它就卡壳：**上下文窗口满了，推理退化，你又回到椅子上读每一个 diff**。

2026 年发货更快的人不再给一个代理五个工作。他们把工作拆给专家——一个代理编码、一个审核、第三个检测——然后把这些代理接进一个**能路由工作、共享状态、验证输出、无需人工操作**的系统。

> 这个系统是一张图。**图工程（Graph Engineering）= 设计你的代理所处的组织结构。** 它是第四层：叠加在上下文工程、环路工程和 Harness 之上，不取代任何前一层。

三个原语：**节点**（一个专家代理一个任务）、**边**（路由规则）、**状态**（沿边流动的共享数据）。环是最小的图——所以图工程不能取代环路工程，它是正上方那一层。

本文 90% 是操作指南：从零构建一个 **CI 故障分诊图**——分类出问题的构建、路由到专业代理、修复能修的、升级不能修的。所有提示词已填写完毕，随时可复制。

---

## 一、四层模型：图工程站在哪

图工程是第四层。每一层叠加在上一层之上，**没有人能取代之前的任何一层**：

| 层 | 核心命题 | 代表 |
|---|---------|------|
| ① 上下文工程 | 上下文窗口就是编程表面 | Karpathy |
| ② 环路工程 | 循环自动化了上下文工程 | Cherny |
| ③ Harness | 模型之外的一切运行环境（Agent = Model + Harness） | — |
| ④ 图工程 | **当许多环路连接成一个系统时会发生什么？** | Steinberg |

判断顺序：先学会循环。当一个代理做五个任务成为瓶颈时，把任务拆分成一张图。

---

## 二、三个原语

**节点（Nodes）做功课。** 每个节点是一个专门的代理，拥有一个任务——规划者、程序员、审稿人、测试跑者。每个角色有**自己的上下文窗口、指令和工具**。看不见的，就无法破坏。

**边（Edges）在它们之间路由。** 边是决定节点结束后发生什么的规则：「如果分类器显示是 bug，就发送给修复者；如果写着 flake，就发给重试代理。」边可以是**无条件边**（总是接下来去这里）或**条件边**（先检查一个值，再选择路径）。

**状态（State）是沿边流动的物质。** 一个共享的数据对象，记录已完成的、失败的以及接下来会发生什么。每个节点读取所需的切片，完成工作，把输出写回状态，下一个节点接手。

> 环是最小的图：一个节点，边回到它自身。

---

## 三、四题筛选：什么时候才需要图

大多数任务不需要图。一个结构良好的单一环路承担了大部分实际工作。那些把图工程当流行词的人，有一点值得认真对待：**不必要的复杂性不是工程，是上方。**（它只是浮在上面的装饰。）

在构建任何东西之前，先回答四个问题。**任何一个回答「否」，就保持循环。**

| 问题 | CI 故障分诊的答案 |
|------|-----------------|
| 1. 任务是否**周期性重复**发生？ | ✅ 失败每晚都会重演 |
| 2. 任务是否包含**多种需要不同处理**的子类型？ | ✅ 缺失的环境 secret ≠ 真正的 bug |
| 3. 制造者与检查者是否**必须分离**？ | ✅ 写修复的代理不应该是批准修复的人 |
| 4. 单代理循环是否**已成为瓶颈**？ | ✅ 它错误分类了一半的失败，浪费 token 重试无法修复的问题 |

如果你一直在运行单代理循环修 CI，你不需要别人告诉你这四个答案——你自己知道。**如果你的循环有效，不要用图来破坏它。如果你的循环是瓶颈，图就是解决办法。**

---

## 四、动手前：先画组织结构图

大多数人的错误：在还不知道图应该长什么样之前就打开 Claude Code 开始构建代理——就像在还不知道程序做什么之前就写函数。

从纸上三个问题开始：

1. **最终输出是什么？** 要具体。「修好 CI」很弱。「所有测试通过，lint 干净，PR 开启并总结失败和更改」是图可以验证的目标
2. **哪些子任务是独立的？** 把它们并排画。env-secret 修复和 flaky-test 重试没有共享输入，可以并行；fixer 需要分类器的输出，就画箭头
3. **质量在哪里检查？** 图中每条路径在到达输出前都应**至少遇到一个门**。没有门就没有验证——你会遇到一些代理，它们都说自己的作品「看起来不错」

草图提示词（直接复制）：

```
I need to design an agent graph for CI failure triage.

FINAL OUTPUT:
For fixable failures: a draft PR with the fix,
  all tests passing, lint clean, summary of root cause.
For unfixable failures: a Slack message to #dev-alerts
  with classification, logs, and suggested next steps.

SUBTASKS:
1. Read the CI log and classify the failure type
   (env, flake, bug, dependency, infra)
2. For env failures: check if the secret exists in
   vault, add it or flag the gap
3. For flake failures: retry the test once. If it
   passes on retry, file a flaky-test issue. If not,
   reclassify as bug.
4. For bug failures: read the failing test, read the
   code it tests, draft a fix, run the suite.
5. For dependency failures: check which version broke,
   propose a rollback or pin, run the suite.
6. For infra failures (timeout, OOM, runner issue):
   escalate to humans. Do not attempt to fix.

QUESTIONS TO ANSWER:
- Which subtasks are independent?
- Where do results converge?
- Where is the verification gate?
- Which model should each node use?

Output a node-edge list. Do not build anything yet.
```

输出就是你的蓝图。纸上的 10 分钟，省去之后几小时的重新接线。

---

## 五、一个代理，一个动词。没有通才。

为什么通才不行：通才代理把**整个任务的完整上下文加载到一个窗口**。窗口被填满（复杂任务总是充满），推理就退化——模型开始失去对自己在做什么的判断，对话越长输出越差。

专家获得的是一个**仅含所需信息的窄上下文窗口**。它看到的更少，但看得很清楚。Anthropic 自己的多智能体研究证实了这一点：**把智能体分成具有孤立情境的专家，在内部研究基准上比单一智能体基线提升了 90.2%。**

每个节点三条规则：

1. **一个节点，一个动词。** 「分类。」「修理。」「复习。」「重试。」一个节点描述里有两个动词，就是两个节点。分类器负责分类，它不修复。修复者负责修复，它不评测自己的修复方案
2. **评估工具范围。** 审查节点不应有写文件的权限；修复节点不应有合并 PR 的权限。有范围的工具防止专家越出通道——这在图无人值守时尤为重要
3. **把模型与任务匹配。** 分类器要快，用便宜模型（低强度 Haiku 或 Sonnet）；修复者要读懂测试失败、理解代码、写针对性补丁，用高强度前沿模型。**循环给每个任务相同的模型，图把成本与难度匹配**

节点定义示例（`.claude/agents/classifier.md`）：

```
# CI Failure Classifier

You are a CI failure classifier.
Your only job: read a failing CI log and decide
what kind of failure it is.

CATEGORIES:
- env: missing secret, wrong env variable, infra
  not provisioned. Clue: "secret not found",
  "variable not set", "connection refused to vault"
- flake: test passed before, no code changed.
  Clue: intermittent timeout, race condition,
  network-dependent assertion
- bug: deterministic failure tied to a recent commit.
  Clue: assertion error in test, type error, logic
  failure that reproduces consistently
- dependency: failure appeared after a version bump.
  Clue: "module not found", breaking change in
  changelog, pinned version mismatch
- infra: runner-level issue. Timeout, OOM, disk full.
  Clue: "killed", "out of memory", "no space left"

OUTPUT: JSON with category, confidence (0-1),
  reasoning (one sentence), and the relevant
  log lines that led to the classification.

RULES:
- If confidence is below 0.7, flag for human review
- Never guess. If the log is ambiguous, say so.
- Do not attempt to fix anything. Only classify.
```

修复节点示例（`.claude/agents/bug-fixer.md`）：

```
# Bug Fixer

You are a bug fix agent.
Your only job: fix deterministic test failures
caused by recent code changes.

INPUT: the failing test name, the error message,
  and the git diff of the most recent commit.

PROCESS:
1. Read the failing test to understand what it expects
2. Read the code the test covers
3. Read the recent diff to find what changed
4. Write the smallest fix that makes the test pass
5. Run the test suite to verify

OUTPUT: the fix as a git diff, plus a one-paragraph
  explanation of root cause and what was changed.

RULES:
- Smallest fix wins. Do not refactor.
- Do not modify the test to make it pass.
- Do not touch files outside src/ and lib/
- If the fix requires changing more than 3 files,
  escalate instead of fixing.
```

注意这些界限：分类器**无法写文件**。修复者**不能修改测试**、**不能碰 src/ 和 lib/ 以外的文件**。这些限制不是建议，是**硬墙**。当图整夜运行时，这些墙正是你醒来看到干净 PR 而非混乱的原因。

---

## 六、边决定谁得到什么

边是连接节点的路由规则，决定三件事：**谁在什么条件下得到输出、哪些数据沿边传输**。

三种边（每个图至少用两种）：

| 边类型 | 行为 |
|--------|------|
| **无条件边** | 总是接下来去这里（fixer → gate） |
| **条件边** | 先检查一个值，再选择路径（分类器 → 对应专家） |
| **评估边** | 带回环的反馈：门批评 → 修复者迭代 → 回到门 |

> **关键的见解：硬性约束不应存在于提示词中。** 如果路由规则至关重要（「绝不要将与支付相关的失败发送给自动修复器」），它应该在**边逻辑**中强制执行，而非代理的指令中。提示是提示性的，边是确定性的。在一场长游戏的第 47 回合，提示可能会被忽略。**边就是代码，它不会忘记。**

路由逻辑提示词：

```
Here is the graph for CI failure triage.

NODES:
- Classifier (reads log, outputs category)
- Env Agent (handles missing secrets/vars)
- Flake Agent (retries, files flaky-test issue)
- Bug Fixer (reads test + code, drafts fix)
- Dep Agent (rollback or pin version)
- Escalator (sends Slack alert to humans)
- Test Gate (runs full test suite, lint)

EDGE RULES:
Classifier outputs category:
  env    -> Env Agent
  flake  -> Flake Agent
  bug    -> Bug Fixer
  dep    -> Dep Agent
  infra  -> Escalator (skip gate, alert humans)

All fix agents -> Test Gate
Test Gate pass -> open PR
Test Gate fail -> retry (max 3), then escalate

HARD CONSTRAINTS (enforce in code, not prompts):
- Never auto-fix files in src/auth/ or src/billing/
- Never modify CI config without human approval
- If classifier confidence < 0.7, escalate
```

---

## 七、状态：图在运行间写入的文件

状态是图的存储。没有它，每个节点从零开始，每次运行都忘记之前发生了什么。有了它，节点从上一个节点结束的地方接续，**明天的运行知道今天的运行已经尝试了什么**。

设计规则：**白名单，不广播。** 每个节点只接收它所需的状态片：分类器拿原始日志，修复者拿分类结果 + 失败测试名 + 最近的 diff——**不需要完整日志**。如果每个节点都读全部状态，那就没有图，你只有一个臃肿的上下文窗口外加一步。

一次完整运行后的状态文件：

```
# CI Triage State

## Last run
2026-08-04 03:30 UTC

## Current run
workflow: ci-main #4821
trigger: push to main by @david
status: completed

## Classification
category: bug
confidence: 0.94
reasoning: assertion error in test_checkout_flow,
  deterministic, tied to commit a3f7b2c

## Fix
diff: +2 lines in src/cart/checkout.ts
root_cause: price rounding used Math.floor
  instead of Math.round, off-by-one on
  totals ending in .5

## Gate
tests: 142/142 passing
lint: clean
verdict: pass

## Output
pr: #482 "fix: rounding in checkout total"
escalations: none

## Lessons learned
2026-08-04: checkout price tests are brittle
  around .5 boundaries. Added to watch list.
```

明天的运行会读这个文件：它知道哪些已经修复、哪些教训已经吸取、哪些在观察名单上。**图不每个周期都从零重新推导项目上下文。状态是把一次性连注变成复利系统的关键。**

> 图会忘记每次运行。状态文件不会。没有状态的图会重启；有状态的图有简历。

这与渐进式披露是同一条规律（见 [GPT-6 Astra 技能与提示重审 - 指令减法的艺术](/posts/obsidian/instruction-subtraction/)）：状态切片就是节点的「按需上下文」。

---

## 八、门：唯一决定「完成」或「未完成」的节点

没有门，图产生输出并称之为完成。有门，图产生输出，然后有客观的设备检查输出是否正确。**门是唯一说「完成/未完成」的节点——其他节点都只是干活，门负责审判。**

卡帕提法则在这里直接适用：**如果一个任务是可验证的，那么它就是可优化的。** 门就是你让任务可验证的地方。**如果你无法定义门，任务可能就不应该放在图中。**

三种门，从最强到最弱：

| 门 | 机制 | 强度 |
|----|------|------|
| **硬门** | 测试套件、类型检查器、linter、构建。通过或失败，没有意见、没有偏见 | 最强，能用就用 |
| **软门** | 第二个模型审查输出 | 总比没有好，但评审模型也有偏见和盲点——是硬门的**补充**，不是替代 |
| **人类门** | 合并、部署或任何不可逆操作前的人工审核 | 最终决定是人类 |

数据点：**赋予 Claude 有效的验证方法，通常能使最终输出质量提升 2-3 倍。** 仅凭这个数字，就足以说明绝不跳过门。

测试门节点示例：

```
You are the test gate for the CI triage graph.
Your only job: verify the fix is correct.

RUN THESE CHECKS IN ORDER:
1. Run the full test suite: bun test
2. Run the type checker: bun run typecheck
3. Run the linter: bun run lint
4. Verify only files in src/ and lib/ were modified
5. Verify no files in src/auth/ or src/billing/
   were touched (hard constraint)

OUTPUT:
verdict: "pass" or "fail"
tests: 142/142 passing (or which failed)
lint: clean (or list of issues)
scope_check: pass (or list of out-of-scope files)
suggestion: if fail, what to fix first on retry

RULES:
- Be strict. A false pass costs more than a false fail.
- Do not fix the code. Only verify.
- If all checks pass but something feels wrong,
  add a warning to the output. Don't block on it.
```

**门会腐烂。** 六个月前还算好的测试套件，可能捕捉不到今天的故障模式。定期选几个图认可的 PR，手动确认门确实捕捉到了它该捕捉的东西。如果没有，先更新测试，再运行图。

---

## 九、五种形状：每张图都由这些积木拼成

每个图都由五个可组合的模式拼成（Anthropic 工程指南记录，Cherny 围绕它们构建了 Claude Code 的工具）。它们自由组合：两个连锁、一个嵌套一个、三个并联。

| 模式 | 形状 | 用途 |
|------|------|------|
| **路由（Route）** | 分类器 → 分支 | 入口处按类型分发，最简单便宜的胜利 |
| **链（Chain）** | A → B → C | 顺序流水线 |
| **评估重试（Evaluate）** | 门 ⇄ 修复者（限次） | 反馈循环，带终止条件 |
| **并行（Parallel）** | 分支同时跑 → 汇合 | 无共享输入的子任务 |
| **编排器（Orchestrator）** | 规划者派活 → 收结果 | 动态分解任务 |

CI 分诊图用了三个：入口路由 + 路径内链（修复后验证）+ 重试评估（门批评、修复者迭代）。

> **大多数图里最便宜的结构性胜利是布线**：在入口放一个分类器，把简单任务发给廉价模型、困难任务发给前沿模型——**不影响输出质量，token 账单减半。**

作曲提示词：

```
Build the CI triage graph using these patterns:

PATTERNS USED:
1. Route at entry: classifier sends each failure
   type to the right specialist
2. Chain within each path: specialist fixes,
   then gate verifies
3. Evaluate on retry: if gate fails, fixer gets
   feedback and iterates (max 3 rounds)

COMPOSITION:
CI Log -> Route(Classifier)
  -> env:   Chain(Env Agent -> Gate)
  -> flake: Chain(Flake Agent -> Gate)
  -> bug:   Evaluate(Bug Fixer <-> Gate, max 3)
  -> dep:   Chain(Dep Agent -> Gate)
  -> infra: Escalate (skip gate)

Gate pass -> open PR
Gate fail after 3 rounds -> escalate
```

---

## 十、三级自治：/goal → /loop → 例程

图设计好了，节点建好了，边接好了，门设好了。现在运行它。**自治分三个层级，每级离循环更远。从一级开始，只在信任图之后晋升。**

### 一级：手动运行，目标开启

你只输入一次命令，图运行直到满足你设定的条件。另一个评估器模型检查完成度——**所以写修复的代理不是决定是否完成的人**。

```
/goal all tests pass and lint is clean

CI workflow ci-main #4821 just failed.
The log is at .github/logs/ci-main-4821.log

Run the CI triage graph:
1. Read the failing log
2. Classify the failure type
3. Route to the right specialist:
   env -> check secrets, add if missing
   flake -> retry once, file issue if flaky
   bug -> read test + code, draft smallest fix
   dep -> find breaking version, propose rollback
   infra -> skip fix, alert #dev-alerts on Slack
4. Run the test gate: bun test, typecheck, lint
5. If gate passes: open draft PR with summary
6. If gate fails: retry with gate feedback (max 3)
7. If still failing after 3: escalate to humans

Update STATE.md after each step.
```

第一次从头到尾看它跑。**仔细读每一个 diff。** 确认门确实捕捉到了你预期的目标。至少 5 次手动跑、真正信任之后，才升到二级。

### 二级：用 /loop 调度运行

图按某个节奏检查新的失败。**你不再是触发点。**

```
/loop every 30 minutes, check the CI dashboard.

If any workflow failed in the last 30 minutes:
1. Pull the failing log
2. Run the CI triage graph (same steps as above)
3. Open a draft PR for fixable issues
4. Escalate unfixable issues to #dev-alerts

If nothing failed, log "all green" to STATE.md
and wait for the next cycle.

Stop after 8 hours or when I say stop.
Update STATE.md after every cycle.
```

### 三级：晋升为例程（Routine）

/loop 在你关闭终端时停止。**例程运行在云端基础设施上——你的笔记本电脑可以关机。** 三种触发：调度（cron）、API 调用（webhook）、GitHub 事件（PR 打开、推送到 main）。

```
Run the CI triage graph as a Routine.

Trigger: GitHub webhook on workflow_run.completed
  where conclusion == "failure"
Schedule: also run at 6am daily as a sweep
  for any failures missed by the webhook

On each trigger:
1. Pull the failing log
2. Run the full triage graph
3. Update STATE.md
4. Open draft PR or escalate

Alerts:
- Ping #dev-alerts only for escalations
- Weekly summary every Monday 9am to #ci-health

Limits:
- Max 3 retries per failure
- Never touch src/auth/ or src/billing/
- If token spend exceeds $5 in one run, stop and alert
```

> **秩序很重要。** 先手动跑得可靠，看它运作，读 diff，相信大门；然后排程；然后晋升为例程。跳过步骤，是图在生产中**安静且昂贵**地失败的原因。

---

## 十一、无工具体验：粘贴即玩

不需要 Claude Code 或任何特殊工具，把下面这个提示词粘贴到任何大模型中，就能在单次对话里感受图的核心机制：

```
You will work as a graph of specialized agents.

TASK: review this code for bugs, security issues,
and style problems.

GRAPH:
You will simulate 3 specialist agents, one at a time.
Each agent sees only its own instructions and the code.
Each agent produces a typed report.

AGENT 1 - Bug Hunter:
Read the code. Find logic errors, edge cases,
off-by-one mistakes. Output a JSON list of findings
with file, line, severity, description.

AGENT 2 - Security Reviewer:
Read the code. Find hardcoded secrets, injection
vulnerabilities, missing input validation.
Output same JSON format.

AGENT 3 - Style Checker:
Read the code. Find naming inconsistencies,
dead code, missing error handling.
Output same JSON format.

GATE:
After all 3 agents finish, merge their findings.
Remove duplicates. Rank by severity.
Output a final report with:
- total findings by severity
- top 3 issues to fix first
- overall verdict: "ship", "fix first", or "rewrite"

RULES:
- Each agent works independently.
- No agent sees another agent's findings.
- The gate sees all findings but doesn't add its own.
- Be specific. File names, line numbers, examples.

CODE TO REVIEW:
[paste your code here]

Begin. Run each agent in order, then the gate.
```

这是单次对话里的一个图：三名专家、各自清晰指令、走向一个汇合门接受裁判。它的限制：你仍是触发者、没有持久状态、没有真并行。从这个玩具版跳到完全自主图，要补四个要素：**持久状态（STATE.md）、真实并行（子代理）、自动化（/loop、例程）、硬验证（测试套件代替模型意见）。**

---

## 十二、图所产生的债务（最难的一节）

随着图运转得越来越好，两个问题变得更加清晰——**不是更容易，是随着成功而扩大**。

### 理解债务（Understanding Debt）

每当图交付你没写的代码，理解债务就增加。流畅的图很安静，安静**感觉**像进步。但你仓库里存在的知识和你实际理解的内容之间的差距，会产生复利。当必须调试一个团队里没人读过的系统时，成本会超过所有 token 的花费。

### 认知放下（Cognitive Offload）

更微妙。当图自己运行时，很容易停止形成观点、接受任何结果。设计图本是用**判断力**来解决的；当你用它来**避免思考**时，它就变成了助燃剂。**动作相同，结果相反。** 两个工程师可以构建完全相同的图：一个人用它加速自己理解的工作，另一个人用它逃避理解工作。**图分不清两者的区别。**

### 缓解措施——没有一个是技术层面的

- **读 diff。每一个。** 不看图所显示的内容，你就是在以复利租借理解债务
- **抽查大门。** 挑几个图认可的 PR，手动验证测试是否真的捕捉到你关心的失败模式。门会腐烂
- **保持小型、机器可检查的任务。** CI 分诊、依赖降级、lint 修复、flaky 测试复现。一旦图触及架构决策、授权逻辑或任何「完成」需要判断的领域，理解债务就会加速
- **与队友一起设计图。** 另一双眼睛会发现图一旦运行起来会被利用的盲点

**深度思考**：理解债务的本质是「**验证权外包了，理解权不能外包**」。图替你验证（门）、替你执行（节点）、替你记忆（状态），但它永远不会替你承担「为什么」。这与 [与AI代理协作的方式 - 2026年10月十五条实践](/posts/obsidian/ai-agent-collaboration-practices/) 的「审查四问」互为表里：**你能在「图中箭头」层面理解它吗？** 一个月内改得动吗？答不上来，图就在悄悄变成负债。图的自动化边界，应该与爆炸半径矩阵对齐：小半径随便跑，大半径必须留人类门。

---

## 十三、与既有知识体系的连接

这篇是你代理工程知识线的**收口**：四层模型把之前分散的文章串成了完整阶梯。

| 已有文章 | 与本文的关系 |
|---------|-------------|
| [环路工程-卡帕西方法](/posts/obsidian/karpathy-loop/) | 第 ② 层：图的地基。先建环，再拆图 |
| [Claude Code 循环系统入门](/posts/obsidian/claude-code-loops/) | 环的选型；「大多数任务不需要图」的判据来源 |
| [Harness vs Loop vs Graph Engineering - 三层架构深度研究](/posts/obsidian/harness-loop-graph/) | 本文补齐了第 ① 层（上下文工程）和第 ④ 层（图工程）的完整版四层模型 |
| [Graph Engineering 14步路线图 - Claude Code 实战课程](/posts/obsidian/graph-roadmap/) | 同主题课程版；本文是**实战手册版**（全提示词、可复制） |
| [SuperPlane 工厂模式 - 大规模运行编码代理](/posts/obsidian/superplane-factory-pattern/) | **图工程的产品化形态**：画布 = 图、Verify = 门、loop 组件 = 评估边（maxIterations/untilExpression）、STATE = 运行历史。本文是你理解 SuperPlane 内部机制的钥匙 |
| [与AI代理协作的方式 - 2026年10月十五条实践](/posts/obsidian/ai-agent-collaboration-practices/) | 「证据」= 门、「审查高爆炸半径」= src/auth 硬墙、「让代理建迭代工具」= 评估边 |
| [GPT-6 Astra 技能与提示重审 - 指令减法的艺术](/posts/obsidian/instruction-subtraction/) | 状态白名单 = 渐进式披露；「一个代理一个动词」= 指令减法的节点级实践 |

**最后的判断，和这个领域每篇文章最终都会说的一样**：大多数开发者还不需要图——直到循环达到顶峰、任务必须拆分为并行子任务、制造者与检查者的分工需要**结构性**强制执行。如果你还没建过一个可运行的环，先去建一个。**没有工作环的图，只是有组织的复杂性。**

- 循环有效且任务简单 → 保留循环
- 循环是瓶颈 → 现在你知道如何构建图了

先从草图开始。建节点。接边。加门。手动运行。读 diff。慢慢相信它。然后让它继续运行。

---

原笔记来源：环路工程实践后的结论沉淀：从零构建 CI 故障分诊代理图（整理 + 扩展 + 深度分析）
