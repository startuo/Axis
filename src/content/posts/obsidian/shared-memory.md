---
title: Memmy-Agent：跨 Agent 共享记忆系统 深度分析
published: 2026-08-04T00:00:00.000Z
updated: 2026-08-04T00:00:00.000Z
description: 一句话总结：Memmy-Agent 不是又一个 AI 助手，而是一个本地优先的 Agent 管理平台，核心差异在于它为所有 AI Agent 提供同一套共享记忆层——不管你用 Cursor、Claude Code 还是 Codex，上下文和偏好始终跟随你。
tags:
  - AI-agent
  - agent-architecture
  - memory-management
  - cross-agent
  - MemOS
  - agent-runtime
  - MCP
  - skill-system
  - knowledge-management
  - local-first
category: Agent 工程
lang: zh_CN
draft: false
image: /images/obsidian/shared-memory.png
---

> **一句话总结**：Memmy-Agent 不是又一个 AI 助手，而是一个**本地优先的 Agent 管理平台**，核心差异在于它为所有 AI Agent 提供同一套共享记忆层——不管你用 Cursor、Claude Code 还是 Codex，上下文和偏好始终跟随你。

---

## 30 秒答案

| 维度 | 答案 |
|---|---|
| **是什么** | 开源（MIT）本地优先的 **Agent 管理运行时 + 共享记忆基础设施** |
| **解决什么** | 在不同 AI 工具间切换时，上下文全部丢失——每个 Agent 都像失忆一样从头开始 |
| **怎么解决** | 一套本地记忆服务（MemOS）→ 所有 Agent 读写同一份记忆 → 上下文跨工具延续 |
| **底层引擎** | MemOS（Memory Operating System）：混合检索（FTS5 + 向量）、三层记忆分层、Text2Mem 统一操作语言 |
| **技术栈** | TypeScript · npm workspaces monorepo · Fastify + SQLite · Electron 桌面端 |
| **竞争对手** | Hermes Agent、OpenClaw、Mem0、Letta——但定位更偏向 **记忆基础设施** 而非个人助手 |

---

## 一、核心架构：四层设计

Memmy-Agent 采用严格的四层分离架构：

```
┌──────────────────────────────────────────────────┐
│                 🖥️  User Interface                │
│     Desktop App (Electron) · CLI/TUI · Web API   │
├──────────────────────────────────────────────────┤
│              🔌  Integration Layer                │
│   Telegram · Discord · WeChat · Feishu · DingTalk │
│      GitHub · Gmail · Notion · Slack · Jira      │
│              OpenAI-compatible API                │
├──────────────────────────────────────────────────┤
│              🤖  Agent Runtime                    │
│   Reasoning · Task Orchestration · Tool Calls    │
│   MCP · Sessions · Long Tasks · Skill Loading    │
│   Auto-Compaction · Memory Hooks                 │
├──────────────────────────────────────────────────┤
│              🧠  Memory Layer (MemOS)             │
│   Cross-Agent Memory · History Import            │
│   Knowledge Distillation · Hybrid Retrieval      │
│   Session · Turn · Search · Write · Analytics    │
└──────────────────────────────────────────────────┘
```

**关键设计原则**：每一个入口点（Desktop、CLI、API）都读写同一份记忆存储。Agent Runtime 和 Memory Layer 是解耦的——记忆服务独立运行在 `127.0.0.1:18960`，Runtime 通过网络调用它。

---

## 二、MemOS：记忆操作系统的深度解析

Memmy 的底层引擎是 **MemOS（Memory Operating System）**，它是整个系统的理论基石。

### 2.1 三层记忆分层

MemOS 把记忆分为三个异构层级，用统一的 **MemCube** 抽象封装：

| 记忆类型 | 存储位置 | 特性 | 适用场景 |
|---|---|---|---|
| **Parametric Memory** | 模型权重中（预训练/微调/LoRA） | 读取最快，训练成本最高 | 固化到模型中的长期知识 |
| **Activation Memory** | 推理时的 KV-Cache/隐状态 | 瞬时认知状态 | 当前对话的短时上下文 |
| **Plaintext Memory** | 外部存储（文档、知识图谱、Prompt 模板） | 可编辑、可治理、可共享 | 偏好、决策记录、项目上下文 |

