---
name: lh
description: >-
  LH product & software kit (lhkit). Strategy (competitors, SWOT, lean canvas),
  PRD / persona / backlog / metrics, architecture and deploy design, test design
  and implementation, 6-axis code review, and reading walkthroughs of existing
  code. Use when the user invokes /lh, or asks for product-strategy,
  product-requirements, PRD, user stories, persona, journey, tech-design, ADR,
  testing, test design, full-review, multi-axis review, review since a git
  baseline, or to understand / walk through / explain a branch or feature's
  design so they can read the code.
---

# lhkit

Lucas 的产品与研发工具箱。一个 skill，六条子命令。

## Setup

点名 `/lh` 或意图落到本 skill 时，先做这些（每个会话做一次）：

1. 若用户点了子命令（`strategy`、`prd`、`arch`、`test`、`review`、`understand`），**必须**接着读对应 `reference/<command>.md`。不要只凭本文件开写。
2. 文档落在本文件默认路径。已有同路径文件则接着改，不要另开一套目录。若仓库有 `AGENTS.md`，其中的项目约定优先于本 skill 默认。

## 共享不变量

每条子命令都适用：

- 信息不够先引导提问，禁止空泛输出。
- 上游变更必须向下游传导（战略 → 画像/旅程 → Stories → PRD → 架构 → 测设 → 测试/代码）。
- 本 skill 写出的 Markdown（战略、画像/旅程、Backlog、PRD、架构、ADR、测设、Walkthrough）顶部 YAML 含 `last_updated`、`status`；有关联 Story 时再加 `related_stories`。Review 报告用自己的报告头，不用这套字段。`understand` 默认只写对话，用户要求落盘时才写 Walkthrough。
- 中文正文；文件名、ID、代码标识保留英文。
- 严格区分 In-Scope / Out-of-Scope。
- 栈规范按需读 `practice/`，不要在写 PRD 时加载 Electron 实践。

## 默认路径

| 文档 | 默认 |
|---|---|
| 战略三件套 | `docs/strategy/*.md` |
| 画像 + 旅程 | `docs/user_persona_journey.md` |
| Backlog / Stories | `docs/user_stories.md` |
| PRD | `docs/prd/[ID]_[Brief].md` |
| 架构 | `docs/technical_architecture.md` |
| ADR | `docs/adr/`（项目可改写） |
| 测设 | `docs/testing/` |
| Review 报告 | `docs/reviews/` |
| 阅读导览 | `docs/design/[ID]_Walkthrough.md`（仅 `understand` 且用户要求落盘） |

## Commands

调用形态：`/lh <command>`，后面跟自然语言和对象（Story ID、git 基线、文件路径）。**不要**再拆第三级子命令。

| Command | Category | Description | Reference |
|---|---|---|---|
| `strategy` | Discover | 竞品 / SWOT / 精益画布 | [reference/strategy.md](reference/strategy.md) |
| `prd` | Specify | 画像旅程 / Stories / PRD / 度量 | [reference/prd.md](reference/prd.md) |
| `arch` | Design | 架构 或 部署/环境 | [reference/arch.md](reference/arch.md) |
| `test` | Verify | 测设文档 或 写测试 | [reference/test.md](reference/test.md) |
| `understand` | Orient | 对着已有代码写阅读导览（路径 / 时序 / 分层） | [reference/understand.md](reference/understand.md) |
| `review` | Evaluate | 六轴并行 review，落盘报告 | [reference/review.md](reference/review.md) |

链路：`strategy` → `prd` → `arch` → `test` → 写代码 → `understand`（读懂）→ `review`。`understand` 与 `review` 都吃现成 diff；前者讲解，后者评判。

命令内部的阶段（画像 vs PRD、测设 vs 写测试、架构 vs 部署）从**用户原话**和仓库现状判断，不做成 `measure`、`deploy` 这类参数。

### Routing rules

1. **无参数**：根据 Setup 里看到的仓库信号，推荐 **2–3 个下一步**（各一行理由），再列出上表。**不要自动执行。**
   - 有代码、有脏 diff 或相对 `origin/main` 的改动 → 可推荐 `understand`（先读懂）或 `review`（要评判）
   - 有旅程/Stories、缺 PRD → `prd`
   - 有 PRD、缺测设 → `test`
   - 有战略空缺、产品还在定位 → `strategy`
   - 有 PRD、缺架构文档 → `arch`
2. **首词是命令**：读其 reference。其余文字是意图和对象，用来选该命令内部做哪一段。
3. **首词不是命令，但意图明确**：按表路由。两可则问一次。
   - 竞品 / SWOT / 画布 / 定价 → `strategy`
   - 写 PRD / 补 Story / 画像 / 旅程 / 成功指标 → `prd`
   - 技术方案 / ADR / 部署 / setup guide → `arch`
   - 补测试 / 测设 / Golden Dataset → `test`
   - 读懂 / 讲解改动 / 用户路径与时序 / 分层关系 / 帮我尽快了解这块代码 → `understand`
   - full review / 多轴 review / review 相对某基线 → `review`
4. **对不上**：只做 Setup，问一次要走哪条命令。

只点了命令、没说做哪一段时，按仓库现状推断（有旅程没 stories → 写 Backlog；有 story 没 PRD → 写 PRD；有测设或用户说「补测试」→ 写测试）。不确定则问一次。

子命令不要再重新走一遍 `/lh` 路由。

## practice/

通用栈规范，**不是**子命令。仅在 `review` 的 Stack / Design 轴，或当前改动就是那一栈时读取：

| 文件 | 何时读 |
|---|---|
| [practice/yagni.md](practice/yagni.md) | Design 轴；任何实现/评审 |
| [practice/deep-module.md](practice/deep-module.md) | Design 轴；出现新模块边界时 |
| [practice/typescript.md](practice/typescript.md) | 改了 TS |
| [practice/react.md](practice/react.md) | 改了 React |
| [practice/node.md](practice/node.md) | 改了 Node 服务端 |
| [practice/electron.md](practice/electron.md) | 改了 Electron |
| [practice/logging.md](practice/logging.md) | 改了日志 |
| [practice/database.md](practice/database.md) | 改了 DB / 迁移 |
