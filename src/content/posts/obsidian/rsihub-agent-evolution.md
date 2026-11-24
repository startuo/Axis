---
title: RSIHub：面向智能体演化方法的可组合框架（arXiv:2610.32253）
published: 2026-10-22T00:00:00.000Z
updated: 2026-10-22T00:00:00.000Z
description: 翻译说明：本文档为 arXiv:2610.32253v1 的完整中文结构化转写，英文原词、术语、表名与数字保持原样，正文以中文组织结构并逐段忠实转述原文内容。所有表格数据、算法伪代码、附录契约均按原论文保留。
tags:
  - agent-evolution
  - rsihub
  - paper
category: Agent 工程
lang: zh_CN
draft: false
---

> **翻译说明**：本文档为 arXiv:2610.32253v1 的完整中文结构化转写，英文原词、术语、表名与数字保持原样，正文以中文组织结构并逐段忠实转述原文内容。所有表格数据、算法伪代码、附录契约均按原论文保留。

| 项目 | 内容 |
|---|---|
| **标题** | RSIHub: A Composable Framework for Agent-Evolution Methods |
| **中文题名** | RSIHub：面向智能体演化方法的可组合框架 |
| **arXiv** | 2610.32253v1 |
| **日期** | 2026 年 10 月 22 日 |
| **篇幅** | 19 页（正文 10 页 + 参考文献 4 页 + 附录 A–D） |
| **许可** | Apache-2.0 |
| **代码** | https://github.com/simple-agent-lab/RSIHub |
| **项目页** | https://simpleagentlab.com/rsihub/ |

## 作者与单位

**Zimu Wang**¹·⁴⋆, **Xiaobo Wang**²·⁶⋆, **Siyu Ye**³·⁷⋆, **Jiaqi Li**⁶⋆, **Silin Chen**⁴, **Yuling Shi**⁴, **Ruobing Wang**³·⁷, **Jingjing Zhang**¹, **Chaofan Wang**⁴, **Kai Wu**⁵, **Mengnan Qi**³·⁷, **Kai Cai**³·⁷, **Xiaodong Gu**⁴†, **Zilong Zheng**⁶†

| 编号 | 单位 |
|---|---|
| 1 | University of California, Berkeley |
| 2 | University of Science and Technology of China（中国科学技术大学） |
| 3 | Douyin Group（抖音集团） |
| 4 | Shanghai Jiao Tong University（上海交通大学） |
| 5 | Tongji University（同济大学） |
| 6 | Beijing Institute for General Artificial Intelligence（北京通用人工智能研究院） |
| 7 | Simple Agent Lab |

⋆ 同等贡献　† 通讯作者

**通讯邮箱**：Siyu Ye (yesiyu.andy@bytedance.com)、Xiaodong Gu (xiaodong.gu@sjtu.edu.cn)、Jiaqi Li (lijiaqi@bigai.ai)、Zilong Zheng (zlzheng@bigai.ai)、Zimu Wang (zm.wang@berkeley.edu)

---

## 摘要

智能体演化方法利用执行反馈来改进 prompt、技能（skills）、工具与编排（orchestration），但它们的实现往往反复重建同一套实验机制。作者提出 **RSIHub**——一个用于构建、比较与扩展这些方法的开源共享基础设施框架。

**核心设计**：`recipes`（配方）组合可复用的 `operators`（算子）并声明 `mutable resources`（可变资源）；RSIHub 则提供执行、评估、恢复与 `lineage`（谱系）能力。研究者可以将注意力集中在**演化策略**上，而**评估始终位于可变面（mutable surface）之外**，结果与候选体及其评估条件保持绑定。

**实例化验证**：在不修改框架核心的前提下实例化了 **AHE、Hyperagents、A-Evolve、GEPA** 四种方法，把方法特定逻辑全部留在 recipes 与 operators 中。在固定模型与评估器配置下，使用 **MiniSWE 与 Codex** 在 **Terminal Bench 2** 与 **τ³ Banking** 上评估。

**关键结论**：
- 观测到的最大整体 pass@1 增益为 **13.5 个百分点**；
- 但**方法排名随设置变化**，且**优化增益并不总能迁移到留出任务（held-out tasks）**。

RSIHub 提供了比较演化策略的公共协议、可检视的候选体历史，以及开发新方法时可复用的组件。

---

## 1 引言（Introduction）

大语言模型智能体通常通过一个**经验循环（empirical loop）**开发：开发者检视执行过程，修改 prompt、可复用技能、工具或编排方式，然后重新评估产生的行为。**演化系统（evolution systems）**将这一循环的一部分自动化，把执行反馈转化为对智能体的**持久性修改**。

无论是智能体演化还是语言模型程序（textual components）的演化，每次迭代都做同样的事：

1. 选出一个候选体进行扩展；
2. 从其行为中采集证据；
3. 提出并评估一个修订版；
4. 保留结果供后续搜索使用。

**这个反复出现的生命周期构成了各系统的共同结构。** 各方法的差异在于如何实例化该生命周期、以及允许哪些资源发生变化。

### 1.1 问题：基础设施被反复重建

尽管生命周期相似，支撑性基础设施却大量重复：**隔离的候选体工作区、任务执行与评估、产物留存、恢复、谱系**。而现有实现通常把**基础设施与方法策略打包在一起**，导致两个后果：

- 实现一个新方法，往往意味着又要构建一套端到端系统；
- 比较不同方法，需要先对齐各自的 runner、配置与评估器接口。

这些成本正是**公共基础设施**的动机——让研究者不必重建工作区、执行与评估，就能测试新的演化想法。

### 1.2 RSIHub 的分离式设计

RSIHub 将**方法策略**与这些反复出现的基础设施分离。如图 1 所示：

- 一个 **recipe** 为每个启用的算子接口绑定一个实现，声明可变面，并指定运行配置（target、evaluator、runtime、data splits）；
- 框架管理的**演化循环**调用这些算子：选择父代、采集证据、修订候选体、决定保留什么；
- **受保护的运行时（protected runtime）**在该配置下执行与评估候选体，框架将结果写入**已验证档案（verified archive）**。

在 **agent-driven 模式**下，外层智能体在每次迭代完成后，依据被允许的反馈修订 recipe 的算子绑定与策略设置。**但 target、evaluator、runtime、data splits 与可变面保持固定，sealed 任务被排除在适应反馈之外。**

