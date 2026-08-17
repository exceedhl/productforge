# Review

`/lh review`

相对某个 git 基线做 **6 轴并行 review**。基线写在话里即可（如「相对 origin/main」）。

借鉴通用双轴 code-review 的骨架（定基线 → 定范围 → 并行 subagent → 聚合）。轴是 Design / Clean / Conventions / Testing / Stack / Spec。

### 标准源

默认用本 skill 的 `practice/` 与 [test.md](test.md)。若当前仓库有 `AGENTS.md`，其中对应轴的项目约定优先。没有 `AGENTS.md` 也能跑：Conventions / Stack 只靠 `practice/`；Spec 在用户确认无正式文档后只报 scope creep / 文档漂移，并注明「无正式 Spec」。

## 何时使用

- 用户要求 full review / 多轴 review / `/lh review`
- 用户要求 review 分支 / PR / 相对某 commit 的改动 / 工作区未提交改动
- 用户说「跑 full-review skill」「跑 review skill」

## 总流程（父 agent）

### 1. 定基线与范围

1. 固定点：用户指定的 commit / branch / tag / `origin/main` / `HEAD~N`。未指定则询问；常用默认 `origin/main`。
2. 校验：`git rev-parse <base>` 成功；diff 非空（含工作区时见下）。
3. **默认包含工作区**：`git diff <base>...HEAD` **加上** unstaged / untracked（与「main 上所有修改」用法一致）。用户只要已提交范围时再收窄。
4. 采集：`git log <base>..HEAD --oneline`、`git diff <base> --stat`（及工作区 diff）、变更路径列表。
5. 标出触及的主要目录（例如仓库里的 `frontend/` / `backend/` / `desktop/` / `packages/shared/` / `docs/`，有什么标什么）。

坏 ref 或空 diff → **在此失败**，不要空跑 subagent。

### 2. 解析 Spec 来源

按序：

1. commit / PR 中的 issue 引用（若有 issue-tracker 工作流则拉取）
2. 用户给出的 PRD / Story / 意图路径
3. `docs/user_stories.md`、`docs/prd/`、`docs/testing/` 中与分支或改动匹配的文档
4. 对话中的显式意图清单

都没有 → 问用户；用户确认无 Spec → Spec 轴只报 scope creep / 文档漂移风险，并在报告注明「无正式 Spec」。

文档与代码是否一致（PRD AC、测设、实现）由 **Spec** 轴（外加 Testing 看测设）负责，不是单独命令。

### 3. 并行 6 轴 subagent

同一轮消息内启动 **最多 6** 个 `generalPurpose` subagent（可按折叠规则 skip）。每个 prompt 必须包含：

- base、diff 命令、commit 列表、变更路径
- 本轴必读标准文件路径（`practice/` / `test.md`；若有 `AGENTS.md` 则加上对应轴）
- **强制 Finding 卡片模板**（见「产出格式」）
- 要求：引用代码前先 `Read` 文件；位置用 `` `startLine:endLine:path` ``；禁止无行号的一句话结论

| 轴 | 名称 | 标准来源 | 焦点 |
|----|------|----------|------|
| **A** | Design | `practice/yagni.md`、`practice/deep-module.md`（`AGENTS.md` Design 若有则优先） | **优先：成熟库 / 已有能力能否替代本次自造**；YAGNI、深模块、Legacy 边界、Shotgun / Feature Envy、职责链 |
| **B** | Clean | 本文件 Smell 基线（`AGENTS.md` Clean 若有则优先） | 坏味道、重复、巨型函数、死代码（**不含**「该用成熟库」——归 Design） |
| **C** | Conventions | `practice/logging.md`、`practice/database.md`（`AGENTS.md` Conventions 若有则优先） | 命名、目录、日志、迁移 |
| **D** | Testing | [test.md](test.md)（`AGENTS.md` Testing 若有则优先） | 分层、Bugfix 先红测、Mock 边界、测设文档、实现细节锁死 |
| **E** | Stack | 按 diff 加载 `practice/typescript.md` / `react.md` / `node.md` / `electron.md`（`AGENTS.md` Stack 若有则优先） | 栈实践（含各 practices 文件中的自检约定） |
| **F** | Spec | 已解析的 PRD/Story/测设/意图（`AGENTS.md` Spec 若有则优先） | 缺实现、做错、scope creep、文档与代码不一致 |

#### 折叠规则（父 agent 决定，须写入报告）

- 无测试改动且非 Bugfix / 新功能 → 可 skip **D**
- 仅 `docs/` → 主要跑 **F**（+ 必要时 C）
- 无 TS/React/Node/Electron 生产代码 → 可 skip **E**
- 极小单文件样式改动 → 可将 A+B 合并为一次，但仍用 Design/Clean 两类输出

### 4. 聚合并落盘