每个 MemCube 携带三类元数据：
- **描述元数据**：时间戳、来源签名、语义类型
- **治理属性**：访问权限、生命周期策略、优先级、敏感度标签
- **行为指标**：访问频率、上下文相关性、版本谱系

**关键洞察**：三种记忆可以**动态转换**——Plaintext → Activation（检索后注入上下文）、Plaintext/Activation → Parametric（高频记忆微调进权重）。这是 MemOS 区别于简单向量数据库的核心。

### 2.2 混合检索引擎

```
┌──────────────┐    ┌──────────────┐
│  FTS5 全文   │    │  向量语义    │
│   关键词匹配  │    │   相似度搜索  │
└──────┬───────┘    └──────┬───────┘
       │                   │
       └────────┬──────────┘
                ▼
        ┌──────────────┐
        │  结果融合排序  │
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │  MemScheduler │ ──→ 异步调度，毫秒级延迟
        └──────────────┘
```

- **FTS5**：SQLite 原生全文索引，处理精确关键词匹配
- **向量搜索**：Embedding 驱动的语义相似度检索
- **缓存层**：高频访问的记忆在中间层缓存，避免重复检索

### 2.3 MemOS 2.0 的新增能力

| 能力 | 描述 |
|---|---|
| **运行态管理** | 追踪用户和 Agent 状态、任务进度、环境反馈，防止 Agent 重复或跳过步骤 |
| **版本化记忆演化** | 快照、回滚、生命周期管理——记忆可以退休、替换、遗忘 |
| **记忆原生模型探索** | 在模型架构中嵌入 Local Memory / Hyper Memory 模块 |

---

## 三、跨 Agent 共享记忆：Scan → Organize → Inject

这是 Memmy 最核心的差异化能力——三阶段记忆管线：

```
 ┌──────────┐      ┌──────────────┐      ┌──────────┐
 │  SCAN    │  →   │   ORGANIZE   │  →   │  INJECT  │
 │ 扫描导入  │      │   结构化蒸馏   │      │  按需注入  │
 └──────────┘      └──────────────┘      └──────────┘

 支持的外部 Agent:         MemOS 引擎处理:          注入目标:
 • Cursor                  • 偏好提取               • Cursor
 • Claude Code             • 技术决策归档            • Claude Code
 • Codex                   • 项目上下文               • Codex
 • OpenCode                • 踩坑记录               • OpenClaw
 • OpenClaw                • 去重分类               • Hermes
 • Hermes Agent            • 关系建模               • 任意 AI 工具
```

### 关键设计决策

1. **显式授权**：扫描阶段需要用户明确授权，不会自动读取外部 Agent 历史
2. **结构化组织**：不是简单存原文，而是用 MemOS 蒸馏成结构化记录
3. **按需注入**：不会全量 dump 记忆，而是检索最相关的部分注入上下文

---

## 四、三个入口点

### 4.1 Desktop App（桌面应用）

- macOS / Windows 的完整 GUI 工作台
- **Account 模式**：送 3000 万免费试用 token
- **BYOK 模式**：自带模型 API Key
- 可配置主模型、Embedding、ASR、图像生成、记忆摘要、Skill 演化模型

### 4.2 `memmy` CLI（Agent Runtime）

```bash
memmy onboard              # 初始化配置和 Workspace
memmy status               # 检查状态
memmy agent --message "Hi" # 单轮消息
memmy                      # 交互式 TUI 对话
memmy serve                # 启动 OpenAI 兼容 API（端口 18990）
```

**配置文件** `~/.memmy/config.yaml`：
```yaml
agents:
  defaults:
    model: openai/gpt-4.1
    provider: openai
    timezone: Asia/Shanghai
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}   # 支持环境变量引用
```