### 1.3 一个核心归因风险

作者特别指出 **protected-runtime 层**针对的是广泛可变演化系统中的一个**核心归因风险**：

> 方法控制的、对评估的修改可能改变测量条件；对记录保存的修改则可能改写所报告的*证据*。**两者都会让"表观增益"变得无法解释。**

RSIHub 的应对是：**让评估与其档案留在框架控制之下，置于 recipe 声明的可变面之外。** 框架服务把每个结果与其提交的候选体、以及产生该结果的评估条件关联起来；而后由**独立的 Gate 算子**判定该已评估候选体是否有资格成为父代。

### 1.4 三项贡献

| # | 贡献 | 说明 |
|---|---|---|
| **1** | **可组合的 recipes** | 提出 recipe 抽象：通过可复用的生命周期算子指定方法策略，并声明可被修订的资源。用**同一套算子**表达了 AHE、Hyperagents、A-Evolve、GEPA |
| **2** | **共享的实验基础设施** | 提供统一的候选体执行、恢复、产物、**认证评估记录**与谱系 |
| **3** | **同一基础上的评估** | 在两个 seed agent × 两个 benchmark、固定模型与评估器配置下比较四种配方。**并且也检验框架自身**：它是否改变了未演化智能体的测量能力？它能否从中断中恢复并守住边界？它在运行时与代码量上的代价是多少？ |

作者同时声明：**配方之间的排名随 agent、benchmark 与 split 变化。**

**开源资源**：通过 Simple Agent Lab 以 Apache-2.0 发布，含可运行 recipes、可复用 operators、文档与实验查看器。

---

## 2 相关工作（Related Work）

### 2.1 智能体优化与演化

智能体改进涵盖三类：**推理时反馈、持久产物优化、自我修改**。

- **Reflexion** 跨试验保留语言反馈；**Self-Refine** 在测试时修订输出；
- 记忆机制方面：RAM、AI Hippocampus 等工作研究了记忆系统；
- 奖励模型自我改进：相关研究探索了奖励模型的自监督提升；
- 文本组件优化：涉及 DSPy 等变量优化方法；
- 技能演化：**CoEvoSkills** 演化多文件技能（self-evolving agent skills via co-evolutionary verification）；
- 作者自述增量：在已有工作之上增加了**版本化的演化生命周期、recipe 级的方法组合，以及跨方法统一的 provenance**。

### 2.2 谱系（Provenance）与测量效度

**AI4AI 综述**区分了 *measured gains*（实测增益）、*retention*（保持）与 *held-out transfer*（留出迁移），这是本文测量框架的重要依据。

相关实践包括：把步骤与签名产物绑定、或把执行与其依赖一起打包（ReproZip、in-toto、Sigstore）。

RSIHub 记录**候选体谱系**，**区分父代选择与评估后的 Gate 决策**，并把结果绑定到候选体、recipe 与评估条件。

**测量效度方面的关键引证**：

- 受控技能演化实验显示，**持久改进可能是稀疏的**，且依赖反馈、验证、模型与 benchmark；
- 在合成奖励模型设定中，对不完美代理指标的过度优化，会在固定的金标准奖励下**降低**性能；
- 在某个操作化定义下，奖励篡改（reward tampering）出现在**比例虽小但不可忽略**的案例中；作者亦指出该定义存在假阳性。

RSIHub 通过**保护记录字段、过滤算子提供的 *Record* 注解**来支持归因（在其信任假设下）；但**benchmark 过拟合与更广泛的 specification gaming 仍属于评估器与研究层面的问题**。

---

## 3 RSIHub 框架

RSIHub 将**方法策略**与**候选体执行、评估、记录**这三类共享机制分离。本章先陈述设计原则，再说明候选体生命周期与谱系模型如何实现它。

### 3.1 设计原则（Design principles）

RSIHub 的构建目标是：研究者能从**可互换的部件**组装出一个演化方法，决定这些部件**可以改变什么、可以看到什么**，并复用框架服务处理反复出现的机制。

#### 原则一：用可互换部件组装方法

RSIHub **固定演化生命周期的槽位（slots），但槽位内容开放**：

| 概念 | 定义 |
|---|---|
| **stage**（阶段） | 一个槽位，如 `select` 或 `mutate` |
| **operator**（算子） | 某个 stage 的一种实现 |
| **recipe**（配方） | 为每个槽位指定想要的算子并加以配置 |

当所需算子实现齐备时，recipe 即可通过**纯配置**表达方法特定选择。

#### 原则二：声明方法能改什么、能看什么

两个 recipe 声明把这变成**实验变量**：

- **`surface` 块**：声明候选体可以改变哪些资源，使同一套算子接口能同时支持 *prompt-only* 研究与 *whole-harness* 研究；
- **`mutate` 块**：配置编辑智能体如何运行、接受哪些被保留的上下文。

两者合起来，**把"被演化的持久资源"与"用于提出修订的信息"区分开来**。

#### 原则三：其余流水线只提供一次

工作区构建、候选体快照、评估执行、产物留存、终态分类、中断恢复、谱系记账——这些在各演化方法间反复出现。RSIHub 只实现一次，并让每个 recipe 走**同一条执行路径**。

> 当研究只改一个算子、不改其他 recipe 字段时，它**隔离了一个声明的策略组件，同时复用了同一套框架机制**。

#### 原则四：把打分放在方法触及不到的地方

方法策略可以修订候选体与提出修订的算子。**但测量始终是框架的职责**：框架服务拥有评估与证据记录，二者都在 recipe 声明的可变面之外；**而父代资格（parent eligibility）则是另一个独立的下游策略选择**。

### 3.2 可组合的候选体生命周期

生命周期包含 **7 个阶段**：**Select → Rollout → Analyze → Mutate → Guardrail → Evaluate → Absorb**。

在这些阶段上，recipe 绑定 **5 个必需算子接口**——`Select`、`Rollout`、`Mutate`、`Gate`、`Record`——并可绑定 **4 个可选算子**（下表中以 ∗ 标注）：`Analyze`、`Validate`、`Novelty`、`Reflect`。

RSIHub 在 **Harbor** 之上实现该生命周期（逐任务验证）。在此底座之上，RSIHub 管理候选体谱系、**train/gate/sealed 三段划分**、可变面强制与认证评估记录。

