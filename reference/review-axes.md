# 六轴评审标准

项目 `AGENTS.md` 的同名章节优先；没有项目规则时使用下列默认来源。

| 轴 | 前缀 | 默认来源 | 核查问题 | 子 agent 能力档 |
|---|---|---|---|---|
| Design | `D` | [design.md](../practice/design.md)，按需读取 [yagni.md](../practice/yagni.md) 与 [deep-module.md](../practice/deep-module.md) | 是否复用了成熟能力；模块职责和依赖方向是否清楚 | 判断档 |
| Clean | `C` | [clean.md](../practice/clean.md) | 是否存在重复、死代码、过长逻辑或无职责的中间层 | 判断档 |
| Conventions | `N` | [conventions.md](conventions.md)、logging/database practice | 命名、目录、日志和迁移是否符合仓库约定 | 默认主 agent；需要子 agent 时用轻量档 |
| Testing | `T` | [test.md](test.md) | 测试层、Mock、测试设计和回归是否覆盖实际风险 | 轻量档 |
| Stack | `K` | 与代码差异对应的 TypeScript、React、Node、Electron 实践文档 | 是否违反当前技术栈的关键实践 | 轻量档 |
| Spec | `S` | Story、PRD、测试设计和用户意图 | 是否缺实现、做错、超出范围或产生文档漂移 | 轻量档 |

轴一律使用全名，不另编 A–F。能力档是意图，不是产品型号。判断档：与父会话同级，或已有模型里判断力最强的一档。轻量档：更快、更省的编码模型；没有单独轻量档时退回父会话模型。报告写实际用的档和运行时模型标识，不要在规则里写死某个模型名。

## 评审深度

先定深度，再选轴。用户说「review 所有未提交」只扩大文件范围，不升为全量。

| 深度 | 何时 | 运行的轴 |
|---|---|---|
| WIP | 默认。用户未点名全量、六轴、合并前、准备提交 | **Design、Clean、Stack**。最多三个子 agent。Design / Clean 用判断档，Stack 用轻量档 |
| 全量 | 用户点名全量、六轴、合并前、准备提交，或明确要求交付评审 | 下表适用轴；未点名的轴按「范围调整」跳过 |

WIP 不跑 Spec、Conventions、Testing。主 agent 在扫路径时如果看到明显的命名或目录违规，写进 Open questions，不为此另启轴。

报告必须记录深度、运行和跳过的轴及原因，以及每个子 agent 的能力档和实际用到的模型。

## 范围调整

在全量深度上再收：

- 仅文档改动：运行 Spec；命名或目录约定相关时由主 agent 做 Conventions，不启子 agent。
- 没有生产代码：跳过 Stack。
- 没有测试改动，且不是缺陷修复或新功能：跳过 Testing。
- 仅涉及单个文件的极小样式改动：Design 与 Clean 可由一个判断档子 agent 检查，但仍分别记录两个评审轴的结果。
- 父会话已按机器检查落点跑过该包 lint（含 React Doctor）或已有 `docs/reviews/<stem>-react-doctor.json`：Stack 轴**不要**再跑 Doctor、不要再读 [react.md](../practice/react.md)，只读 TypeScript / Node / Electron 中实际改到、且工具未覆盖的实践。Doctor / lint 能报的问题不在 Stack 重复列出。
- Conventions：主 agent 先读父会话的 lint / 机器检查摘要和 `git diff --name-status`。工具已报的不写 Finding。只有工具覆盖不了的剩余项（名实、平行域动词、目录语义）超过两条，才启轻量档子 agent；输入只给新增路径和导出名，不让子 agent 再扫全库。
- Clean：只根据 diff 找重复、死代码和过长逻辑；工具已经报告的问题不重复列出。

未点名全量时，即使 diff 很大也保持 WIP 深度，用第 1 节的范围问题切开文件，而不是加轴。

## 各轴关注点

### Design

先按 [design.md](../practice/design.md) 检查成熟能力复用、模块职责、依赖方向、外部系统和旧版兼容代码。能显著删除代码时，将该问题项放在决策清单首位；全量深度若写架构概览，也放在概览里。涉及实现范围或新模块时，再读取 YAGNI 或深模块规则。

### Clean

按 [clean.md](../practice/clean.md) 检查局部代码是否容易阅读、修改和删除。坏味道是判断线索，不是硬性违规；工具已经报告的问题不重复列出。

“应使用成熟库”属于 Design，不在 Clean 重复报告。

### Conventions

检查项目规定的文件与符号命名、目录归属、日志和数据库迁移。面向用户的回复用语不属于本轴。优先用路径清单判断，不要为核对文件名去读文件正文。

### Testing

检查测试是否验证外部行为和持久化后的最终状态，测试层是否匹配风险，Mock 是否替代了本应真实参与测试的内部协作，缺陷修复是否先有复现测试，测试设计与实现是否一致。

### Stack

只读取代码差异涉及、且尚未被 React Doctor 覆盖的实践文档。把 lint、typecheck、test、build 的适用要求纳入交付检查，不报告工具可以自动修复的格式问题。

### Spec

逐项对照验收标准和用户意图，区分缺失、错误、范围扩张和文档不一致。本轴只在全量深度运行。按设计阶段已写好的 Story、PRD 和测试设计对照，不要因为评审省 token 而降低对需求文档完整性的要求。没有正式 Spec 时，明确来源仅为对话意图，并只报告有证据支持的偏差。