### 4.3 `memmy-memory` CLI（记忆访问客户端）

供外部 Agent/脚本调用的轻量级记忆接口（连接 `http://127.0.0.1:18960`）：

```bash
memmy-memory init                            # 写入记忆配置，安装 Skills
memmy-memory search "这个项目的记忆策略"
memmy-memory add "一条值得保存的知识"
memmy-memory get <id>
memmy-memory health                          # 健康检查
```

---

## 五、运行时六大子系统

| 子系统 | 职责 | 技术细节 |
|---|---|---|
| **Workspace** | Agent 工作目录 | `~/.memmy/workspace`，同步模板、内置 Skills、记忆文件 |
| **Config** | 主配置 | `~/.memmy/config.yaml`，覆盖模型、Provider、工具、MCP、Gateway、记忆、Workspace |
| **Agent Runtime** | 核心任务执行 | 模型调用、消息循环、工具注册、MCP、会话、长任务、Skill 加载、自动压缩、记忆钩子 |
| **Memory Service** | 本地记忆基础 | 运行在 `127.0.0.1:18960`，提供 Session/Turn/Search/Write/Panel/Analytics API |
| **Local Backend** | 桌面本地 API | Fastify + SQLite，处理账户、配置、集成、来源扫描、Skill 编写 |
| **Agent Source** | 外部 Agent 适配器 | 读取 Cursor/Claude Code/Codex 等的历史，安装记忆 Skill 到外部 Agent |

---

## 六、Skill 系统

Memmy 内置 11 个 Skill，通过 `npx skills add MemTensor/memmy-agent` 安装：

| Skill | 功能 |
|---|---|
| **agent-memory-onboarding** | 连接本地 Agent 到 Memmy GUI，发现历史存储，安装 Skills |
| **github** | 通过 `gh` CLI 管理 GitHub 资源（PR 检查、CI 日志、API 查询） |
| **goal** | 多轮持久任务管理，通过 `long_task` 和 `complete_goal` 追踪完成 |
| **image-generation** | 文生图和迭代编辑 |
| **skill-creator** | 创建、编辑、重构、审计 memmy-agent Skills |
| **summarize** | 从 URL、文件、YouTube 提取文本/摘要 |
| **tmux** | 管理 tmux 会话，支持并行编码 Agent |
| **ui-craft** | 设计和构建浏览器可见界面 |
| **weather** | 天气查询（无 API Key，使用 wttr.in 和 Open-Meteo） |
| **memmy-memory** | 持久 Agent 记忆 CLI：会话管理、读写搜索 |
| **cron** | 定时提醒和重复任务（一次性、固定间隔、Cron 表达式） |

**Skill 的安装目标可以是外部 Agent**——这意味着你可以把 Memmy 的记忆能力注入到 Cursor 或 Claude Code 中。

---

## 七、Text2Mem：统一记忆操作语言

Text2Mem 是 MemTensor 定义的一套**从自然语言到可靠记忆执行的标准化途径**。

### 12 个原子操作（三类阶段）

| 阶段 | 操作 | 说明 |
|---|---|---|
| **Encoding（编码）** | Encode | 将原始信息编码为记忆 |
| **Storage（存储）** | Update, Label, Promote, Demote, Merge, Delete, Split, Lock, Expire | 记忆的生命周期管理 |
| **Retrieval（检索）** | Retrieve, Summarize | 读取和汇总记忆 |

### 执行管线

```
Natural Language → Validator → Parser → Adapter → 异构后端执行
                    │            │         │
                    ▼            ▼         ▼
              JSON Schema   类型化操作    SQL/MemOS
              结构化+语义    对象         适配器
```

**Promote/Demote/Merge/Split/Lock/Expire** 这些高阶操作被提升为**一等公民**——这是 Mem0、Letta 等框架所缺失的。例如：
- **Promote**：将高频 Plaintext 记忆提升为 Activation Memory
- **Lock**：冻结关键记忆防止被意外修改
- **Expire**：设置记忆的自动过期时间

---