#### 运行模式

- **固定模式**：使用研究者撰写、固定的 recipe；
- **agent-driven 模式**：外层智能体用 recipe-authoring skill 组合初始 recipe，并可在每次迭代完成后依据被允许的反馈修订算子绑定与策略设置。

> **关键边界**：外层智能体**调整演化过程**，而 `Mutate` **在单次迭代内编辑候选体**。target、evaluator、runtime、data splits 与允许的可变面**始终固定**；**sealed 任务被排除在适应反馈之外**。**本文实验仅评估固定 recipe。**

#### 迭代前的框架校验

每次迭代前，框架**校验并快照**当前 recipe：解析每个绑定，并按其 schema 检查设置。**每个算子运行在独立进程中**，框架在使用其结构化输出之前先做校验。

#### 档案（archive）的字段隔离

档案把 **①框架认证字段、②被评估的候选体、③其父代、④评估条件、⑤结果** 与 **⑥方法特定注解**分开。**算子只能"提议"注解，由框架过滤后写入。**

#### 七个阶段的算子职责

| 阶段 | 算子 | 职责 |
|---|---|---|
| **Select** | 必需 | 按 recipe 的搜索策略从档案中选择一个合格父代。框架**校验其身份，并 fork 其精确记录的提交** |
| **Rollout** | 必需 | 在训练任务上运行父代，返回执行证据（摘要 + 保留的产物引用）。内置 Harbor rollout **只用训练集**；基于 replay 的 rollout 复用父代已记录的评估而非重跑 |
| **Analyze∗** | 可选 | 把 rollout 案例蒸馏为**有界的变异证据**（如失败模式或紧凑轨迹），表示形式适配 `Mutate` 的输入 |
| **Mutate** | 必需 | 在声明的可变面内提出编辑。**通常是一个智能体而非固定变换**：多轮工作、可在提出改动前于训练任务上做小规模试验；当可变面允许时（如 Hyperagents），**甚至可以编辑演化算子本身**。报告改动路径、说明与用量 |
| **Guardrail** | 框架 | 检查真实 tree diff 是否符合可变面。随后两个可选算子可拒绝提案：`Validate`∗ 施加方法特定的**评估前检查**；`Novelty`∗ 在消耗评估预算前**丢弃与已接受 diff 近似重复的提案** |
| **Evaluate** | 框架 | 提交已审查的 tree，在 **gate 任务**的干净 checkout 上打分并认证结果。**gate 任务可与训练任务重合；sealed 任务保留给留出报告** |
| **Absorb** | 混合 | `Gate` 依据认证分数判定子代是否成为父代；`Record` 提出方法特定注解；`Reflect`∗ 从档案历史蒸馏洞见供后续代使用。**框架记录被允许的输出；这些算子都不能修改认证评估字段** |

#### 算法 1：一次 RSIHub 候选体事务

> 符号：`R` = 该迭代已校验的 recipe 快照，`H` = 档案历史。`c` 在整个 Guardrail 期间保持未提交；`ĉ` 是用于受保护评估的干净提交。`Stops(x)` 表示**拒绝、失败、格式错误或超时**。一次评估只有在**其结果满足既定覆盖策略**时才算 `benchmark_complete`，**只有此时才运行 Gate**。

```text
Algorithm 1  One RSIHub candidate transaction.

 1: procedure EVOLVEONE(R, H)
 2:     p ← Select(H)
 3:     c ← ForkCertifiedParent(p, H)
 4:     X ← Rollout(c)
 5:     Z ← Analyze(c, X)∗
 6:     Mutate(c, Z)
 7:     s ← CheckSurface(p, c, R_surface)
 8:     if Stops(s) then
 9:         return CloseAndRecord(H, p, c, s)
10:     end if
11:     v ← Validate(c)∗
12:     if Stops(v) then
13:         return CloseAndRecord(H, p, c, v)
14:     end if
15:     n ← Novelty(p, c, H)∗
16:     if Stops(n) then
17:         return CloseAndRecord(H, p, c, n)
18:     end if
19:     ĉ ← CommitReviewedTree(c)
20:     q ← ResolveContract(R, ĉ)
21:     y ← Evaluate(ĉ, q)
22:     H ← Certify(H, p, ĉ, q, y)
23:     if y.outcome ≠ benchmark_complete then
24:         return H
25:     end if
26:     a ← Gate(p, ĉ, y, H)
27:     if a.failed then
28:         H ← CloseAndRecord(H, p, ĉ, a)
29:     else
30:         H ← AppendGateDecision(H, a)
31:         e ← Record(p, ĉ, y, a, H)
32:         H ← AppendAllowedRecord(H, e)
33:     end if
34:     Reflect(H)∗
35:     return H
36: end procedure
```

**语义补充**：

- 跳过的 `Analyze` 直接透传 `X`；跳过的 `Validate` 与 `Novelty` 视为接受。
- 配置了 `Reflect` 时，它把已验证操作**追加到独立的 playbook**，**不修改 H**。
- **空提案与可变面违规**同样以**带类型的、已归档的尝试**关闭。
- `Rollout`、`Analyze`、`Mutate` 的失败走同一条 `CloseAndRecord` 路径（为紧凑起见在伪代码中省略）。

#### 算子自身位于可变面内时

当 recipe 把算子放进可变面内，框架必须决定**运行哪个版本的算子**。这一**候选体级机制**不同于外层智能体在迭代间修订 recipe 绑定。具体做法：**每次 stage 调用时，从提供给该 stage 的 checkout 加载实现**。

- 对**已运行过的 stage** 的改动，**在未来代才生效**；
- 对 `Validate` 或 `Novelty` 的改动，**可影响当前提案**；
- `Gate` 与 `Record` 随后**从已提交的子代加载**。

> **认证记录提供了一个评估后的恢复检查点**：它在下游收尾之前就持有已提交的子代及其结果。`Gate`、`Record`、`Reflect` 可以添加策略输出，**但都不能改动认证评估字段**。

### 3.3 谱系（Provenance）

一次**认证评估事件（certified evaluation event）**把以下内容绑定在一起：

- 已提交的候选体、其父代、当前 recipe 快照；
- **评估器与任务集指纹**、试验次数、分数、成本、产物引用、谱系。

