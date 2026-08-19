# Review

`/lh review`

相对某个 git 基线做 **6 轴并行 review**。基线写在话里即可（如「相对 origin/main」）。

借鉴通用双轴 code-review 的骨架（定基线 → 定范围 → 并行 subagent → 聚合）。轴是 Design / Clean / Conventions / Testing / Stack / Spec。

## 标准源

默认用本 skill 的 `practice/`、薄默认 [conventions.md](conventions.md) 与 [test.md](test.md)。写作可读性遵守 [llm-output.md](llm-output.md)，**不要**把 LLM 输出约定当成 Conventions 轴评审项。若仓库有 `AGENTS.md`，**Conventions / Design / Clean / Testing / Stack / Spec 以仓库对应节优先**（本仓库命名、目录、日志、迁移细则在 `AGENTS.md` Conventions）。没有 `AGENTS.md` 时 Conventions 用本 skill 默认清单 + logging/database practice。

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
- 要求：引用代码前先 `Read` 文件；**位置必须是可点击 Markdown 链接**（见「代码位置」）；禁止无行号的一句话结论
- 要求：Finding「现象」与 Architecture Brief **按调用顺序写清**，不默认读者已熟悉 diff 里的文件（见「说明必须可读」）

轴一律用全名指代（`Design`、`Clean`、`Conventions`、`Testing`、`Stack`、`Spec`）。**不要**给轴另编 A–F 字母：`C`、`D` 已被 finding 前缀占用（见「Finding 编号」），两套字母并存会 skip 错轴。

| 轴 | 标准来源 | 焦点 |
|----|----------|------|
| **Design** | `practice/yagni.md`、`practice/deep-module.md`（`AGENTS.md` Design 若有则优先） | **优先：成熟库 / 已有能力能否替代本次自造**；YAGNI、深模块、Legacy 边界、Shotgun / Feature Envy、职责链 |
| **Clean** | 本文件 Smell 基线（`AGENTS.md` Clean 若有则优先） | 坏味道、重复、巨型函数、死代码（**不含**「该用成熟库」——归 Design） |
| **Conventions** | 仓库 `AGENTS.md` Conventions（若有）优先；否则 [conventions.md](conventions.md) + `practice/logging.md` / `database.md` | 命名、目录、日志、迁移（**不含**用语/可读性） |
| **Testing** | [test.md](test.md)（`AGENTS.md` Testing 若有则优先） | 分层、Bugfix 先红测、Mock 边界、测设文档、实现细节锁死 |
| **Stack** | 按 diff 加载 `practice/typescript.md` / `react.md` / `node.md` / `electron.md`（`AGENTS.md` Stack 若有则优先） | 栈实践（含各 practices 文件中的自检约定） |
| **Spec** | 已解析的 PRD/Story/测设/意图（`AGENTS.md` Spec 若有则优先） | 缺实现、做错、scope creep、文档与代码不一致 |

#### 折叠规则（父 agent 决定，须写入报告）

- 无测试改动且非 Bugfix / 新功能 → 可 skip **Testing**
- 仅 `docs/` → 主要跑 **Spec**（必要时加 **Conventions**）
- 无 TS/React/Node/Electron 生产代码 → 可 skip **Stack**
- 极小单文件样式改动 → 可把 **Design + Clean** 合并为一个 subagent，但输出仍分 Design / Clean 两类

### 4. 聚合并落盘

1. 汇总各轴卡片；同位点跨轴重复 → Decision Board 合并一行，正文可互链。**落盘前**把 subagent 的行内 `` `53:79:path` `` 改成「`#L` 链接 + 围栏真实行」（见「代码位置」）；禁止 Decision Board 只写文件名、禁止不带行号。
2. 写 **Architecture Brief**（主要来自 Design，可吸收 Clean/Conventions）。**读者默认还没读过这批代码**（含 AI 生成后的首次 review），写法见下节。**若 Design 发现可用成熟库/已有模块替换大段自造，Brief 后半与 Decision Board 须置顶该项**，因往往能删掉大量代码并减少后续 review 面。
3. 写 **Decision Board**（行动建议，不抹平轴间分歧）。表内用语必须能在 Brief 的词表里找到解释。
4. **必须**将完整报告写入 Markdown 文件（见「报告落盘」）。
5. 向用户回复：报告路径 + **先用白话交代方向和 2–5 个关键术语** + Decision Board 摘要（含 `D-01` / `T-01` / `S-01` / `K-01` / `N-01`）。摘要里每一行用本义说明页面/组件在做什么，不要只写内部符号。正文不必全文粘贴（文件为准）。追加图或改编号时保留全部原卡片。

