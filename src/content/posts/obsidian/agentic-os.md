---
title: Agentic OS：Fable 5 构建者指南
published: 2026-07-08T00:00:00.000Z
updated: 2026-07-08T00:00:00.000Z
description: 一句话总结：Fable 5 是有史以来最强大的通用模型，但裸跑只是"花钱生成精美的错误"。真正的力量在于用法律而非建议、用独立验证而非自我审查、用永久监控而非一次性通过来约束它。
tags:
  - AI
  - Agent
  - Fable 5
  - Claude
  - 自动化
  - Agentic OS
  - 系统设计
  - 学习笔记
category: Agent 工程
lang: zh_CN
draft: false
image: /images/obsidian/agentic-os.png
---

> **一句话总结**：Fable 5 是有史以来最强大的通用模型，但裸跑只是"花钱生成精美的错误"。真正的力量在于用法律而非建议、用独立验证而非自我审查、用永久监控而非一次性通过来约束它。

---

## 0 · 三条底层原则

整篇文章的每一个设计决策都可以从这三条推导出来：

| # | 原则 | 含义 |
|---|------|------|
| 1 | **法律，不是建议** | 每条规则都有一个数字、一个 never、或一个检查它的命令。任何更软的东西都会被模型优化掉。 |
| 2 | ** nothing grades its own homework** | 规划者、执行者、验证者、守门员是四个不同主体，最后一个必须是确定性脚本。 |
| 3 | **通过一次的东西不会被放任不管** | 完成的工作毕业为"持续重新验证的不变量"。只验证一次的目标是带时间戳的假设。 |

---

## 1 · Fable 5 引擎配置（BUILD 0）

### 规格表

| 设置 | 值 |
|------|---|
| 模型字符串 | `claude-fable-5` |
| 上下文 / 输出 | 1M tokens / 最高 128k 输出/请求 |
| 价格 | \$10/M 输入，\$50/M 输出 |
| Thinking | 自适应，始终开启；`thinking: {type:"disabled"}` 会被拒绝；仅输出摘要 |
| Effort | low / medium / high（默认）/ xhigh / max |
| API | `output_config: {"effort": "..."}` |

### 五个关键事实

1. **`max_tokens` 是 thinking + 响应文本的硬上限**。high/xhigh 下要设大（起始 64k），否则思考中途断电。
2. **xhigh 官方用途**："超过 30 分钟的长时间自主任务，token 预算以百万计"。在本文系统中仅用于 conductor（指挥者）席位。
3. **拒绝是 HTTP 200**。返回 `stop_reason: "refusal"` 作为成功响应。脚本必须检查 stop_reason，不能只看退出码。
4. **永远不要让 Fable 回显推理过程**。"show your thinking" 会触发 `reasoning_extraction` 拒绝分类。
5. **Turn 天生很长**。高 effort 下单请求可能跑数分钟，自主运行可延指数小时。用异步检查（cron），不要阻塞等待。

### 官方 Prompt 语言（逐字使用，不要改写）

**反过度规划**（conductor + 交互会话）：
> 当你有足够信息行动时，就行动。不要重新推导已确定的事实，不要重新辩论用户已做的决定，不要叙述你不会 pursue 的选项。

**反镀金**（每个 worker prompt）：
> 不要添加任务要求之外的功能、重构或抽象。bug 修复不需要周边清理。不要为假设的未来需求设计。只在系统边界做验证。

**接地气的进度报告**（长时间运行）：
> 在报告进度前，用本次会话的工具结果审计每个声明。只报告能指向证据的工作；未验证的明确说未验证。测试失败就带着输出说失败。

**自主管道提醒**（每个 cron 驱动的 prompt）：
> 你在自主运行。用户不在看，不能中途回答问题。对于源于原始请求的可逆操作，直接执行不要问。结束前检查最后一段：如果是计划、问题或承诺，现在就做。

**记忆格式**：
> 每个文件存一条教训，顶部一行摘要。记录纠正和已确认的方法，包括为什么重要。不保存仓库已记录的内容；更新而非复制；删除被证明是错误的笔记。

**验证者指令**：
> 在 [X] 间隔用子代理验证工作，对照规格检查。

---

## 2 · 宪法 CLAUDE.md（BUILD 1）

**设计哲学**：Fable 遵守法律、优化掉建议。每一行都需要一个数字、一个 never、或一个检查命令。