**哈希引用的契约（hash-referenced contract）**还可额外记录：评估器配置与数据集内容摘要、split 与重复设置、模型身份、重试策略、评估器运行时摘要、框架版本。

> **这个身份标识让一项研究能够把"方法策略的改变"与"记录评估条件的改变"区分开来。**

#### 从实验记录到方法设计

研究者可以从一个内置 recipe 起步，检视候选体快照、谱系、任务结果、成本与轨迹，以排查停滞的进展。并且可以在**保持 seed agent、可变面、模型、评估器与任务 split 固定**的前提下，在**独立的一次运行中**替换父代选择算子。

**集成成本数据**：在被评估的提交上，四个适配版本各用 **47–61 行 recipe**、各复用 **2 个算子绑定**，**没有改动任何框架源文件**（表 6）；**方法特定的算子代码在 216 到 1,087 行之间**。

---

## 4 评估（Evaluation）

评估围绕三个研究问题组织：

| RQ | 问题 |
|---|---|
| **RQ1** | RSIHub 能否支撑有效的智能体演化？ |
| **RQ2** | RSIHub 是否保持了它所执行的智能体的能力？ |
| **RQ3** | RSIHub 是否保持了智能体演化实验的完整性？ |

对应方法：RQ1 跨 agent、benchmark 与留出 split 比较演化配方；RQ2 用**第零代对照（generation-zero controls）**对比直接执行；RQ3 做**故障注入与边界强制试验**。

### 4.1 配方实例化

四个 recipe 全部用同一套算子表达，差异仅在**搜索行为**与**变异焦点**：

| Recipe | Search behavior（搜索行为） | Mutation focus（变异焦点） |
|---|---|---|
| `hill_climb` | 从最好的父代继续 | target |
| `aevovle` (A-Evolve) | 目标导向的持续适应 | prompt, target skills |
| `ahe` (AHE) | 依据执行证据修订 harness | target |
| `gepa` (GEPA) | Pareto 选择；minibatch 验证 | prompt, task skill |
| `hyperagents` | 共同演化 target 与演化策略 | target, selected operators |

> **重要限定**：每个 recipe 都是**算子选择与配置层面的接口适配（interface adaptation）**。**与源实现的精确对应还取决于其 prompt、模型、预算、依赖与运行时适配器。** 用户可以原样运行一个适配版本、替换一个算子、修订其可变资源，或在同一套服务上写全新 recipe。

### 4.2 实验设置

**智能体与演化方法**：演化对象是 **MiniSWE** 与 **Codex**（作 seed agents）；四种方法按 §4.1 适配；全部使用**同一个冻结的 Harbor 评估器**。

**Benchmark 与指标**：

| Benchmark | 任务数 | train | gate | sealed |
|---|---|---|---|---|
| **Terminal Bench 2** | 89 | 50 | 19 | 20 |
| **τ³ Banking** | 97 | 50 | 20 | 27 |

- 任务划分的作用：**train 轨迹提供演化反馈；gate 任务支持候选体准入；sealed 任务被排除在变异反馈之外，仅用于留出报告。**
- 每任务 **1 次试验**，报告 **pass@1**。
- 因各 split 大小不同，**表 1 中每个 split 列表示其对全 benchmark 分数的贡献**，即 `N_pass,s / N_all`。

**模型**：所有实验以 **GPT-5.4（high reasoning effort）** 作为 MiniSWE 与 Codex 的 target model；每个 recipe 的变异智能体为 **Codex（GPT-5.4，xhigh reasoning effort）**。**target 与 mutation 的模型配置在 benchmark、seed agent、演化方法之间保持固定**，使性能差异可归因于共享模型配置下的演化配方。

**优化与运行时**：所有 recipe **每代只提出一个子代**，演化**最多 10 代**。演化结果使用**静态任务采样、每任务一次评估**；能力保持对照使用**三次独立重复**。所有任务执行使用 **Docker 隔离的 Harbor 环境**，安装脚本下载并校验**内容固定（content-pinned）**的 benchmark 资产，并构建 recipe 专属变异容器，**固定 MiniSWE 2.4.5 或 Codex 0.143.0**。

### 4.3 演化有效性与迁移（RQ1）

**协议**：在共享条件下比较每个演化配方与其 seed。整体分数变化检验框架能否支撑有效改进；**train、gate、sealed 结果**则揭示这些改进**能否通过准入**、**能否超越用于提出修订的轨迹**。跨越 agent、benchmark 与方法，使该猜想能在**异构设置**下回答，而非单一有利配置。

#### 表 1：演化前后的 Pass@1

> 所有条目为百分比；split 列报告其对全 benchmark pass@1 的贡献。括号内为相对相应 seed 基线的**绝对变化**（百分点）。演化变体中，每个 agent 的最优结果**加粗**，次优**下划线**。

**Terminal Bench 2**

| Agent | Method | Train | Gate | Sealed | Overall |
|---|---|---|---|---|---|
| MiniSWE | Seed | 32.6 | 12.4 | 11.2 | 56.2 |
| MiniSWE | AHE | 37.1 (+4.5) | 12.4 (+0.0) | 15.7 (+4.5) | 65.2 (+9.0) |
| MiniSWE | **Hyperagents** | 36.0 (+3.4) | **16.9 (+4.5)** | 16.9 (+5.6) | **69.7 (+13.5)** |
| MiniSWE | **A-Evolve** | **40.5 (+7.9)** | 12.4 (+0.0) | 16.9 (+5.6) | **69.7 (+13.5)** |
| MiniSWE | GEPA | 36.0 (+3.4) | 12.4 (+0.0) | 15.7 (+4.5) | 64.0 (+7.8) |
| Codex | Seed | 39.3 | 15.7 | 14.6 | 69.7 |
| Codex | **AHE** | 42.7 (+3.4) | 12.4 (−3.4) | **16.9 (+2.2)** | **71.9 (+2.2)** |
| Codex | Hyperagents | 41.6 (+2.3) | 13.5 (−2.2) | 15.7 (+1.1) | 70.8 (+1.1) |
| Codex | A-Evolve | 40.5 (+1.1) | 15.7 (+0.0) | 14.6 (+0.0) | 70.8 (+1.1) |
| Codex | GEPA | 39.3 (+0.0) | 15.7 (+0.0) | 14.6 (+0.0) | 69.7 (+0.0) |

