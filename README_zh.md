# ProductForge (`pf`)

[English](README.md) | 简体中文

> [!NOTE]
> **说明与致谢**：
> - **个人自用**：本 Skill 主要针对**个人日常研发与协作场景**定制打磨。
> - **借鉴业界优秀实践**：借鉴融合了业界诸多优秀 Agent Skill 与工具链（如 **pstack**、**ponytails** 等项目）的优秀内容。
> - **实验阶段**：`/pf understand`（基于 Tree-sitter 的代码 AST 索引与架构/时序渲染引擎）目前**仍处于实验阶段**，仍在持续探索与迭代中。

> **一个入口，六条产品与研发工作流。**
> 面向 AI 研发 Agent（与人类工程师协作）的结构化端到端工程交付体系。

---

## 目录

- [整体目的与核心价值](#1-整体目的与核心价值)
- [核心工作流与子命令](#2-核心工作流与子命令)
  - [`/pf strategy` · 产品战略](#pf-strategy--产品战略)
  - [`/pf prd` · 需求与指标](#pf-prd--需求与指标)
  - [`/pf arch` · 技术架构与 ADR](#pf-arch--技术架构与-adr)
  - [`/pf test` · 测试设计与验证](#pf-test--测试设计与验证)
  - [`/pf understand` · 代码导览与可视化（实验中）](#pf-understand--代码导览与可视化实验中)
  - [`/pf review` · 六轴代码评审](#pf-review--六轴代码评审)
- [智能路由与调用规则](#3-智能路由与调用规则)
- [默认产物与目录规范](#4-默认产物与目录规范)
- [安装与配置指南](#5-安装与配置指南)
- [技术栈实践规范 (Practice)](#6-技术栈实践规范-practice)

---

## 1. 整体目的与核心价值

在传统 AI 编程助手的协助下，开发者常常面临以下断层与失控：
1. **意图漂移**：从业务想法到落地代码缺乏链条，代码越写越偏离初衷。
2. **文档与代码脱节**：PRD、架构设计和测试用例在快速迭代中迅速过期成为摆设。
3. **AI 幻觉与盲目重构**：模型容易编造不存在的模块、引入过度工程（违反 YAGNI）或忽视现有成熟实现。
4. **代码理解困难**：接手新模块或审查超大 Diff 时，散乱的文字回答难以建立全局心智模型。

**ProductForge** 通过将**产品战略、需求规格、系统架构、测试设计、代码导览与多轴评审**整合为单一、严格协同的 Skill，带来如下核心价值：

- **闭环可追溯**：商业假设 $\to$ 用户画像与旅程 $\to$ User Story $\to$ PRD 验收标准 $\to$ 架构方案 $\to$ 测试用例 $\to$ 生产代码，上下游影响链清晰受控。
- **实证优先，杜绝空话**：明确区分**证据（Evidence）**、**推断（Inference）**与**假设（Assumption）**，严禁模型用无来源的精确数字或假象填空。
- **确定性工具优先**：代码理解借助 **Tree-sitter AST 静态索引**；架构图与时序图基于 **Graphviz WASM + libavoid** 算法排版引擎生成交互式 HTML；代码审查优先复用项目原生 Lint/Typecheck，子 Agent 不重复扫描。
- **守正克制**：深度遵循 **YAGNI（You Aren't Gonna Need It）** 与 **深模块设计（Deep Modules）** 理念，优先使用成熟标准库与已有依赖，避免制造多余的中间层和虚饰契约。

---

## 2. 核心工作流与子命令

调用格式统一为：
```bash
/pf <command> <自然语言描述或目标对象>
```
> 注：不增加第三级子命令；输入单一 `/pf` 时将分析仓库现状并推荐 2–3 个高价值后续动作。

```
┌──────────────────────────────────────────────────────────────┐
│                    /pf (ProductForge)                        │
└──────┬────────────┬────────────┬────────────┬─────────────┬──┘
       │            │            │            │             │
   strategy        prd          arch         test       understand      review
 (定位/画布/SWOT) (画像/Story/PRD) (架构/部署/ADR) (风险/分层/补测) (AST索引/时序/架构) (六轴/基线评审)
```

---

### `/pf strategy` · 产品战略

为产品定位、竞争格局和商业模式提供扎实的决策依据。
- **核心能力**：
  - **竞品分析**：从用户任务出发，对比替代方案与差异化解法，明确关键取舍。
  - **SWOT / TOWS 分析**：使用内置模版 [`templates/template-swot.md`](templates/template-swot.md) 拆解内部优劣势与外部机会威胁，直接推导可执行行动策略。
  - **精益画布（Lean Canvas）**：聚焦高风险假设、用户价值主张、渠道与关键度量指标。
- **典型用法**：
  ```bash
  /pf strategy 分析目前在私有化部署场景下相比开源竞品的差异化优势
  /pf strategy 为当前 AI 智能客服插件产出精益画布
  ```
- **输出路径**：`docs/strategy/*.md`

---

### `/pf prd` · 需求与指标

建立从用户动机到端到端可验证规格的清晰脉络。
- **核心能力**：
  - **用户画像与旅程图**：使用 [`templates/template-journey.md`](templates/template-journey.md) 描绘核心用户、触点、实际行为与已知痛点。
  - **Backlog / User Stories**：标准化 Story 拆解（作为...我希望...以便于...）以及清晰的可观察验收条件。
  - **单 Story PRD**：使用 [`templates/template-prd.md`](templates/template-prd.md) 细化 In-Scope / Out-of-Scope、主流程、状态机、异常分支与成功指标。
- **典型用法**：
  ```bash
  /pf prd 梳理跨租户数据隔离需求的用户故事与验收标准
  /pf prd 为批量导出功能生成 PRD 规格文档
  ```
- **输出路径**：
  - 画像与旅程：`docs/user_persona_journey.md`
  - 故事列表：`docs/user_stories.md`
  - 单特性 PRD：`docs/prd/[ID]_[Brief].md`

---

### `/pf arch` · 技术架构与 ADR

记录关键技术取舍与落地拓扑，杜绝无依据的过度抽象。
- **核心能力**：
  - **系统架构**：核心调用入口、编排层、领域逻辑、数据流向与外部边界。遵循 YAGNI，需要时引入深模块。
  - **ADR（架构决策记录）**：仅在“更改成本高、无上下文者易质疑、存在明显备选方案”时生成 ADR，使用 [`templates/template-adr.md`](templates/template-adr.md)。
  - **部署与运维**：运行拓扑、CI/CD 交付流水线、配置加载顺序、敏感信息管理与环境隔离。
- **典型用法**：
  ```bash
  /pf arch 设计基于 Tree-sitter 的代码索引模块架构
  /pf arch 记录从 REST 迁移至 gRPC 的架构决策 (ADR)
  ```
- **输出路径**：
  - 架构总览：`docs/technical_architecture.md`
  - ADR 决策记录：`docs/adr/ADR-*.md`

---

### `/pf test` · 测试设计与验证

按风险驱动测试设计，或依据设计补充自动化测试代码。
- **核心能力**：
  - **风险驱动设计**：识别公共入口、成功场景、代表性失败与边界条件，确定最小暴露风险的测试层级。
  - **测试实现与修补**：
    - *新功能*：PRD 验收条件 $\to$ 测试设计 $\to$ 补齐自动化用例。
    - *缺陷修复*：先编写能够复现缺陷的失败测试，再修改生产代码验证通过。
    - *重构*：以既有用例守护行为不变，非必要不改动测试层。
- **典型用法**：
  ```bash
  /pf test 为鉴权中间件的 Token 过期逻辑设计测试并补全用例
  /pf test 针对 #402 崩溃问题先写失败复现测试
  ```
- **输出路径**：`docs/testing/`

---

### `/pf understand` · 代码导览与可视化（实验中）

为已有代码库或变更集生成高可读性、结构化的导览与交互式图表。
- **核心能力**：
  - **两个维度正交组合**：
    - **范围（Scope）**：改动集（Worktree Diff / PR）、指定区域（Story / 模块 / 文件）、整体仓库。
    - **视图（View）**：当前状态视图（现状分析）或变化视图（Diff 对比）。
  - **确定性 AST 证据包**：调用内置 TypeScript 引擎，先利用 Tree-sitter 解析生成符号索引与证据包，严禁大模型臆造调用链与行号。
  - **交互式渲染器**：调用 `scripts/understand/cli.ts`，基于 Graphviz WASM 自动排版 + libavoid 正交避障布线，输出自包含交互式 HTML 导览页。
- **典型用法**：
  ```bash
  /pf understand 解释这次工作区未提交改动的调用时序与影响
  /pf understand 整体仓库核心架构导览
  /pf understand 梳理 billing 模块的数据流与依赖边界
  ```
- **底层 CLI 工具用法**（由 Skill 自动调度或手动执行）：
  ```bash
  # 1. 构建 Tree-sitter 符号索引
  node ~/.agents/skills/pf/scripts/understand/cli.ts index --root .
  
  # 2. 提取精准证据包
  node ~/.agents/skills/pf/scripts/understand/cli.ts packet --index .productforge/understand/index --file src/app.ts --symbol handleRequest
  
  # 3. 渲染交互式 HTML 导览并在浏览器打开
  node ~/.agents/skills/pf/scripts/understand/cli.ts render --input walkthrough.json --output walkthrough.html --open
  ```
- **输出路径**：默认在对话中输出结构化 Markdown 与伪代码；用户显式要求沉淀为文档时写入 `docs/design/[ID]_Walkthrough.md`。

---

### `/pf review` · 六轴代码评审

基于固定的 Git 基线，对代码改动开展严谨、可审计的六维度评审，输出正式审查报告。**该命令仅评判是否应修改并给出修改依据，不代替用户修改代码。**

#### 六大评审轴标准

| 轴 | 前缀 | 默认参考来源 | 核心核查问题 | 子 Agent 能力档 |
|---|---|---|---|---|
| **Design** | `D` | [`practice/design.md`](practice/design.md)、[`practice/yagni.md`](practice/yagni.md)、[`practice/deep-module.md`](practice/deep-module.md) | 是否复用了成熟能力与平台能力？模块职责是否清晰且深？依赖方向是否健康？ | 判断档（同级最高） |
| **Clean** | `C` | [`practice/clean.md`](practice/clean.md) | 是否存在无意义重复、死代码、过长逻辑或缺乏实际职责的透传转发层？ | 判断档（同级最高） |
| **Conventions** | `N` | [`reference/conventions.md`](reference/conventions.md)、日志与数据库规范 | 命名、目录布局、日志分级与数据库迁移是否符合仓库统一约定？ | 默认主会话 / 轻量档 |
| **Testing** | `T` | [`reference/test.md`](reference/test.md)、[`reference/testing-model.md`](reference/testing-model.md) | 测试层级是否匹配风险？Mock 边界是否恰当？核心边界与失败场景是否覆盖？ | 轻量档 |
| **Stack** | `K` | `practice/` 下对应的 TypeScript、React、Node、Electron 实践 | 是否违反当前技术栈的关键工程实践与性能规范？ | 轻量档 |
| **Spec** | `S` | Story、PRD 验收标准、测试设计与用户意图 | 是否缺实现、做错、超出范围（Scope Creep）或产生文档代码漂移？ | 轻量档 |

#### 评审深度

| 深度 | 触发时机 | 运行的评审轴与策略 |
|---|---|---|
| **WIP（默认）** | 日常开发，用户未指定全量或交付审查 | 仅运行 **Design、Clean、Stack**；当且仅当测试文件有改动时追加 **Testing**。最多 4 个子 Agent，轻量敏捷。 |
| **全量（Full）** | 明确提及「全量」「六轴」「合并前」「准备提交」或交付审查 | 按实际改动范围运行全部适用轴（未改动的技术栈或纯文档改动按规则跳过并记录原因）。 |

#### 典型用法

```bash
/pf review origin/main
/pf review 评审当前分支相比 main 的未合并改动
/pf review --full 准备合入主干，执行全量六轴评审
```

- **输出路径**：`docs/reviews/`

---

## 3. 智能路由与调用规则

Skill 遵循简洁明了的路由原则：

1. **显式优先**：当用户明确提及子命令（如 `/pf prd`、`/pf test`）时，直接进入对应流程。
2. **意图自推导**：未指明子命令时根据语义自动匹配：
   - 商业定位与竞品 $\to$ `strategy`
   - 用户需求与可验收规格 $\to$ `prd`
   - 技术设计与服务部署 $\to$ `arch`
   - 测试设计与自动化用例 $\to$ `test`
   - 代码调用图谱与架构导览 $\to$ `understand`
   - 变更审计与代码质量评估 $\to$ `review`
3. **消除歧义**：两条路线均合理且产出存在根本分歧时，只向用户提出一个能决定方向的关键问题。
4. **代码问答与导览隔离**：回答单个函数或定位简单 bug 时直接查阅文件回答，**不滥用** `understand` 流程。

---

## 4. 默认产物与目录规范

ProductForge 严守单源真理（Single Source of Truth），修改既有文件而非重复创建平行文件：

| 产物类型 | 默认存放路径 | 规范要求 |
|---|---|---|
| 商业与竞争战略 | `docs/strategy/*.md` | 包含 `last_updated`、`status`，区分证据与假设 |
| 用户画像与旅程 | `docs/user_persona_journey.md` | 使用 [template-journey.md](templates/template-journey.md) 起步 |
| 需求与故事池 | `docs/user_stories.md` | 每条 Story 具备唯一 ID 与可验收标准 |
| 单特性 PRD | `docs/prd/[ID]_[Brief].md` | 严格对应 Story，使用 [template-prd.md](templates/template-prd.md) |
| 系统技术架构 | `docs/technical_architecture.md` | 记录主路径数据流、分层边界与职责说明 |
| 架构决策记录 | `docs/adr/ADR-*.md` | 记录取舍依据，使用 [template-adr.md](templates/template-adr.md) |
| 测试设计方案 | `docs/testing/*.md` | 按风险设计，说明入口、期望状态与隔离范围 |
| 六轴评审报告 | `docs/reviews/` | 包含基线信息、运行轴、Finding 证据与改进建议 |
| 交互式代码导览 | `docs/design/[ID]_Walkthrough.md` | 仅在用户显式要求留存为文档时写入 |

---

## 5. 安装与配置指南

### 5.1 安装 Skill

将 ProductForge 安装至 Agent Skills 目录：

#### 方案 A：全局安装（推荐）
适用于大多数支持 Skill 协议的 AI 编码助手（如 Cursor、Claude Code 等）：
```bash
# 复制或软链接至全局 Agent Skills 目录
mkdir -p ~/.agents/skills
git clone https://github.com/<your-org>/productforge.git ~/.agents/skills/pf

# 或者软链接本地目录
ln -s /path/to/productforge ~/.agents/skills/pf
```

#### 方案 B：项目级安装
在当前工作区中生效：
```bash
mkdir -p .gemini/skills
ln -s /path/to/productforge .gemini/skills/pf
```

### 5.2 安装代码导览与可视化引擎依赖

`/pf understand` 内部使用了高性能的 Tree-sitter AST 解析与 Graphviz/libavoid 渲染器。**依赖安装在 Skill 自身目录下，完全不会污染你的项目仓库根目录**：

```bash
cd ~/.agents/skills/pf/scripts/understand
npm install
```

> **环境要求**：Node.js >= 18.0.0

### 5.3 验证安装

在支持 Skill 的 Agent 对话框中输入：
```text
/pf
```
如果安装成功，Agent 将响应 ProductForge 入口指引，并根据你当前仓库的状态推荐下一步行动。

---

## 6. 技术栈实践规范 (Practice)

ProductForge 内置了经实战提炼的高价值架构与工程实践参考（位于 `practice/` 目录），由各子命令在需要时按需只读引入，不造成无关上下文膨胀：

- **设计与架构原则**：
  - [`practice/design.md`](practice/design.md)：模块边界与依赖倒置规范
  - [`practice/yagni.md`](practice/yagni.md)：克制设计与反过度工程准则
  - [`practice/deep-module.md`](practice/deep-module.md)：深模块设计与简单接口法则
  - [`practice/clean.md`](practice/clean.md)：局部代码坏味道与重构实践
- **技术栈最佳实践**：
  - TypeScript、React、Node.js、Electron、Logging、Database 最佳实践指南。