1. 汇总各轴卡片；同位点跨轴重复 → Decision Board 合并一行，正文可互链。
2. 写 **Architecture Brief**（主要来自 Design，可吸收 Clean/Conventions）。**若 Design 发现可用成熟库/已有模块替换大段自造，Brief 与 Decision Board 须置顶**，因往往能删掉大量代码并减少后续 review 面。
3. 写 **Decision Board**（行动建议，不抹平轴间分歧）。
4. **必须**将完整报告写入 Markdown 文件（见「报告落盘」）。
5. 向用户回复：报告路径 + Decision Board 摘要；正文不必全文粘贴（文件为准）。

**禁止**：把六轴揉成单一「谁赢」排序；禁止无行号的空泛结论；禁止替代改代码（除非用户另要求 fix）。

---

## Finding 卡片（每条必用）

```markdown
### [P0|P1|P2|P3] 短标题
- **轴**: Design | Clean | Conventions | Testing | Stack | Spec
- **位置**: `startLine:endLine:path`（多处列 1–3 个主位点）
- **现象**: 现在代码在做什么（2–4 句；可附关键片段）
- **为何是问题**: 对应标准（AGENTS 轴名 / practice 名 / test.md）
- **影响**: 正确性 / 架构复利 / 可维护 / 产品偏差 / 性能（择要）
- **可选下一步**:
  1. **立刻改** — …
  2. **可接受/记债** — 条件 …
  3. **先设计再动** — 指向 Architecture Brief
```

严重度：

- **P0** 正确性 / 数据 / 安全 / 契约破坏
- **P1** 架构边界错误或高复利坏味道
- **P2** 规范、测试缺口、可维护性
- **P3** 风格 / 可选优化 / 记债候选

无发现的轴：写「无发现」+ 一句话说明覆盖了什么。

---

## 报告落盘

### 路径

```
docs/reviews/<YYYY-MM-DD>-<slug>.md
```

- `<slug>`：短横线连接的主题，如 `origin-main-wip`、`feat-us-074`、分支名截断。
- 目录不存在则创建。
- 若同名已存在，加后缀 `-2`、`-3` 或时间 `HHmm`。

### 报告正文结构（按序）

```markdown
# Review: <slug>

- **Base**: `<base>`
- **Head / workspace**: …
- **Date**: …
- **Commits**: …
- **Axes run / skipped**: …

## Scope
（stat 摘要、主要路径）

## Architecture Brief
（**先写成熟库/已有能力能否替代**；再写依赖/职责链；边界变清晰还是变糊；最值得动的一刀；明确不要动的）

## Design
## Clean
## Conventions
## Testing
## Stack
## Spec

## Decision Board

| 优先 | Finding | 建议动作 | 成本 | 不做的后果 | 主位置 |
|------|---------|----------|------|------------|--------|
| 1 | … | 立刻改 / 记债 / 先设计 | S/M/L | … | `file:L–L` |

## Open questions
（0–3 个需用户拍板的问题）
```

Decision Board 排序 pragmatic：**成熟库/已有能力替换（Design）→ P0 正确性 → 阻塞合入的 Spec → 其余架构复利 → 其它**；每行链回 finding 标题与主位置。成熟库项即使严重度标 P1/P2，只要能显著删代码，仍可排在 Board 最前并注明「优先建议：先换库再细改」。

---

## Subagent prompt 要点（父 agent 拼装时遵守）

- **Design**：
  1. **先做成熟库 / 已有能力扫描**（对照 Design「Prefer Industry Standard Libraries」+ YAGNI「代码库里已经有了吗 / 已安装依赖能做吗」）：本次自造是否可用已安装依赖、标准库或仓库已有模块替代？
     - **此项优先于 Clean 轴细改坏味道**：能换库/复用则先出 **优先建议** 卡片，写清「可删大约何量代码 / 可避免哪些后续 review」，并在 Architecture Brief 与 Decision Board **置顶**。
  2. 再描述调用链与模块边界；YAGNI「该不该有」优先于「更抽象」；Legacy / 深模块 / 分层与内聚。
- **Clean**：函数名 + 行号；死代码与重复要指出两侧位置；**不要**再报「该用某某成熟库」（留给 Design，避免双轴重复）。
- **Conventions**：命名、目录归属、logger、migration（`practice/`；若有 `AGENTS.md` Conventions 则它优先）。
- **Testing**：有无测、分层、是否测实现细节、Bugfix 是否先复现。
- **Stack**：只加载触及的 practice 文件，并遵守其中的自检约定；按 practices 产出 Findings。
- **Spec**：引用 AC / 意图原文；缺 / 错 / creep / 文档漂移分条。

字数：有发现写透（单轴大约数百词）；Architecture Brief 在有架构触达时不宜过短。

---

## Smell 基线（Clean / Design 可引用）

仓库文档优先。下列为判断启发式（非硬违规）：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。工具已覆盖的（eslint/tsc）不要重复报。

---

## 与其它 review 的关系

- `/lh review` 是六轴 + 落盘报告。
- 通用双轴 code-review、Bugbot、Security Review 仍可用于轻量或专项场景。