### 四个区块

**NEVER（法律）**：
- 单次提交不超过 200 行变更
- 不碰 auth/billing/migrations/prod config（除非有人看着）
- 不自行报告"完成"——完成 = 检查通过
- 不编造密钥、端点或约定
- 不添加依赖（写入 STATE.md 提议，然后停止）
- 循环内 effort 不超过 high
- 不编辑或删除测试来让它通过
- 不回显内部推理

**DISPATCH（路由表）**：按任务特征路由到不同模型——

| 模型 | 边际成本 | 智力 | 品味 |
|------|---------|------|------|
| claude-fable-5 | \$2 (credits) | 10 | 10 |
| claude-opus-4.8 | \$7 (sub) | 8 | 9 |
| claude-sonnet-5 | \$9 (sub) | 7 | 7 |
| codex | \$9 | 9 | 5 |

路由规则（first match wins）：
1. 决策（plan/review/route）→ fable-5, high, 只读
2. 读取 >50k tokens → codex，绝不用 fable
3. 面向用户（UI/API/copy）→ 品味 >= 8 做最终通过
4. Spec 完整 → sonnet-5, medium
5. 其他 → sonnet-5；miss 则升一级

**WORDS（定义）**：
- "done" = 谓词通过
- "small" = <50 行变更；"quick" = <10 分钟
- "cleanup" = 行为不变，verify.sh 前后都绿

**DONE（完成定义）**：
- 每个任务在开始前有机器可检查的 `done_when`
- 看过既无计划也无草稿的新鲜上下文 agent 来验证
- `guardrails/verify.sh` 有最终投票权
- 偏差：选保守选项，记录到 IMPLEMENTATION.md，继续
- 制造者和检查者两次不一致 → 停下，排队等人

> **限制**：150 行以内，不写 "think step step"，不预定义 agent 人格（Fable 自己设计的团队比你预定义的好）。

---

## 3 · 墙与门（BUILD 2）

### 三级行动契约（contract.md）

| 级别 | 内容 |
|------|------|
| **acts alone** | 在分支上草拟 PR；修 lint/test 债；更新 STATE.md；标记 issue |
| **queues for me** | auth/payments/migrations；低于 auto 层级的 skill；>400 行的 diff |
| **wakes me up** | verify 连续两次失败；路由器中途换模型；日预算超支；请求密钥；常设目标被违反 |

### 确定性守门员（verify.sh）

```bash
#!/usr/bin/env bash
set -e
npm run typecheck --if-present
npm test --if-present
npm run lint --if-present
```

**核心**：整个系统建立在这个脚本之上。如果它现在就失败，先修好它。

---

## 4 · 心跳循环（BUILD 3）-- 核心架构

### 为什么需要分层

- Fable 作为 worker = 四位数账单（500k-1M token 会话 × \$50/M 输出）
- Fable 作为 conductor = 发出 10-20% token，做 100% 决策
- \$0.01 模型读取安静的心跳

### 五阶段流水线

```
1. TRIAGE（$0.01）    廉价模型读取最近提交/issue/CI → 输出 findings
       │
       ▼ "status: quiet" → 退出 0
       │ "status: actionable"
       ▼
2. CONDUCT（$0.35）   Fable xhigh，只读，输出 JSON 工单
       │               {action, item, skill, spec, done_when}
       │               action: stop → 退出 0
       │               action: queue → 记录，继续下一轮
       ▼
3. EXECUTE（$0.10）   廉价 worker 在隔离 worktree 中执行 spec
       │
       ▼
4. VERIFY（$0.40）    Fable high，无工具，只看 spec + diff
       │               "PASS: <reason>" 或 "FAIL: <reason>"
       ▼
5. GATE              确定性 verify.sh → trust-ledger 记录
                       auto 层级 → 自动提交 PR
                       其他层级 → 标记 review
```

### 关键设计

- **路由容忍**：检查实际服务的模型是否与选择的匹配。如果被路由器换掉了，退出码 2，不迭代非你选的模型输出。
- **隔离 worktree**：每次执行在独立 git worktree 中，不污染主分支。
- **新鲜上下文验证**：验证者看过既无计划也无草稿，只看 spec + diff。
- **退出码映射**：0 = 安静/完成，1 = 迭代上限，2 = 路由被换，3 = 预算超支。全部有意标记。

### 四个 Prompt 文件