## 八、企业级多 Agent：ClawForce

在企业场景中，MemTensor 在 MemOS 之上构建了 **ClawForce** 三级架构：

```
┌─────────────────────────────────────────┐
│        Employee Surface（员工面）         │
│   IM 界面（飞书/企微）→ 任务协作          │
├─────────────────────────────────────────┤
│      Management Plane（管理面）           │
│   组织入职 · Agent 模板 · 审批流程 · 持续优化 │
│           面向 IT/CTO 团队                │
├─────────────────────────────────────────┤
│      Intelligence Hub（智能中枢）          │
│   MemOS 记忆 · Skill 引擎 · 事件监听 · 工具连接 │
└─────────────────────────────────────────┘
```

**多 Agent 协作模式示例**：
1. 业务人员的 **热点追踪 Agent** 持续采集信息
2. 信息流向 **商业分析 Agent** 做研判
3. 分析结论传递给 **产品经理 Agent** 做设计跟进

之间的记忆传递由 MemOS 调度，支持**隐私边界隔离**和**选择性共享**。

---

## 九、与现有知识体系的联系

### 9.1 与 Harness / Loop / Graph Engineering 的关系

Memmy-Agent 完美体现了 [三层架构](/posts/obsidian/harness-loop-graph/)：

| 层 | Memmy 中的实现 |
|---|---|
| **Harness** | Agent Runtime + Memory Service + Config + Workspace——完整的模型运行环境 |
| **Loop** | Goal Skill（多轮持久任务）+ Cron Skill（定时循环）+ Auto-Compaction（记忆压缩循环）+ Memory Hooks（记忆钩子反馈循环） |
| **Graph** | Skill 间的任务编排 + ClawForce 的多 Agent 协作流程 + Text2Mem 的操作管线 DAG |

### 9.2 与 Agentic OS（Fable 5）设计哲学的对齐

memmy-agent 的许多设计决策与 [Fable 5 构建者指南](/posts/obsidian/agentic-os/) 高度一致：

| Fable 5 原则 | Memmy 对应 |
|---|---|
| **法律不是建议** | MemOS 的治理属性（权限、生命周期策略、Lock/Expire）是硬约束 |
| **nothing grades its own homework** | 记忆注入与 Agent 执行分离——Memory Service ≠ Agent Runtime |
| **通过一次 ≠ 放任不管** | 版本化记忆演化——快照、回滚、持续审计 |

### 9.3 对 Dynamic Workflows 的补充

[Dynamic Workflows](/posts/obsidian/dynamic-workflows/) 的核心论点是"杠杆点在设计系统而非写提示"。Memmy 将这条原则**下沉到了记忆层**：

> 不是让每个 Agent 自己管理记忆，而是把记忆设计成独立的基础设施——Agent 们只管读写，系统负责组织、检索和注入。

---

## 十、设计洞察与可迁移原则

### 10.1 记忆作为基础设施

**核心洞察**：记忆不应该是 Agent 的一个 feature，而应该是独立于任何 Agent 的基础设施层。

这就像数据库之于微服务——每个微服务不需要自己实现存储引擎，它们共享同一套持久化层。Memmy 把同样的逻辑应用到了 AI Agent 的记忆上。

### 10.2 三层记忆分层的普适价值

即使不实现 MemOS，这个分层思想也有普遍指导意义：

| 你的系统可能需要 | 对应 MemOS 层 |
|---|---|
| 模型微调/RLHF 后的固化知识 | Parametric Memory |
| 会话中的临时上下文（KV-Cache、对话历史） | Activation Memory |
| 用户偏好、项目文档、决策记录 | Plaintext Memory |

### 10.3 记忆生命周期的显式管理

Text2Mem 的 12 个原子操作揭示了一个被大多数 Agent 框架忽略的维度：**记忆不是你扔进去就完事的，它需要被 Promote、Demote、Merge、Lock、Expire**。