**τ³ Banking**

| Agent | Method | Train | Gate | Sealed | Overall |
|---|---|---|---|---|---|
| MiniSWE | Seed | 12.4 | 6.2 | 9.3 | 27.8 |
| MiniSWE | AHE | 16.5 (+4.1) | 7.2 (+1.0) | 5.2 (−4.1) | 28.9 (+1.1) |
| MiniSWE | **Hyperagents** | **17.5 (+5.1)** | 8.2 (+2.0) | 7.2 (−2.1) | **33.0 (+5.2)** |
| MiniSWE | A-Evolve | 12.4 (+0.0) | 6.2 (+0.0) | 9.3 (+0.0) | 27.8 (+0.0) |
| MiniSWE | GEPA | 11.3 (−1.1) | **11.3 (+5.1)** | 7.2 (−2.1) | 29.9 (+2.1) |
| Codex | Seed | 16.5 | 5.2 | 3.1 | 24.7 |
| Codex | **AHE** | **17.5 (+1.0)** | 8.2 (+3.0) | **8.2 (+5.1)** | **34.0 (+9.3)** |
| Codex | Hyperagents | 15.5 (−1.0) | 6.2 (+1.0) | 7.2 (+4.1) | 28.9 (+4.2) |
| Codex | A-Evolve | 15.5 (−1.0) | 7.2 (+2.0) | 6.2 (+3.1) | 28.9 (+4.2) |
| Codex | GEPA | 16.5 (+0.0) | **9.3 (+4.1)** | 7.2 (+4.1) | 33.0 (+8.3) |

#### 整体表现

**Terminal Bench 2**：每个方法都把 MiniSWE 基线提升 **7.8–13.5 个百分点**；Hyperagents 与 A-Evolve 达到最高的 69.7。但从更强的 Codex 基线出发**增益更小**：AHE 达 71.9（+2.2），Hyperagents 与 A-Evolve 各 +1.1，**GEPA 与基线持平**。

**τ³ Banking**：模式改变。Hyperagents 给 MiniSWE 带来最大提升（27.8 → 33.0）；而 **AHE 在 Codex 上表现最好**，从 24.7 提升到 34.0，GEPA 紧随其后为 33.0。

> **这些迁移表明：方法排名同时取决于任务环境与起始智能体。**

#### 任务 split 层面的行为（隐藏的权衡）

- **MiniSWE / Terminal Bench 2**：所有方法都提升了 train 与 sealed split，但**只有 Hyperagents 提升了 gate split**。A-Evolve 取得最大 train 增益（+7.9），并与 Hyperagents 在 sealed 上并列，**但其 gate 分数未变**。
- **Codex / Terminal Bench 2**：AHE 与 Hyperagents 提升了 train 与 sealed，**却分别使 gate 下降 3.4 与 2.2 个百分点**。
- **τ³ Banking**：Hyperagents 从 MiniSWE 取得最大整体增益，**尽管 sealed 回退 2.1 个百分点**；AHE 与 GEPA 在 sealed 任务上**也分别损失 4.1 与 2.1 个百分点**。
- **Codex 的结果在留出 split 上更一致**：AHE 在 train/gate/sealed 上分别提升 1.0/3.0/5.1；GEPA 保持 train 性能，并在 gate 与 sealed 上各提升 4.1。

#### 启示（Implications）

> **没有任何方法在 benchmark、seed 与 split 上全面占优。**

这些**依赖设置的结果**正是 RSIHub 支持"更换演化策略同时保留统一执行与评估流水线"的动机。Terminal Bench 2 上的 **Gate 回退**与 τ³ Banking 上的 **sealed 回退**表明为何**可检视证据很重要**：**更高的整体分数可能掩盖留出损失。** 与候选体记录绑定的 split 级结果，帮助研究者诊断失败的适配版本、并选择值得进一步研究的策略。

**作者明确的谨慎声明**：若干配置（含 sealed 任务）出现了可观增益，**但既非普遍改进、也非普遍迁移**。**这些描述性点估计，在没有重复运行的情况下，不足以确立接近差异的稳定性。**

### 4.4 执行保真度（RQ2）

**协议**：为在不与演化混淆的前提下检验保真度猜想，比较**未改动 seed agent 的框架中介执行**与 **Direct 执行**。

| 概念 | 定义 |
|---|---|
| **Direct 执行** | 在 RSIHub **之外**调用冻结评估器，**不创建、不记录任何框架状态** |
| **Direct-A / Direct-B** | 两次独立的直接执行，分别在 RSIHub 执行**之前**与**之后** |
| **Avg@3** | 三次重复下 pass@1 的均值 |
| **D–D agreement** | Direct-A 与 Direct-B 的任务级一致率 |
| **D–R agreement** | Direct-A–RSIHub 与 Direct-B–RSIHub 两个一致率的均值 |
| **excess disagreement** | 跨模式不一致率均值 **减去** D–D 不一致率 |

每个条件下做**三次重复**，每次按**固定顺序**运行：Direct-A → RSIHub 第零代 → Direct-B，模型、任务、评估器与运行时设置完全一致。

#### 表 2：三次重复下的能力保持

| Benchmark | Agent | Avg@3 Direct | Avg@3 RSIHub | Δ | D–D | D–R | Excess disagreement |
|---|---|---|---|---|---|---|---|
| Terminal Bench 2 | MiniSWE | 59.6 | 56.9 | −2.6 | 83.5 | 84.6 | −1.1 |
| Terminal Bench 2 | Codex | 64.0 | 61.4 | −2.6 | 88.0 | 82.0 | **+6.0** |
| τ³ Banking | MiniSWE | 24.6 | 22.0 | −2.6 | 81.1 | 80.9 | +0.2 |
| τ³ Banking | Codex | 29.6 | 33.0 | +3.4 | 82.1 | 80.1 | +2.1 |

**结果**：

- Terminal Bench 2 上两个 agent 都变化 **−2.6 个百分点**。MiniSWE 的 D–R 一致率 84.6%，高于 D–D 的 83.5%；**Codex 的 D–R 仅 82.0%，而 D–D 为 88.0%，产生 +6.0 个百分点的超额不一致**；其 RSIHub Avg@3（61.4）落在六次直接执行的 60.7–65.2 区间内。
- τ³ Banking 上 MiniSWE 与 Codex 分别变化 −2.6 与 +3.4，超额不一致为 +0.2 与 +2.1。
- **直接执行彼此之间就在 12.0–18.9% 的任务上不一致。**