| 文件 | 角色 | 核心约束 |
|------|------|---------|
| `triage.md` | 廉价读者 | 只输出 findings，不修复，不发表意见。安静时输出 "status: quiet" |
| `conductor.md` | 指挥官 | 不写代码、不编辑文件。输出一个 JSON 决策。昂贵，要简短 |
| `workers/implement.md` | 执行者 | 严格按 spec 执行。缺凭证或未记录的决策 → 停下，写到 IMPLEMENTATION.md |
| `workers/verify.md` | 验证者 | 只看 spec + diff。范围外的东西 = 即时失败。删除/跳过测试 = 即时失败 |

---

## 5 · 信任账本（BUILD 4）

### 核心机制

"随信任增长提高自主权"不是机制，一个带层级规则的 TSV 才是。自主权是 per-skill 的，不是 per-loop 的。

### 三级信任

| 层级 | 条件 | 行为 |
|------|------|------|
| **auto** | 20+ 次运行 AND 95%+ 通过率 | 无人值守自动提交 PR |
| **queue** | 10-19 次运行 AND 90%+ 通过率 | 验证后的草稿等人审查 |
| **watch** | <10 次运行 OR <90% 通过率 | 仅草稿，不自动执行 |

### 降级规则

- 10+ 次运行的 skill 降到 watch 时，自动打印 ALERT 到 stderr
- cron 会把这个 ALERT 邮件给你
- 降级是自动的、响亮的

### Skill 定义

每个 `loop/skills/<name>/SKILL.md` 包含：
- frontmatter（name, description, when）
- steps
- never list
- verifiable done-when
- 每个 skill 从 watch 起步

---

## 6 · 常设目标与目标账本（BUILD 5）

### 核心理念

> 你只验证一次的目标是带时间戳的假设。

完成的东西"毕业"为不变量，每天重新验证，永久运行，不会静默腐烂。

### 目标文件格式

```markdown
predicate: cd $REPO && npm test -- tests/auth 2>&1 | tail -1 | grep -q passing
born: 2026-07-06
status: satisfied
last-pass: 2026-07-06
on-violation: wake me. Do not auto-fix.
retire-when: auth module deleted. Retirement is a human decision, logged.
```

### 谓词规则

- 是一个命令，exit 0 = 不变量成立
- 廉价、确定性、只读
- 禁止形容词——如果 shell 脚本检查不了，验证器也检查不了
- 非代码谓词同理：`find invoices/overdue -mtime +45 | wc -l` 输出 0

### 毕业定律

CLAUDE.md 中已内置：每个通过的 `/goal` 自动写入自己的 standing goal。**完成即是注册**。

### 哨兵行为

- 只检测，不修复
- 发现违反时：读取 last-pass 日期，列出此后合并的内容作为嫌疑
- 修复走正常管道

### 账本查询

```bash
# 最不稳定的 Top 5
awk -F'\t' '$3=="FAIL"{n[$2]++} END{for(g in n) print n[g],g}' memory/goal-ledger.tsv | sort -rn | head -5

# 某目标何时坏的
grep <goal> memory/goal-ledger.tsv | awk -F'\t' '$3=="FAIL"' | head -1
```

---

## 7 · 预算系统（BUILD 6）

### 成本公式

```
日成本 = ticks × triage($0.01) + hits × (conductor($0.35) + worker($0.10) + verifier($0.40))
```

- 每日清洁工 ≈ \$2.56/天
- Fable 做 triage 的 15 分钟保姆 = \$34/天，结果完全相同
- **读取安静心跳的模型决定了账单**

### 成本控制规则

- 频率是成本决策（间隔减半 = 底价翻倍）
- 安静心跳必须花几分钱
- 循环内 effort 永不超过 high
- `cost-check.sh` 在每次循环前后检查日预算
- 超预算 → 退出码 3，停止

---

## 8 · 可选循环（BUILD 7）

每个循环都有安装条件——投机性安装是系统膨胀的方式。

### Quorum（法定人数）

**安装条件**：dispatch 显示 Fable 被唤醒但产出了 `action: stop`。

三个廉价模型投票，Fable 在 2/3 同意时才被唤醒。投票者互不可见。

```bash
V=0
for m in deepseek-v4-flash qwen-3.6 kimi-k2.6; do
  llm -m "openrouter/$m" -s "$(cat triage.md)" < /tmp/signals.txt \
    | grep -q "status: actionable" && V=$((V+1))
done
[ "$V" -ge 2 ] && exec ./conduct.sh || echo "quorum: quiet ($V/3)"
```