可迁移的实践：
- 高频访问的记忆 → 提升优先级/缓存预热
- 过时记忆 → 主动 Expire 而非被动遗忘
- 关键决策 → Lock 防止被后续操作污染
- 重复记忆 → Merge 去重

### 10.4 混合检索的必要性

纯向量检索（语义相似度）不够——精确的关键词匹配在很多场景下更可靠。FTS5 + Vector 的混合方案是低成本且高效的选择。

### 10.5 本地优先的哲学

所有记忆数据留在用户机器上，BYOK 连接模型。这不只是隐私考虑——**它把记忆的所有权和控制权还给了用户**。当记忆基础设施是云服务时，用户实际上被锁定在那个生态里；本地优先让记忆成为可迁移的资产。

---

## 十一、关键数据与基准

| 指标 | 数据 |
|---|---|
| **Token 节省** | 35.24%（通过智能记忆摘要和检索） |
| **云端插件 Token 减少** | 最高 72% |
| **OpenClaw 任务完成率提升** | 36.63% → 50.87%（五个 Agent 任务） |
| **LoCoMo 基准** | 88.83 |
| **LongMemEval 基准** | 89.20 |
| **OmniMemEval** | 14 款商用记忆产品中排名领先 |
| **许可** | MIT（完全开源） |
| **语言** | TypeScript |
| **仓库创建** | 2026-07-16（极新，仍在快速迭代） |
| **最新版本** | v1.0.4（2026-07-30） |
| **社区** | ~259 Stars, 32 Forks（两周内） |

---

## 十二、局限性与待观察

1. **项目极新**（2026年7月创建）——API 稳定性、生态成熟度、社区规模尚待验证
2. **npm 无独立包**——需从源码构建，增加了非 Node.js 生态的接入成本
3. **单机本地优先**——多设备同步方案尚不明确（可能依赖桌面端的云同步）
4. **记忆注入质量**——MemOS 的检索+注入能否准确命中相关记忆，取决于 Prompt 工程和检索精度
5. **与 Claude Code 原生记忆功能的竞争**——Claude Code 自身也在发展 CLAUDE.md 等持久化机制，Memmy 需要在差异化上持续证明价值

---

## 总结

Memmy-Agent 代表了一个重要的行业趋势：**Agent 的基础设施正在从"每个 Agent 自带的附属功能"标准化为"独立、共享的系统层"**。记忆层、工具层、编排层——每一层都在经历这个标准化的过程。

Memmy 在**记忆层**上走得最远——它不是把向量数据库套个壳就叫记忆系统，而是从记忆的**分层理论**（MemOS）、**操作语言**（Text2Mem）、**生命周期管理**（MemLifecycle）、**访问治理**（MemGovernance）四个维度系统性地重新设计了 Agent 记忆。

> **一句话带走的实践原则**：像对待数据库一样对待 Agent 记忆——独立的服务、标准化的操作、生命周期管理、访问控制。不要在每个 Agent 里实现记忆，让记忆成为 Agent 们共享的基础设施。

---

## 参考来源

- [GitHub: MemTensor/memmy-agent](https://github.com/MemTensor/memmy-agent)
- [GitHub: MemTensor/MemOS](https://github.com/MemTensor/MemOS)
- [MemOS: An Operating System for Memory-Augmented Generation (arXiv)](https://ar5iv.labs.arxiv.org/html/2505.22101v1)
- [Text2Mem: A Unified Memory Operation Language (arXiv)](https://ar5iv.labs.arxiv.org/html/2509.11145)
- [Memmy on EveryDev.ai](https://www.everydev.ai/tools/memmy)
- [Memmy on SkillsLLM](https://skillsllm.com/skill/memmy-agent)
- [QCon 2026 北京站：从上下文到记忆——熊飞宇博士演讲](https://phys.sabanciuniv.edu/en/education/graduate?live-blog-17024048-2026-07-14-zai-da-mo-xing-ji-shu-cong-dui-hua-shi-jiao-hu-xiang-zi-zhu-shi-agent-yan-jin-de)

---

原笔记来源：https://github.com/MemTensor/memmy-agent