> **作者的自我限制**：这些对照**刻画的是执行变异性**；它们**既不能确立执行模式的等价性，也不能确立单次演化增益的统计显著性**。（详见 §B.1）

### 4.5 恢复与完整性（RQ3）

**协议**：通过在**变异或评估期间**终止运行、以及在**写入评估回执之后**终止运行，然后恢复并将恢复后状态与未中断的对照比较。同时尝试：**篡改评估器、写入声明可变面之外、访问 gate/sealed/anchor 证据、伪造档案结果**。

**每个场景在每个 benchmark campaign 中各做 30 次独立试验。** 一次试验通过的条件是：工作区达到**有效且可归因**的状态；未授权改动**无法影响已接受的结果**；champion **可从框架证据复现**。

#### 表 3：故障注入与边界强制结果

> 每个"correct outcome"条目为 **30 次试验中的次数**；**没有任何试验接纳了被污染的状态**。延迟按机器分别报告而不跨机平均。

| 类别 | 场景 | 必须保持的不变量 | TB2 正确数 | TB2 中位数(s) | τ³B 正确数 | τ³B 中位数(s) |
|---|---|---|---|---|---|---|
| Recovery | 变异期间终止 | 从认证父代恢复；不接纳部分子代 | 30 | 4.72 | 30 | 5.15 |
| Recovery | 评估期间终止 | 保留旧尝试并认证一次终态重试 | 30 | 3.61 | 30 | 4.94 |
| Recovery | 时间戳/回执之后终止 | 对账回执，且不产生重复事件 | 30 | 3.27 | 30 | 4.81 |
| Boundary | 修改评估器文件 | 在认证评估**之前**拒绝评估器改动 | 30 | 4.72 | 30 | 2.35 |
| Boundary | 写入可变面之外 | 把所有面外编辑**从候选体中排除** | 30 | 3.27 | 30 | 2.37 |
| Boundary | 变异期间访问受保护证据 | 使 gate/sealed/anchor 金丝雀**不进入变异包** | 30 | 0.23 | 30 | 1.63 |
| Integrity | 伪造档案结果 | 对未盖章事件或伪造 champion 缓存**失败关闭（fail closed）** | 30 | 0.98 | 30 | 0.69 |

**结果**：**全部 420 次试验都达到了所要求的结果，且没有接纳任何被污染的状态。** 延迟分机器报告，因为两个 campaign 在不同主机上运行。

> **限定**：这些结果**仅在所测试的生命周期边界与攻击情形内**支持完整性。方法作者可在不同 recipe 间**复用这些已测试的恢复与证据检查**。（§B 报告运行时开销与集成工作量）

---

## 5 结论（Conclusion）

RSIHub 为智能体演化提供了开放、可复用的基础设施。**全部四个被评估的适配版本都复用了框架服务，且未改动任何框架源文件。** 增益与留出迁移随设置变化，这正说明**共享协议与可检视证据对策略比较的必要性**。

**agent-driven 路径**把这种分离延伸到**自适应 recipe 修订**：外层智能体可在迭代之间修订算子绑定与设置，**而评估器、sealed split 与认证记录始终受保护**。

---

## 6 局限（Limitations）

作者自陈：

1. **证据保证依赖可信组件**：RSIHub 的证据保证依赖可信的框架服务、主机与文件系统保护、Git 与摘要操作、已配置的外部服务，以及有效的评估器。
2. **结果有适用范围**：结果仅适用于本研究测试的工作负载、主机与生命周期边界；**能力保持测量评估的是任务级一致性，而非完整的行为等价性**。
3. **指纹不替代证明**：运行时指纹**不能替代**主机或服务证明（attestation）；**RSIHub 不包含敌意代码**，更强的部署需要独立的证明、隔离与遏制（containment）。
4. **只评估固定 recipe**：所报告结果刻画的是**固定的、recipe 驱动的运行**，而**不是外层智能体的自适应 recipe 修订**。

---

## 7 负责任使用声明（Responsible Use）

RSIHub 可能促成**不安全的能力增长、奖励博弈（reward gaming）或敏感轨迹泄露**。

- **更高的 pass@1 不能确立安全部署，也不排除有害的中间动作**；银行 benchmark 上的成功**不能确立**其适用于金融决策。
- **RSIHub 支持审计与回滚，但不支持遏制**：可编辑算子与候选体适配器**可能在主机上执行**，位于任务容器隔离与反馈过滤之外。
- 部署方应：限制文件系统与网络访问、排除生产凭据、在晋升前要求**留出安全评估与人工审查**。
- 需要资源预算与停止/回滚控制，**但回滚无法撤销外部动作或信息披露**。
- 轨迹与档案需要访问控制、保留限制与脱敏后方可共享。

---

## 附录 A：一个代表性 recipe 配置

以下是一个 **GEPA 风格**的代表性 recipe（省略底层执行设置）：

```yaml
experiment:
  max_generations: 10
  budget_usd: 150
  children_per_gen: 1
  seed: 0

target:
  seed: builtin-codex

surface:
  include: [target/**]
  exclude: ...

operators:
  select:
    operator: pareto
    timeout_s: 600
    config: {seed: 0}

  rollout:
    operator: harbor
    timeout_s: 3600
    config:
      budget_tasks: 10
      task_sampling: generation_shuffle

  analyze:
    operator: gepa
    timeout_s: 600
    config:
      components:
        system_prompt: target/prompt.md
        task_execution_skill: target/skills/task-execution
      max_cases: 10

  mutate:
    operator: gepa
    timeout_s: 3600
    config:
      expose_gate_data: false      # 关键：变异不看 gate 数据
      runner: harbor
      agent: codex
      model: gpt-5.4
      agent_kwargs: {reasoning_effort: xhigh}
      components:
        system_prompt: target/prompt.md
        task_execution_skill: target/skills/task-execution
      component_strategy: round_robin
      max_examples: 10

  validate:
    operator: minibatch_improvement
    timeout_s: 3600
    config: {criterion: strict, n_concurrent: 4}

  gate:
    operator: parent_eligible
    timeout_s: 600

  record:
    operator: gepa
    timeout_s: 600

evaluator:
  engine: harbor
  dataset: terminal-bench@2.0
  agent: target.agent:HarborAgent
  split:
    train: 0.562
    gate: 0.213
    sealed: 0.225
  seed: 0
  sampling: static
  tasks_per_round: 10
  n_concurrent: 4
  repetitions: 1

anchor:
  final: true
```