### Ratchet（棘轮）

**安装条件**：一个数字重要时。

单调改进或自我回滚。指标不可被操纵。完成的下限成为 standing goal。

- 数字永远只能下降
- 任何提升数字或破坏测试的变更都要回滚
- 永不编辑配置来降低数字
- 3 次尝试无进展就停

### Sparring（对练）

**安装条件**：你每天发布代码时。

Builder 和 Breaker 对立。谁都不碰对方的输出。争议交给你。

- Breaker：每天读昨日合并的 diff，写一个失败的测试暴露真实弱点
- Builder：如果 @sparring 测试失败，修代码直到通过
- 永不编辑、弱化或删除 sparring 测试

### Compost（堆肥）

**安装条件**：始终安装，每周运行。

失败变成法律。最多 3 条提议。需要人类签名。

- 读本周的 exhaust：FAILED in STATE.md、trust.tsv 中的 fail、goal-ledger.tsv 中的 FAIL、关闭未合并的 PR
- 提取最多 3 条提议：新 CLAUDE.md 法律 / skill 修复 / 缺失的 standing goal
- 只提议，不执行

---

## 9 · 运维（BUILD 8）

### Makefile

```makefile
tick:            ; ./loop/loop.sh
queue:           ; @grep -E "review:|queued:|FAILED:|rerouted" loop/memory/STATE.md
trust:           ; @./loop/scripts/trust-log.sh --render
audit:           ; @./loop/scripts/cost-check.sh --report
goals:           ; @./loop/verify-goals.sh
clean-worktrees: ; @git worktree list | awk '/wt-/{print $$1}' | xargs -rn1 git worktree remove --force
```

### Cron

```text
0 7 * * 1-5  cd /path/to/repo/loop && ./loop.sh >> memory/cron.log 2>&1
30 7 * * *   cd /path/to/repo/loop && ./verify-goals.sh >> memory/cron.log 2>&1
```

### 30 天信任时间表

| 周 | 层级 | 你做的事 | 毕业条件 |
|----|------|---------|---------|
| 1 | L1 报告 | 手动 `make tick`；读所有东西 | 连续 3 次路由完全如你所愿 |
| 2 | L2 草稿 | cron 开启；喝着咖啡 `make queue` | 2 个 skill 跨过 20 次运行 |
| 3 | L3 发布 | `make audit` 对比公式；最佳 skill 无人值守 | 1 周零干预 |
| 4 | L4 成长 | 堆肥签名；批准 1 个提议的 skill；运行删除 | 你删了东西且没坏 |

### 运行手册

| 信号 | 含义 | 行动 |
|------|------|------|
| exit 2 (reroute) | 路由器中途换了模型 | 读检查点；明天重跑；不迭代被换的输出 |
| stop_reason: refusal | 安全分类器拒绝（HTTP 200） | 回退到 Opus 4.8；如果某 skill 反复触发，审计它 |
| exit 3 (budget) | 日花费触线 | `make audit`；找哪个阶段涨了；修 effort map，不是修预算 |
| ALERT demoted | 已建立的 skill 降到 90% 以下 | 读最近 3 次失败；通常是 spec 模式问题 |
| goal VIOLATED | 完成的东西不再是真 | 哨兵给嫌疑；修复走正常管道 |
| standoff x2 | 制造者/检查者两次不一致 | 你决定，或跑第三个新鲜审查者 |
| verify-goals timeout | 谓词太贵 | 那是违规；让谓词更便宜 |

---

## 10 · 核心法则速查表

1. **法律，不是建议**：一个数字、一个 never、或一个检查命令。
2. **Conductor 规划，worker 执行，谁都不验证。** `--allowedTools` 强制执行。
3. **Agent 用工单对话。** `done_when` = spec + 停止条件 + 未来不变量。
4. **在循环分支处花 effort。** 循环内永不超过 high。
5. **安静心跳花一分钱，否则循环花一千块。**
6. **如果 shell 脚本检查不了，就不要写成目标。**
7. **目标毕业，不关闭。** `verify-goals.sh` 每天运行，永久。
8. **自主权 per skill**：20 次运行，95%，auto。降级自动且响亮。
9. **两个账本**：trust（workers）和 goals（work）。喝咖啡时都读。
10. **计算代谢率再上 cron。**
11. **仓库里的契约**：acts-alone / queues / wakes-me。
12. **永远不迭代非你选的模型的输出。**
13. **哨兵检测，管道修复。**
14. **唤醒 Fable 前先 Quorum。棘轮然后焊死。每天 Sparring。每周 Compost。**
15. **一次一个毕业标准。每月删点东西。**

