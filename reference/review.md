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
- 要求：引用代码前先 `Read` 文件；**位置必须带行号且在落盘报告里可点击**（见「代码位置」）；禁止无行号的一句话结论

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

1. 汇总各轴卡片；同位点跨轴重复 → Decision Board 合并一行，正文可互链。**落盘前**把 subagent 的行内 `` `53:79:path` `` 改成「`#L` 链接 + 围栏真实行」（见「代码位置」）；禁止 Decision Board 只写文件名、禁止不带行号。
2. 写 **Architecture Brief**（主要来自 Design，可吸收 Clean/Conventions）。**读者默认还没读过这批代码**（含 AI 生成后的首次 review），写法见下节。**若 Design 发现可用成熟库/已有模块替换大段自造，Brief 后半与 Decision Board 须置顶该项**，因往往能删掉大量代码并减少后续 review 面。
3. 写 **Decision Board**（行动建议，不抹平轴间分歧）。表内用语必须能在 Brief 的词表里找到解释。
4. **必须**将完整报告写入 Markdown 文件（见「报告落盘」）。
5. 向用户回复：报告路径 + **先用白话交代方向和 2–5 个关键术语** + Decision Board 摘要。禁止聊天回复一上来丢模块名 / AC 编号 / SPI。正文不必全文粘贴（文件为准）。

**禁止**：把六轴揉成单一「谁赢」排序；禁止无行号的空泛结论；禁止替代改代码（除非用户另要求 fix）。

---

## Finding 卡片（每条必用）

