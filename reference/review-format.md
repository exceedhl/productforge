# 六轴评审报告格式

## 问题项编号

编号由轴前缀和两位序号组成：Design `D-01`、Clean `C-01`、Conventions `N-01`、Testing `T-01`、Stack `K-01`、Spec `S-01`。

同一问题跨轴时只保留一个主编号，在卡片中标明相关轴。不要删除问题项来换编号；已有报告追加内容时保留原卡片。

严重度：

- `P0`：正确性、数据、安全或契约破坏。
- `P1`：架构边界错误或会持续放大的坏味道。
- `P2`：规范、测试或可维护性问题。
- `P3`：风格与可选优化。

## 问题项必须包含的信息

每条问题项必须让尚未读过这批改动的人知道：

1. 涉及运行时行为时，用户从哪个入口触发了什么，代码按什么顺序执行，问题发生在哪一步。
2. 涉及文档、配置或命名时，读者从哪里看到它，它会误导哪些后续文档、实现或测试。
3. 哪条项目规则或评审标准被违反。
4. 会造成什么具体后果。
5. 可以立即修改、暂时接受，还是应先设计。

```markdown
<a id="d-01"></a>
### D-01 [P1] 短标题
- **轴**: Design
- **位置**: [backend/path/file.ts:12-40](../../backend/path/file.ts#L12)
- **现象**: 场景、调用顺序和问题发生的位置。
- **为何是问题**: 标准及其在此处的含义。
- **影响**: 具体后果。
- **可选下一步**:
  1. **立刻改** — …
  2. **可接受** — 接受条件和重新评估时机。
  3. **先设计再动** — 需要先决定什么。
```

无发现的轴写“无发现”，并说明检查范围。WIP 深度只给已运行的轴开章节；跳过的轴写在报告头的 Axes 行，不要空开四节「无发现」。

## 代码位置

报告位于 `docs/reviews/`，因此代码链接使用仓库根相对路径：

```markdown
[backend/foo.ts:53-79](../../backend/foo.ts#L53)
```

区间只写在链接文字中，锚点只使用起始行。`backend/`、`frontend/`、`packages/`、`desktop/` 前缀为 `../../`；`docs/` 下的同级文档前缀为 `../`。

P0 / P1 的主要代码位置后可附一段从文件读取的真实代码，**不超过 8 行**；能用链接说清时不要贴围栏。P2 / P3 只放链接，不放代码围栏。

````markdown
```53:60:backend/foo.ts
function example() {
  // 文件中的真实内容，不超过 8 行
}
```
````

片段超过 8 行时只保留问题相关部分并用注释标明省略。每条问题项使用 1–3 个主要代码位置。决策清单（Decision Board）只放链接，不放代码围栏。

## 报告

路径：`docs/reviews/<YYYY-MM-DD>-<slug>.md`。文件已存在时增加序号或时间。

报告头必须写清深度和模型：

```markdown
- **Depth**: WIP | 全量
- **Axes run / skipped**: …
- **Models**: Design 判断档（实际模型…）；Clean 判断档（实际模型…）；Stack 轻量档（实际模型…）；…
```

### WIP 深度

```markdown
# Review: <slug>

- **Base**: `<base>`
- **Head / workspace**: …
- **Date**: …
- **Depth**: WIP
- **Commits**: …
- **Axes run / skipped**: Design, Clean, Stack 已运行；Testing 按测试文件是否变化运行或跳过；其余跳过（WIP）
- **Models**: …

## Scope
## Findings index
## Design
## Clean
## Testing（测试文件有变化时）
## Stack
## Decision Board
## Open questions
```

不写 Architecture Brief。Decision Board 只收录 P0 / P1。P2 / P3 可留在轴章节，不进清单。

### 全量深度

```markdown
# Review: <slug>

- **Base**: `<base>`
- **Head / workspace**: …
- **Date**: …
- **Depth**: 全量
- **Commits**: …
- **Axes run / skipped**: …
- **Models**: …

## Scope
## Architecture Brief
## Findings index
## Design
## Clean
## Conventions
## Testing
## Stack
## Spec
## Decision Board
## Open questions
```

架构概览（Architecture Brief）只在全量深度编写，按照 [understand.md](understand.md) 的读者模型：先说明用户侧变化和关键术语，再按调用顺序解释主路径与分层。随后补充可替代的成熟能力、模块职责或依赖关系如何变化、最值得先改的一项和明确不应修改的部分。存在多入口或跨层调用时使用分层图和关键路径时序图。不要为写这一节去通读与问题项无关的文件。

决策清单收录需要处理的问题项，包含优先级、ID、建议动作、成本、不处理的后果和主要代码位置。WIP 深度只放 P0 / P1。全量深度排序依次考虑：可显著删除代码的成熟能力替换、P0、阻塞交付的 Spec、影响会持续扩大的架构问题、其他问题。不要用排序合并或掩盖轴间分歧。

向用户回复时给出报告路径，先用易懂的语言解释总体结论和关键术语，再摘要决策清单；完整内容以报告文件为准。