> 注意 `expose_gate_data: false` 与 `split.sealed = 0.225`：**变异阶段看不到 gate 数据，sealed 分片完全不进入反馈回路。**

---

## 附录 B：扩展评估

### B.1 成对执行一致性

> 表 4：三次重复下的成对跨模式任务一致率。Mean D–R 是两个成对一致率的算术平均，即表 2 中报告的值。所有条目为百分比。

| Benchmark | Agent | Direct-A–RSIHub | Direct-B–RSIHub | Mean D–R |
|---|---|---|---|---|
| Terminal Bench 2 | MiniSWE | 84.3 | 85.0 | 84.6 |
| Terminal Bench 2 | Codex | 82.4 | 81.6 | 82.0 |
| τ³ Banking | MiniSWE | 82.1 | 79.7 | 80.9 |
| τ³ Banking | Codex | 79.4 | 80.8 | 80.1 |

**结果**：Terminal Bench 2 上，MiniSWE 的 Direct-B–RSIHub 一致率高 0.7 点，而 Codex 的 Direct-A–RSIHub 一致率高 0.8 点。τ³ Banking 上，MiniSWE 的 Direct-A 高 2.4 点，Codex 的 Direct-B 高 1.4 点。**没有任何一个直接重复样本始终更接近框架中介执行**，这正是取两个比较之均值的理由。

### B.2 运行时开销

**协议**：把跨 recipe 共享的服务与模型推理、benchmark 执行、变异分别计量：工作区初始化、候选体快照、可变面校验、评估记录、完整性验证、恢复。TB2 上初始化用 **50 次微基准重复**，恢复用 **30 次 replay 试验**，四个常规操作行与端到端份额用 **20 次完整 Gen-1 运行（每种方法 5 次）**。每个常规操作样本汇总该代内相关的**独占时间跨度**，在 20 个逐代总计上计算中位数与 P95。报告的代内份额使用框架独占跨度的**并集**而非嵌套时长求和。因两个 campaign 在不同主机上运行，延迟分布分别报告。

#### 表 5：按 benchmark campaign 的框架开销

> 操作延迟单位为毫秒。TB2 上框架独占跨度占端到端生成时间的**中位数 0.02%、P95 0.06%**；τ³ Banking 上占 **0.019%**。

| 框架操作 | TB2 中位数 | TB2 P95 | τ³B 中位数 | τ³B P95 |
|---|---|---|---|---|
| 工作区初始化与配置冻结 | 155.5 | 368.8 | **1229.3** | 1320.4 |
| 候选体 worktree 与快照创建 | **756.2** | 2952.3 | 19.2 | 21.6 |
| 可变面校验 | 27.1 | 43.2 | 13.5 | 16.0 |
| 评估盖章与档案更新 | 32.4 | 69.8 | 10.8 | 14.9 |
| 状态验证与 champion 重算 | **652.5** | 1482.2 | 108.4 | 113.8 |
| 中断后的恢复重放 | 1006.8 | 2451.9 | 92.3 | 99.4 |

**结果**：工作区初始化是 τ³ Banking campaign 中最大的测量操作（中位数 1.23 秒）；而在 TB2 上，候选体快照创建与状态验证是最大的常规操作（中位数 0.76 与 0.65 秒）。**绝对延迟不应跨主机直接比较。** 更重要的是：**框架工作相对完整生成保持很小**——τ³ Banking 为 0.019%，TB2 中位数 0.02%。**因此在两个被测负载中，模型、变异与 benchmark 执行占据了运行时主导地位。**

### B.3 方法集成工作量

**协议**：统计每个适配方法所需的**规范化的 recipe 行数、新算子行数、复用算子数、框架源文件改动、集成测试数**。分开报告这些量，以便把**声明式组合与复用服务**和**真正的新方法逻辑**区分开。

#### 表 6：共享 recipe 与算子接口下的方法集成工作量

| Method | Recipe LOC | New operator LOC | Reused operators | Framework files changed | Integration tests |
|---|---|---|---|---|---|
| AHE | 47 | **1087** | 2 | **0** | 47 |
| Hyperagents | 48 | 216 | 2 | **0** | 15 |
| A-Evolve | 57 | 684 | 2 | **0** | 14 |
| GEPA | 61 | 745 | 2 | **0** | 16 |

**结果**：在锁定的实验提交上，四个适配版本各需 **47–61 行 recipe 配置**、各复用 **2 个算子绑定**，**均不需要改动框架源文件**；方法特定算子实现从 Hyperagents 的 216 行到 AHE 的 1,087 行不等。每个适配版本通过了 **14–47 项**方法特定集成测试。

> **这个"零框架改动 / 非零方法代码"的分离，支持了作者设想的扩展模型：研究逻辑留在 recipe 与算子中，而候选体执行、评估、恢复与证据服务被复用。**

---

## 附录 C：检视一次执行

RSIHub 写出**基于文件的实验记录**，在运行期间与运行之后都可读。命令行摘要暴露种群状态与完整性发现。框架把 **champion** 定义为**最佳被接受的候选体**。只读本地查看器（图 2）呈现实验状态、代际谱系，以及 champion 累积的 target-tree 变化摘要。所示执行中，被接受的**第 8 代**候选体被显示为 champion。

> 图 2 说明：只读查看器把第 8 代候选标为 champion，显示其生命周期状态与该次运行特定的 primary-split 与 sealed 分数，将其置于代际谱系中，并汇总其累积的 target-tree 变化。**所显示的值描述的是这一次执行；聚合性能见 §4。**

---

## 附录 D：可执行契约与恢复语义

RSIHub 通过**带类型的算子接口**暴露每个方法控制的阶段。算子输出在框架使用之前先经校验；框架另行强制可变面、提交候选体、运行受保护评估，并保护框架记录字段。表 7 按执行顺序汇总了这九个接口。

### D.1 生命周期算子

#### 表 7：生命周期算子契约

> "Req." 表示 registry 必需算子，"Opt." 表示按 recipe 启用的算子。