````markdown
### [P0|P1|P2|P3] 短标题
- **轴**: Design | Clean | Conventions | Testing | Stack | Spec
- **位置**: [`backend/foo.ts:L53–L79`](../../backend/foo.ts#L53-L79)

```53:79:backend/foo.ts
// Read 到的真实行
```

- **现象**: 现在代码在做什么（2–4 句）
- **为何是问题**: 对应标准（AGENTS 轴名 / practice 名 / test.md）
- **影响**: 正确性 / 架构复利 / 可维护 / 产品偏差 / 性能（择要）
- **可选下一步**:
  1. **立刻改** — …
  2. **可接受/记债** — 条件 …
  3. **先设计再动** — 指向 Architecture Brief
````

严重度：

- **P0** 正确性 / 数据 / 安全 / 契约破坏
- **P1** 架构边界错误或高复利坏味道
- **P2** 规范、测试缺口、可维护性
- **P3** 风格 / 可选优化 / 记债候选

无发现的轴：写「无发现」+ 一句话说明覆盖了什么。

---

## 代码位置（必须可点击、必须有行号）

Cursor 只把**围栏信息串** `startLine:endLine:path` 渲染成可点击、带行号的代码引用。行内反引号 `` `53:79:path` `` 只是等宽文字：**不能点、没有行号**。这是 `startLine:endLine:path` 的唯一合法写法。

Finding 的「位置」必须两件都写：

1. **Markdown `#L` 链接**（编辑器 Cmd/Ctrl+点击打开文件对应行）
2. **围栏引用**（信息串 `start:end:仓库根相对路径`，内贴该范围真实代码，才会出现行号）

报告在 `docs/reviews/` 时：

````markdown
- **位置**: [`backend/foo.ts:L53–L79`](../../backend/foo.ts#L53-L79)

```53:79:backend/foo.ts
function example() {
  // 文件里的真实行，不要编
}
```
````

`docs/` 下的文件 href 少一层：[`docs/prd/x.md:L126`](../prd/x.md#L126)。单行用 `#L126`，区间用 `#L53-L79`。

规则：

- 围栏信息串 = `startLine:endLine:仓库根相对路径`（不要 `./`、不要绝对路径、不要包反引号）。
- 围栏内必须是 `Read` 到的真实行。超过约 12 行则首尾各留几行，中间 `// ...`。
- 对照位点再写第二个「链接 + 围栏」，最多 3 个。
- Decision Board 表格里放不了围栏，只写 `#L` 链接，显示文本必须带完整路径和 `L` 行号。禁止 `foo.tsx:136`、禁止 `export vs publish service`。
- 聊天回复贴片段时用同一套围栏。

禁止：只写 `` `53:79:path` ``；禁止无行号；禁止空围栏。

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
（按「读者还没读过代码」写，结构见下节；成熟库项放在分层讲清之后、Decision Board 之前）

## Design
## Clean
## Conventions
## Testing
## Stack
## Spec

## Decision Board

| 优先 | Finding | 建议动作 | 成本 | 不做的后果 | 主位置 |
|------|---------|----------|------|------------|--------|
| 1 | … | 立刻改 / 记债 / 先设计 | S/M/L | … | [`backend/foo.ts:L53–L79`](../../backend/foo.ts#L53-L79) |

## Open questions
（0–3 个需用户拍板的问题）
```

Decision Board 排序 pragmatic：**成熟库/已有能力替换（Design）→ P0 正确性 → 阻塞合入的 Spec → 其余架构复利 → 其它**；每行链回 finding 标题与主位置。成熟库项即使严重度标 P1/P2，只要能显著删代码，仍可排在 Board 最前并注明「优先建议：先换库再细改」。

---

## Architecture Brief 读者模型

默认读者是 **刚看到这批 diff、还没建立心智模型的人**（人审 AI 代码是常态）。Brief 不是给已经熟悉调用链的人写的结论备忘。

按这个顺序写，缺一段就重写 Brief，不要用「依赖与职责链」四个字糊过去：

1. **用户侧在干什么**（5–8 句，不提文件名、不提 AC 编号）。
2. **本报告会用到的词**（每个一词一句。入站/出站、绑定、管道、本仓库黑话，第一次出现必须解释。禁止把领域隐喻当已知）。
3. **代码怎么走**（一张 mermaid 或编号步骤：谁调用谁；每个框一行职责 + 文件名。对照「这条边界为什么存在」用白话说，再括 AC/Design 编号）。
4. **成熟库 / 已有能力**（读者已经知道哪一层该干什么之后再写「该复用却没复用」）。
5. **边界变清晰还是变糊 / 最值得动的一刀 / 明确不要动的**。

禁止：第一句就是模块名并列 +「边界成立」；禁止 Brief 里出现未解释的 SPI、inbound/outbound、jobType、fire-and-forget。Finding 卡片可以密，Brief 必须疏。

**第一次点名必须先说它干什么**，禁止把文档编号、函数名当读者已知：

- 错：「ADR-002 欠债，继续走 `feishuFetchJson`。」
- 对：「ADR-002 规定业务路径禁止自拼 `open.feishu.cn/open-apis/...`，应调官方 `lark.Client`。现状是用户 OAuth 仍 `sdk: null`，`feishuFetchJson` 只是拿 token 再 `fetch(域名+路径)` 的薄封装。」

ADR、helper、管道、队列策略，都按「它实际做了哪一步」写，不要用「欠债 / 收口 / 接不上 Client」代替机制。

---

## Subagent prompt 要点（父 agent 拼装时遵守）

- **Design**：
  1. **先做成熟库 / 已有能力扫描**（对照 Design「Prefer Industry Standard Libraries」+ YAGNI「代码库里已经有了吗 / 已安装依赖能做吗」）：本次自造是否可用已安装依赖、标准库或仓库已有模块替代？
     - **此项优先于 Clean 轴细改坏味道**：能换库/复用则先出 **优先建议** 卡片，写清「可删大约何量代码 / 可避免哪些后续 review」，并在 Architecture Brief 与 Decision Board **置顶**。
  2. 再写 **Architecture Brief 草稿**，必须遵守「读者模型」五段（用户侧 → 词表 → 代码怎么走 → 成熟库 → 该动/不该动）。不要只交 Finding 卡片。
  3. 再描述调用链与模块边界；YAGNI「该不该有」优先于「更抽象」；Legacy / 深模块 / 分层与内聚。词先解释再评判。
- **Clean**：函数名 + 行号；死代码与重复要指出两侧位置；**不要**再报「该用某某成熟库」（留给 Design，避免双轴重复）。位置格式同「代码位置」（subagent 可先写 `start:end:path` 草稿；父 agent 落盘时必须改成「`#L` 链接 + 围栏真实行」）。
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
