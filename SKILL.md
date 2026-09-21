---
name: lh
description: >-
  Product and software workflow for strategy, requirements, architecture,
  testing, structured code walkthroughs, and six-axis review. Use when the
  user invokes /lh or clearly requests one of those structured workflows;
  do not use for routine targeted code questions.
---

# lhkit

一个入口，六条产品与研发工作流。

## 每次调用

1. 读取 [llm-output.md](reference/llm-output.md)；本会话已经读取时不重复加载。
2. 读取仓库 `AGENTS.md` 或等价规则。项目约定优先于本 skill 默认。
3. 根据用户意图选择一条命令，先读取该命令的主参考文档，再按其中指引加载必要资料。
4. 修改已有文档，不另建平行目录或重复产物。

## 命令

| 命令 | 目标 | 参考文档 |
|---|---|---|
| `strategy` | 为产品定位、竞争和商业模式提供决策依据 | [strategy.md](reference/strategy.md) |
| `prd` | 让画像、旅程、Story、PRD 和指标可追溯 | [prd.md](reference/prd.md) |
| `arch` | 记录技术取舍、架构与部署方案 | [arch.md](reference/arch.md) |
| `test` | 按风险设计测试或补写测试代码 | [test.md](reference/test.md) |
| `understand` | 按范围与视图生成整体架构、调用顺序、改动或测试结构导览 | [understand.md](reference/understand.md)；架构 / 时序图由 [scripts/understand](scripts/understand/cli.mjs) 从 Walkthrough IR 渲染 |
| `review` | 按深度评审改动并写入报告；默认 WIP 跑 Design / Clean / Stack，测试变化时追加 Testing | [review.md](reference/review.md) |

调用形式：`/lh <command> <自然语言描述或对象>`。不增加第三级子命令。

## 路由

1. 用户点名命令时，直接进入对应参考文档。
2. 用户未点名但意图明确时，选择最匹配的一条：定位与竞品走 `strategy`；需求与指标走 `prd`；技术方案与部署走 `arch`；测试走 `test`；明确要求结构化代码导览、整体架构 / 时序可视化或改动讲解时走 `understand`；判断改动是否需要修改时走 `review`。
3. 两条命令都合理且会产生不同结果时，只问一个能决定路线的问题。
4. 只输入 `/lh` 时，根据仓库现状推荐 2–3 个下一步并说明理由，不自动执行。

`understand` 讲解现有实现；`review` 评判是否应修改。不要混用。

单个函数、类、文件或短代码片段的直接问题不自动进入 `understand`；直接读取必要代码后回答。故障诊断、实现请求、未来架构设计和代码评审也不因涉及代码解释而触发 `understand`。用户只说「解释一下」「看一下」且没有明确范围时，只有在其意图确实是结构化导览时才进入，并按 `understand.md` 询问范围。

## 共享完成条件

- 产出回答了用户当前要做的决策，并明确 In-Scope / Out-of-Scope。
- 上游内容变化后，只检查确实受影响的下游内容：战略、画像/旅程、Story、PRD、架构、测试设计、测试与代码。
- 战略、需求、架构、ADR、测试设计和 Walkthrough 文档包含 `last_updated`、`status`；有关联 Story 时包含 `related_stories`。
- 评审报告使用专用报告头；`understand` 默认只在对话中输出，用户要求时才写入文件。
- 只加载当前任务需要的 `practice/` 实践文档，不把无关技术栈加入上下文。
- 规则正文是要求，不因工具能检查而删除。确定性检查优先进入各包 lint；`/lh review` 父会话按项目机器检查落点跑命令并复用产出，子 agent 不自行扫描。

## 默认路径

| 文档 | 默认 |
|---|---|
| 战略三件套 | `docs/strategy/*.md` |
| 画像 + 旅程 | `docs/user_persona_journey.md` |
| Backlog / Stories | `docs/user_stories.md` |
| PRD | `docs/prd/[ID]_[Brief].md` |
| 架构 | `docs/technical_architecture.md` |
| ADR | `docs/adr/`（项目可改写） |
| 测试设计 | `docs/testing/` |
| 评审报告 | `docs/reviews/` |
| 阅读导览 | `docs/design/[ID]_Walkthrough.md`（仅 `understand` 且用户要求写入文件） |

## 按需参考

| 文件 | 何时读 |
|---|---|
| [reference/conventions.md](reference/conventions.md) | review Conventions 轴的精简默认清单；项目细则在仓库 `AGENTS.md` |
| [practice/design.md](practice/design.md) | Design 轴；模块职责、依赖方向与技术选择 |
| [practice/clean.md](practice/clean.md) | Clean 轴；局部代码质量与坏味道 |
| [practice/yagni.md](practice/yagni.md) | Design 轴；任何实现/评审 |
| [practice/deep-module.md](practice/deep-module.md) | Design 轴；出现新模块边界时 |
| [practice/typescript.md](practice/typescript.md) | 改了 TS |
| [practice/react.md](practice/react.md) | 改了 React |
| [practice/node.md](practice/node.md) | 改了 Node 服务端 |
| [practice/electron.md](practice/electron.md) | 改了 Electron |
| [practice/logging.md](practice/logging.md) | 改了日志 |
| [practice/database.md](practice/database.md) | 改了 DB / 迁移 |

`practice/` 是参考资料，不是命令。

## 维护约定

除平台要求的 `SKILL.md` 外，本 skill 内的 Markdown 文件名一律使用小写 kebab-case；重命名文件时同步更新所有引用。
