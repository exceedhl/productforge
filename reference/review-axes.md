# 六轴评审标准

项目 `AGENTS.md` 的同名章节优先；没有项目规则时使用下列默认来源。

| 轴 | 前缀 | 默认来源 | 核查问题 |
|---|---|---|---|
| Design | `D` | [design.md](../practice/design.md)，按需读取 [yagni.md](../practice/yagni.md) 与 [deep-module.md](../practice/deep-module.md) | 是否复用了成熟能力；模块职责和依赖方向是否清楚 |
| Clean | `C` | [clean.md](../practice/clean.md) | 是否存在重复、死代码、过长逻辑或无职责的中间层 |
| Conventions | `N` | [conventions.md](conventions.md)、logging/database practice | 命名、目录、日志和迁移是否符合仓库约定 |
| Testing | `T` | [test.md](test.md) | 测试层、Mock、测试设计和回归是否覆盖实际风险 |
| Stack | `K` | 与代码差异对应的 TypeScript、React、Node、Electron 实践文档 | 是否违反当前技术栈的关键实践 |
| Spec | `S` | Story、PRD、测试设计和用户意图 | 是否缺实现、做错、超出范围或产生文档漂移 |

轴一律使用全名，不另编 A–F。

## 范围调整

- 仅文档改动：运行 Spec；命名或目录约定相关时增加 Conventions。
- 没有生产代码：跳过 Stack。
- 没有测试改动，且不是缺陷修复或新功能：可以跳过 Testing。
- 仅涉及单个文件的极小样式改动：Design 与 Clean 可由一个子 agent 检查，但仍分别记录两个评审轴的结果。

报告必须记录运行和跳过的轴及原因。

## 各轴关注点

### Design

先按 [design.md](../practice/design.md) 检查成熟能力复用、模块职责、依赖方向、外部系统和旧版兼容代码。能显著删除代码时，将该问题项放在架构概览和决策清单首位。涉及实现范围或新模块时，再读取 YAGNI 或深模块规则。

### Clean

按 [clean.md](../practice/clean.md) 检查局部代码是否容易阅读、修改和删除。坏味道是判断线索，不是硬性违规；工具已经报告的问题不重复列出。

“应使用成熟库”属于 Design，不在 Clean 重复报告。

### Conventions

检查项目规定的文件与符号命名、目录归属、日志和数据库迁移。面向用户的回复用语不属于本轴。

### Testing

检查测试是否验证外部行为和持久化后的最终状态，测试层是否匹配风险，Mock 是否替代了本应真实参与测试的内部协作，缺陷修复是否先有复现测试，测试设计与实现是否一致。

### Stack

只读取代码差异涉及的实践文档。把 lint、typecheck、test、build 的适用要求纳入交付检查，不报告工具可以自动修复的格式问题。

### Spec

逐项对照验收标准和用户意图，区分缺失、错误、范围扩张和文档不一致。没有正式 Spec 时，明确来源仅为对话意图，并只报告有证据支持的偏差。