---

## 11 · 文件结构总览

```
your-repo/
  CLAUDE.md                    # BUILD 1: 宪法
  loop/
    loop.sh                    # BUILD 3: 心跳
    conductor.md               # BUILD 3: 指挥官 prompt
    triage.md                  # BUILD 3: 廉价读者 prompt
    contract.md                # BUILD 2: 三级行动契约
    workers/implement.md       # BUILD 3: 执行者 prompt
    workers/verify.md          # BUILD 3: 验证者 prompt
    guardrails/verify.sh       # BUILD 2: 确定性守门员
    scripts/trust-log.sh       # BUILD 4: 信任账本
    scripts/log-cost.sh        # BUILD 6: 成本记录
    scripts/cost-check.sh      # BUILD 6: 预算检查
    quorum.sh                  # BUILD 7: 法定人数（可选）
    verify-goals.sh            # BUILD 5: 目标验证
    goals/                     # BUILD 5: 常设目标
    skills/                    # BUILD 4: 每个 skill 一个文件
    memory/
      STATE.md  trust.tsv  goal-ledger.tsv  dispatch.tsv  usage.log
  Makefile                     # BUILD 8: tick/queue/trust/audit/goals
```

---

## 12 · 与现有体系的关联

### 与 Harness 四层体系的关系

本文的 Agentic OS 是 [Harness工程学习总结](/posts/obsidian/harness-engineering/) 的完整实践：

| Harness 层 | Agentic OS 对应 |
|-----------|----------------|
| Super Powers（纪律层） | CLAUDE.md 的 NEVER 区块 + verify.sh 确定性门禁 |
| GSD（上下文层） | 每次执行在隔离 worktree + 新鲜上下文验证者 |
| G-Stack（角色层） | conductor / worker / verifier 四角色分离 |
| Archon（编排层） | loop.sh 五阶段流水线 + cron 调度 |

### 与环路工程的关系

[环路工程-卡帕西方法](/posts/obsidian/karpathy-loop/) 的三要素在本文中直接映射：

| 环路要素 | Agentic OS 实现 |
|---------|----------------|
| 验证器 (Verifier) | workers/verify.md + guardrails/verify.sh（双重验证：AI + 确定性脚本） |
| 状态 (State) | memory/STATE.md + trust.tsv + goal-ledger.tsv |
| 停止条件 (Stop Condition) | done_when 谓词 + MAX_ITERS + DAILY_BUDGET_USD |

### 核心差异与增量

本文的独有贡献：
1. **Trust Ledger**：per-skill 信任分级，自主权随测量通过率动态授予/撤销——这是 Harness 体系中没有的
2. **Standing Goals**：完成的工作毕业为永久不变量，每天重新验证——解决了"通过一次后静默腐烂"的问题
3. **成本公式**：把模型选择直接量化为美元，安静心跳 = \$0.01 vs 保姆 = \$34/天
4. **四角色分离**：planner / worker / verifier / gate，最后一个确定性——比 G-Stack 的"角色分离"更彻底
5. **Compost 循环**：系统每周从自己的失败中提取改进提议——自我进化机制

---

## 13 · 行动清单

- [ ] 审计现有 CLAUDE.md / 系统指令：每条规则是否有数字、never 或检查命令？
- [ ] 建立 `verify.sh`：在加入任何自动化之前，确定性守门员必须先绿
- [ ] 实现五阶段心跳的最简版本：triage → conduct → execute → verify → gate
- [ ] 为每个重复性 chore 创建 skill 文件，从 watch 层级起步
- [ ] 为最近完成的 3 件事写 standing goals，谓词必须是 shell 命令
- [ ] 追踪一周的实际成本，对比公式验证
- [ ] 30 天信任时间表：每周一个毕业标准，不跳级
- [ ] 每月运行删除：删掉不用的 skill / 过时的 goal / 多余的规则

---

原笔记来源：How to Build An Agentic OS using Fable 5 (Builder's Guide)