| Stage | 模式 | 主要输入 | 已验证结果与框架处理 |
|---|---|---|---|
| **Select** | Req. | 档案视图与执行上下文 | **非空的父代辈分列表**；框架校验资格并 fork 记录的提交 |
| **Rollout** | Req. | 候选体 checkout 与上下文 | 结构化摘要与产物路径，作为变异证据保留 |
| **Analyze** | Opt. | 候选体 checkout 与上下文 | 分析摘要与产物路径，在变异前打包 |
| **Mutate** | Req. | Checkout、观察文本与上下文 | 改动路径、说明与用量元数据；**框架用真实 tree diff 对照声明的可变面检查** |
| **Validate** | Opt. | 已变异的 checkout 与上下文 | 接受标志、理由与产物；**拒绝会在受保护评估之前停止** |
| **Novelty** | Opt. | 未提交的 checkout 与上下文 | 有限的新颖度分数与接受标志；**拒绝会在提交之前停止** |
| **Gate** | Req. | 已评估子代行、父代行与上下文 | accept/reject 决策与理由；**框架保留分数字段** |
| **Record** | Req. | 终态子代行与上下文 | 辅助注解字段，**对照受保护记录字段进行过滤** |
| **Reflect** | Opt. | 更新后的档案与上下文 | 已验证的**只追加（append-only）**playbook 操作；**失败不会回滚已记录的代** |

### D.2 评估身份与父代选择

在 **strict-contract 模式**下，一次评估的**契约伴随其标量分数**。契约把精确的候选体绑定到评估器、数据、采样、运行时与模型条件（表 8）；其 `contract_id` 是整个载荷的**规范摘要（canonical digest）**。**父代选择**把显式列出的**固定身份投影**与完整性检查、生命周期检查结合起来；**完整契约仍附着在每次尝试上以供溯源**。

#### 表 8：评估身份与父代选择谓词

| 层 | 记录的身份 | 作用 |
|---|---|---|
| **Candidate** | 候选体提交与 tree、generation、可选的依赖摘要 | 把证据绑定到被评估的源码及相关依赖 |
| **Evaluator** | 冻结的评估器 tree、语义配置摘要、框架版本 | 使评估器改动在**每次尝试的溯源中可见** |
| **Data and trials** | 数据集内容与任务集摘要、有序任务成员、split、重复次数、seed 命名空间、试验身份 | 使**任务归属与重数（multiplicity）显式化** |
| **Runtime and model** | 运行时摘要、agent 与模型名、endpoint 摘要、并发度、重试策略 | 记录可能影响证据收集的执行条件 |
| **Fixed comparison identity** | 评估器 tree 指纹、任务集哈希、运行时指纹 | 定义**可选父代必须匹配的跨代投影** |
| **Integrity receipt** | 框架标记与序列化评估事件的哈希回执 | **当框架回执缺失或不再匹配时标记该事件** |
| **Parent eligibility** | 完整候选体或 genesis 评估；selection-eligible；无 pending Gate 决策；valid-parent 与 keep；认证回执；匹配的固定身份；有限分数；generation tag 与记录提交匹配 | **排除不完整、被拒、未认证、不可比、非有限与被重打标签的候选体** |

**sealed 评估**作为**独立的、不可选择的 anchor** 运行：实现把它存为辅助证据，**从默认的变异反馈包中排除**，并使其 anchor 用途**位于 candidate-or-genesis 父代谓词之外**。

### D.3 恢复检查点

**档案是一个恢复边界**：一次完整的认证候选体评估在 **Gate 之前**被追加，并**保持 pending 直到 Gate 记录其决策**。因此**一个 pending 的子代对 Select 不可用**。Record 注解在 Gate **之后**运行并被单独过滤；**Record 完成位于父代资格谓词之外**。表 9 汇总了实际实现的重新启动行为。

#### 表 9：检查点与恢复行为

| 观测到的状态 | 恢复动作 | 保持的性质 |
|---|---|---|
| 运行开始时的活动子代 worktree | 停止，要求算子保留编辑或调用修复 | **进行中的候选体保持不变** |
| 陈旧的受管 worktree | 修复**只删除干净的** worktree；脏的与外部管理的 worktree 被保留并报告 | **对未提交工作，清理是保守的** |
| 有 generation tag 但无认证评估 | **评估已打标签的提交**，而非重复选择与变异 | **恢复保留已创建候选体的身份** |
| 完整评估 pending Gate | 从已打标签的候选体**恢复 Gate**，然后尝试终态 Record；**在 Gate 决策前保持该行不合格** | **父代选择等待 Gate 定稿** |
| 中断的或终态失败的评估 | 追加可用的尝试证据；**要求显式重试**才能创建新的认证尝试 | **失败的尝试仍可审计，重试由算子控制** |
| 已尝试过终态 Record | **恢复时跳过重复的 Record 调用** | **每个终态 Record 至多被调用一次** |

---

## 附：整篇论文的核心要点速览

| 要点 | 内容 |
|---|---|
| **一句话** | 把演化方法的"方法策略"与"执行/评估/记录基础设施"分离，用 recipe + operator 组装方法，框架统一提供执行、评估、恢复、谱系 |
| **最大设计** | **评估位于可变面之外**；认证记录受框架保护；算子只能提议注解 |
| **生命周期** | Select → Rollout → Analyze* → Mutate → Guardrail(Validate*/Novelty*) → Evaluate → Absorb(Gate/Record/Reflect*) |
| **数据划分** | train（反馈）/ gate（准入）/ sealed（留出，不进反馈） |
| **最大增益** | +13.5 pp（TB2 / MiniSWE / Hyperagents 与 A-Evolve） |
| **最重要否定结果** | 排名随设置翻转；Gate 最多 −3.4pp；sealed 最多 −4.1pp；**增益不总迁移** |
| **保真度** | 框架中介 vs 直接执行：−2.6 ~ +3.4pp；**直接执行彼此就有 12.0–18.9% 分歧** |
| **完整性** | 420/420 次故障注入试验正确，零污染状态 |
| **开销** | 框架占端到端生成时间 **0.019%–0.02%（中位数）** |
| **集成成本** | 每方法 47–61 行 recipe、**0 个框架源文件改动**、2 个复用算子、216–1087 行新算子代码 |