**禁止**：把六轴揉成单一「谁赢」排序；禁止无行号的空泛结论；禁止替代改代码（除非用户另要求 fix）。

---

## Finding 编号（父 agent 聚合时赋予）

主编号 = **轴专用前缀** + `-` + 两位数字。轴内从 `01` 递增。

为避免 Clean(`C`) 与 Conventions、Stack 与 Spec 首字母冲突，约定如下（**不要**再用 `Co` / `Sp` / `St`）：

| 轴 | 前缀 | 示例 | 备注 |
|----|------|------|------|
| Design | `D` | `D-01` | |
| Clean | `C` | `C-01` | |
| Conventions | `N` | `N-01` | Naming / coNventions |
| Testing | `T` | `T-01` | |
| Stack | `K` | `K-01` | stacK |
| Spec | `S` | `S-01` | |

跨轴同位点 **只占一个主编号**（用问题所在的主轴），卡片写「亦见 Testing」；不要给同一处再编 `T-01`。

**禁止**为了换编号而删掉已有 finding 另写一份。不要再用全局 `F-01` 这种编号。

- 标题：`<a id="d-01"></a>` 后接 `### D-01 [P1] 短标题`（index / 互链用 `#d-01`）
- 对话、Board 一律引用 `D-01` / `T-01` / `S-01` / `K-01` / `N-01`，不要用「第三条 P1」
- 轴内 subagent 可用临时 `D-1`；**落盘前必须换成 `D-01` 这种两位**
- 改编号规则时：旧报告可保留历史 ID；新报告与追加卡片用新前缀。若用户要求统一旧报告，可原地改 ID / 锚点，但**不得删卡片正文**。

## 代码位置（必须可点击、必须有行号）

报告写在 `docs/reviews/`。位置字段是**相对仓库根的 Markdown 链接**，显示文本统一写 `完整路径:起始行-结束行`：

```markdown
[backend/modules/datasets/datasetDataStore.ts:606-635](../../backend/modules/datasets/datasetDataStore.ts#L606)
```

链接规则：

- **锚点只写单行**：单行位点 `#L200`，区间位点写起始行 `#L606`，区间范围只出现在显示文本里。**禁止 `#L606-L635`**：区间锚点在 Markdown 预览里不会跳行，Cursor 的 Preview 页还会把整个 `路径#锚点` 当成文件名而报找不到文件。
- **显示文本带完整路径**：禁止只写文件名（`foo.tsx:136`）、禁止无行号、禁止 `export vs publish service` 这类没有位置的描述、禁止只写 `` `start:end:path` ``。
- 从 `docs/reviews/*.md` 出发的相对路径前缀：

  | 目标 | 前缀 |
  |---|---|
  | `backend/` `frontend/` `packages/` `desktop/` | `../../` |
  | `docs/prd/` `docs/design/` `docs/testing/` 等同级文档 | `../` |

  同级文档示例：`[docs/prd/x.md:126](../prd/x.md#L126)`。

- 每条 finding 1–3 个主位点；Decision Board「主位置」、React Doctor 表「位置」同样用链接。
- 禁止无链接的纯反引号路径作为唯一位置。

### 链接之外再贴真实代码

Finding 的位置除链接外，再补一个**围栏引用**，让读者不点开也能看到那几行：

````markdown
- **位置**: [backend/foo.ts:53-79](../../backend/foo.ts#L53)

```53:79:backend/foo.ts
function example() {
  // 文件里的真实行，不要编
}
```
````

- 围栏信息串 = `起始行:结束行:仓库根相对路径`（不要 `./`、不要绝对路径、不要包反引号）。
- 围栏内必须是 `Read` 到的真实行。超过约 12 行则首尾各留几行，中间 `// ...`。
- 分工：**跳转靠 `#L` 链接**；围栏负责把代码摆在读者眼前，在**聊天回复**里会渲染成可点击、带行号的代码引用。所以两者都要写。
- 行内反引号 `` `53:79:path` `` 只是等宽文字，不能点也没有行号；`起始行:结束行:路径` 只有写在围栏信息串上才有效。
- 对照位点再写第二组「链接 + 围栏」，最多 3 个。
- Decision Board 表格里放不了围栏，只写链接。
- 聊天回复贴片段时用同一套围栏。

subagent 若只给了 `` `606:635:path` ``，父 agent **落盘时必须改成上述链接 + 围栏**，不得原样写入报告。禁止无行号、禁止空围栏。

## Finding 卡片（每条必用）

```markdown
<a id="d-01"></a>
### D-01 [P0|P1|P2|P3] 短标题
- **轴**: Design | Clean | Conventions | Testing | Stack | Spec
- **位置**: [backend/path/to/file.ts:12-40](../../backend/path/to/file.ts#L12)（多处列 1–3 个主位点，均为可点击链接）
- **现象**: 见下方「说明必须可读」。写清场景、调用顺序、问题出在哪一步；不要 2–4 句压缩结论
- **为何是问题**: 对应标准（AGENTS 轴名 / practice 名 / test.md）；用本义解释该标准在此处如何被违反
- **影响**: 正确性 / 架构复利 / 可维护 / 产品偏差 / 性能（择要）；写具体后果，不写空泛词
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

## 说明必须可读

Finding「现象」与 Architecture Brief 的写法遵守 skill 通用 [llm-output.md](llm-output.md)（**不是** Conventions 轴）。最低清单：

Finding **现象** 至少包含：

1. **场景**：哪个页面或入口、用户做什么操作（例如「Dataset 详情页点开组头」）。
2. **调用顺序**：谁调用谁、传入什么、返回什么、下一层拿去干什么。一步只推进一个环节。
3. **名字**：组件 / 函数 / 类型 / API 第一次出现时，先一句话说明职责再写标识符。
4. **对照**（若有两处相似逻辑）：相同的是哪几步，不同的是哪一步。
5. **问题落在哪一步**：不要先丢结论再补背景。这一条只约束 finding「现象」正文；向用户的对话回复仍按 [llm-output.md](llm-output.md) 结论先行。

合格的现象：先写表格组件用在详情页和下钻页；点开组头时表格只调用 props 上的回调，自己不请求 HTTP；两个页面各自实现该回调并请求不同 API；接口仍返回整页数据，所以还要从 `groups` 里取出一个组节点交给表格合并。然后再写「因此这段取出组节点的逻辑在两个页面各写了一遍」。

Architecture Brief 的写法见「Architecture Brief 读者模型」，那里同样要求按调用顺序写职责链、第一次出现的模块先解释。

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
（**先写成熟库/已有能力能否替代**；再按调用顺序写谁调用谁。有多入口或跨层时：**补一张分层图**（View / Controller / Service / Store）和 **关键路径时序图**，不要用产品分层图取代调用链正文。最值得先改的一项；明确不要动的。后续只追加图和说明，**不要删已有 finding**。）

## Findings index
| ID | P | 轴 | 标题 |
|----|---|----|------|
| D-01 | P1 | Design | … |

## Design
## Clean
## Conventions
## Testing
## Stack
## Spec

## Decision Board

| 优先 | ID | Finding | 建议动作 | 成本 | 不做的后果 | 主位置 |
|------|----|---------|----------|------|------------|--------|
| 1 | D-01 | … | 立刻改 / 记债 / 先设计 | S/M/L | … | [backend/path/to/file.ts:12-40](../../backend/path/to/file.ts#L12) |

## Open questions
（0–3 个需用户拍板的问题）
```

Decision Board 排序 pragmatic：**成熟库/已有能力替换（Design）→ P0 正确性 → 阻塞合入的 Spec → 其余架构复利 → 其它**；每行 **ID 列必须是轴前缀编号**（`D-01`、`T-01`、`S-01`、`K-01`、`N-01`…），主位置必须是可点击链接。成熟库项即使严重度标 P1/P2，只要能显著删代码，仍可排在 Board 最前并注明「优先建议：先换库再细改」。

未进 Board 的 finding 仍须有轴 ID（Findings index 收全）。已有报告追加图或改编号时，**保留全部原卡片正文**。向用户回复的要求见「总流程 → 4. 聚合并落盘」第 5 步。

---

## Architecture Brief 读者模型

默认读者是 **刚看到这批 diff、还没建立心智模型的人**（人审 AI 代码是常态）。Brief 不是给已经熟悉调用链的人写的结论备忘。

前四段直接复用 [understand.md](understand.md)「产出结构」的第 1–4 段，顺序和写法都照那边：

1. **一句话**：用户侧加了/改了什么（5–8 句，不提文件名、不提 AC 编号）。
2. **词表**：本报告会用到的词，一词一句，第一次出现必须解释。
3. **代码怎么走**：一张 mermaid 或编号步骤，谁调用谁，每个框一行职责 + 文件名。说边界时先用白话讲它为什么存在，再括 AC / Design 编号。
4. **分层：谁认识谁**。

review 特有的两段接在后面：

5. **成熟库 / 已有能力**（读者已经知道哪一层该干什么之后，再写「该复用却没复用」）。
6. **边界变清晰还是变糊 / 最值得先改的一项 / 明确不要动的**。

缺段就重写 Brief，不要用「依赖与职责链」四个字糊过去。Finding 卡片可以密，Brief 必须疏。禁止第一句就是模块名并列 +「边界成立」；用语按 [llm-output.md](llm-output.md)，内部缩写第一次出现先给本义。

报告特有的一条：**文档编号和函数名都不能当读者已知**。

- 错：「ADR-002 欠债，继续走 `feishuFetchJson`。」
- 对：「ADR-002 规定业务路径禁止自拼 `open.feishu.cn/open-apis/...`，应调官方 `lark.Client`。现状是用户 OAuth 仍 `sdk: null`，`feishuFetchJson` 只是拿 token 再 `fetch(域名+路径)` 的薄封装。」

ADR、helper、管道、队列策略，都按「它实际做了哪一步」写。

---

## Subagent prompt 要点（父 agent 拼装时遵守）

- **Design**：
  1. **先做成熟库 / 已有能力扫描**（对照 Design「Prefer Industry Standard Libraries」+ YAGNI「代码库里已经有了吗 / 已安装依赖能做吗」）：本次自造是否可用已安装依赖、标准库或仓库已有模块替代？
     - **此项优先于 Clean 轴细改坏味道**：能换库/复用则先出 **优先建议** 卡片，写清「可删大约何量代码 / 可避免哪些后续 review」，并在 Architecture Brief 与 Decision Board **置顶**。
  2. 再按调用顺序描述谁调用谁与模块边界（见「说明必须可读」）；YAGNI「该不该有」优先于「更抽象」；Legacy / 深模块 / 分层与内聚。
- **Clean**：函数名 + **可点击位置链接**；死代码与重复要指出两侧位置，并按调用顺序写清两边各自做什么；**不要**再报「该用某某成熟库」（留给 Design，避免双轴重复）。
- **Conventions**：命名、目录归属、logger、migration（仓库 `AGENTS.md` 优先；否则 [conventions.md](conventions.md) + `practice/`）。**不要**把用语/可读性当成此轴 finding。
- **Testing**：有无测、分层、是否测实现细节、Bugfix 是否先复现。
- **Stack**：只加载触及的 practice 文件，并遵守其中的自检约定；按 practices 产出 Findings。
- **Spec**：引用 AC / 意图原文；缺 / 错 / creep / 文档漂移分条。

字数：有发现写透，宁可读完，不要压缩成只有作者能懂的短句。Architecture Brief 在有架构触达时按调用顺序写清职责链。

---

## Smell 基线（Clean / Design 可引用）

仓库文档优先。下列为判断启发式（非硬违规）：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。工具已覆盖的（eslint/tsc）不要重复报。

---

## 与其它 review 的关系

- `/lh review` 是六轴 + 落盘报告。
- 通用双轴 code-review、Bugbot、Security Review 仍可用于轻量或专项场景。
