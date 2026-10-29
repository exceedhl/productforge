# ProductForge (`pf`)

English | [简体中文](README_zh.md)

> [!NOTE]
> **Disclaimer & Acknowledgements**:
> - **Personal Use**: This skill is developed and tuned primarily for **personal day-to-day workflow**.
> - **Industry Inspiration**: It synthesizes ideas, patterns, and best practices from several outstanding skills in the agent ecosystem (such as **pstack**, **ponytails**, and related workflows).
> - **Experimental Status**: The `/pf understand` module (Tree-sitter AST indexing and layout renderer) is currently **experimental** and under active exploration.

> **One unified entry point, six end-to-end product & engineering workflows.**
> A structured software delivery framework built for AI coding agents and human engineers.

---

## Table of Contents

- [Overview & Core Value](#1-overview--core-value)
- [Subcommands & Workflows](#2-subcommands--workflows)
  - [`/pf strategy` · Product Strategy](#pf-strategy--product-strategy)
  - [`/pf prd` · Requirements & Metrics](#pf-prd--requirements--metrics)
  - [`/pf arch` · Architecture & ADRs](#pf-arch--architecture--adrs)
  - [`/pf test` · Test Design & Verification](#pf-test--test-design--verification)
  - [`/pf understand` · Code Walkthrough & Visualization (Experimental)](#pf-understand--code-walkthrough--visualization-experimental)
  - [`/pf review` · Six-Axis Code Review](#pf-review--six-axis-code-review)
- [Routing & Dispatch Rules](#3-routing--dispatch-rules)
- [Artifact Conventions & Default Paths](#4-artifact-conventions--default-paths)
- [Installation & Setup](#5-installation--setup)
- [Engineering Practices](#6-engineering-practices)

---

## 1. Overview & Core Value

When collaborating with LLM coding agents, software teams frequently encounter critical breakdown points:
1. **Context Drift**: Product vision and customer pain points get lost during iterative code writing.
2. **Stale Documentation**: PRDs and architectural designs fall out of sync with actual code within days.
3. **AI Hallucinations & Over-Engineering**: Models invent speculative layers, violate YAGNI, or miss existing mature dependencies.
4. **Opaque Codebases**: Complex changesets or legacy systems become difficult to review without visual structure.

**ProductForge** unifies **Product Strategy, PRD Specifications, Technical Architecture, Test Design, Structured Code Walkthroughs, and Multi-Axis Code Reviews** into a single cohesive Agent Skill.

### Key Value Propositions

- **End-to-End Traceability**: Seamless flow from Strategy $\to$ Persona & Journey $\to$ User Stories $\to$ PRD Acceptance Criteria $\to$ Architecture $\to$ Test Suites $\to$ Code. Downstream impact is explicitly managed whenever upstream assumptions change.
- **Evidence-Based Grounding**: Classifies all inputs and claims into **Evidence** (verifiable data or code), **Inference** (logically supported deductions), or **Assumption** (hypotheses requiring testing). Models are prohibited from fabricating precise numbers or ungrounded claims.
- **Deterministic Tooling First**: Static **Tree-sitter AST indexing** powers code exploration; **Graphviz WASM + libavoid** orthogonal edge routing renders interactive HTML diagrams; native repository linters and typecheckers run in the parent session before spinning up sub-agents.
- **Strict Engineering Discipline**: Enforces **YAGNI (You Aren't Gonna Need It)** and **Deep Modules** (simple interfaces hiding complex behavior). Avoids superficial abstraction layers and speculative future-proofing.

---

## 2. Subcommands & Workflows

Invocation syntax:
```bash
/pf <command> <natural language query or target scope>
```
> Note: No third-level subcommands are introduced. Invoking bare `/pf` inspects the repository and recommends 2–3 contextual next steps.

```
┌──────────────────────────────────────────────────────────────┐
│                    /pf (ProductForge)                        │
└──────┬────────────┬────────────┬────────────┬─────────────┬──┘
       │            │            │            │             │
   strategy        prd          arch         test       understand      review
 (Strategy/SWOT) (Persona/PRD)  (Arch/ADR)  (Risk/Test)  (AST/Diagram) (6-Axis Review)
```

---

### `/pf strategy` · Product Strategy

Provides a rigorous decision-making basis for product positioning, competitive analysis, and business models.
- **Capabilities**:
  - **Competitor Analysis**: Evaluates direct competitors, indirect substitutes, and alternative workflows based on user jobs-to-be-done.
  - **SWOT / TOWS Matrix**: Identifies internal strengths/weaknesses and external opportunities/threats to formulate executable actions using [`templates/template-swot.md`](templates/template-swot.md).
  - **Lean Canvas**: Pinpoints value propositions, riskiest assumptions, distribution channels, and unit economics.
- **Example Usage**:
  ```bash
  /pf strategy Evaluate competitive moats against open-source alternatives
  /pf strategy Draft a lean canvas for our developer tool plugin
  ```
- **Target Path**: `docs/strategy/*.md`

---

### `/pf prd` · Requirements & Metrics

Maintains strict traceability across personas, customer journeys, user stories, PRDs, and verifiable success metrics.
- **Capabilities**:
  - **Personas & User Journeys**: Maps core target users, real-world touchpoints, actions, and friction points using [`templates/template-journey.md`](templates/template-journey.md).
  - **Backlog & User Stories**: Standardized stories (*"As a... I want to... So that..."*) with observable acceptance criteria and design constraints.
  - **Feature PRDs**: Comprehensive definitions of In-Scope / Out-of-Scope boundaries, primary user flows, state transitions, edge cases, error conditions, and success metrics using [`templates/template-prd.md`](templates/template-prd.md).
- **Example Usage**:
  ```bash
  /pf prd Define user stories and acceptance criteria for tenant data isolation
  /pf prd Generate PRD specification for batch CSV export
  ```
- **Target Paths**:
  - Persona & Journey: `docs/user_persona_journey.md`
  - Backlog: `docs/user_stories.md`
  - Feature PRD: `docs/prd/[ID]_[Brief].md`

---

### `/pf arch` · Architecture & ADRs

Documents architectural decisions, system boundaries, and deployment topologies while preventing premature abstractions.
- **Capabilities**:
  - **System Architecture**: Entry points, orchestration, domain logic, data models, persistence, and external service contracts. Follows YAGNI and extracts Deep Modules only when justified.
  - **ADR (Architecture Decision Records)**: Captured only when decisions have high reversal cost, counter-intuitive reasoning, or significant trade-offs using [`templates/template-adr.md`](templates/template-adr.md).
  - **Deployment & Environments**: Topology, CI/CD delivery pipelines, configuration priority, credential/secrets handling, and reproducible local environments.
- **Example Usage**:
  ```bash
  /pf arch Design Tree-sitter indexing pipeline and caching boundaries
  /pf arch Record ADR for adopting libavoid for orthogonal edge routing
  ```
- **Target Paths**:
  - Technical Architecture: `docs/technical_architecture.md`
  - ADRs: `docs/adr/ADR-*.md`

---

### `/pf test` · Test Design & Verification

Designs risk-driven test specifications or implements automated test suites.
- **Capabilities**:
  - **Risk-First Test Design**: Pinpoints minimal test layers (Unit, Integration, E2E) required to verify critical failure modes and boundary conditions.
  - **Execution Tracks**:
    - *New Features*: Map PRD acceptance criteria $\to$ Test design $\to$ Implementation.
    - *Bug Fixes*: Write reproducible failing test first $\to$ Confirm root cause $\to$ Fix production code.
    - *Refactoring*: Prove behavioral equivalence with existing tests without modifying assertion contracts.
- **Example Usage**:
  ```bash
  /pf test Design test scenarios for authentication token expiry
  /pf test Write reproduction test for issue #402 before bug fixing
  ```
- **Target Path**: `docs/testing/`

---

### `/pf understand` · Code Walkthrough & Visualization (Experimental)

Generates high-fidelity structured walkthroughs, sequence diagrams, and architectural maps for unfamiliar code or changesets without modifying production code.
- **Capabilities**:
  - **Orthogonal Combinations**:
    - **Scope**: Changeset (diff), Specific Area (Story/Module/Symbol), or Entire Repository.
    - **View**: Current View (existing layout) vs. Evolution View (diff against a baseline).
  - **Deterministic AST Evidence Packet**: Tree-sitter parser indexes real symbols, call hierarchies, and definitions. Models never guess line numbers or fabricate non-existent calls.
  - **Interactive IR Renderer**: Compiles walkthrough IR via `@hpcc-js/wasm` (Graphviz layout) and `libavoid-js` (orthogonal routing) into interactive standalone HTML pages.
- **Example Usage**:
  ```bash
  /pf understand Explain the call sequence and state mutations in the billing module
  /pf understand Provide an overall architectural map of the repository
  ```
- **CLI Commands (Under the Hood)**:
  ```bash
  # 1. Build AST symbol index
  node ~/.agents/skills/pf/scripts/understand/cli.ts index --root .

  # 2. Extract evidence packet
  node ~/.agents/skills/pf/scripts/understand/cli.ts packet --index .productforge/understand/index --file src/app.ts --symbol handleRequest

  # 3. Render HTML diagram
  node ~/.agents/skills/pf/scripts/understand/cli.ts render --input walkthrough.json --output walkthrough.html --open
  ```
- **Target Path**: In-chat Markdown & pseudocode by default; saved to `docs/design/[ID]_Walkthrough.md` upon explicit user request.

---

### `/pf review` · Six-Axis Code Review

Conducts evidence-backed, multi-dimensional code reviews against a fixed Git baseline and writes findings to structured reports. **Does not modify user code directly.**

#### The Six Review Axes

| Axis | Prefix | Default Reference | Verification Focus | Sub-Agent Tier |
|---|---|---|---|---|
| **Design** | `D` | [`practice/design.md`](practice/design.md), [`practice/yagni.md`](practice/yagni.md), [`practice/deep-module.md`](practice/deep-module.md) | Reuses mature platform capabilities? Clean and deep module boundaries? Healthy dependency direction? | Evaluation tier (Strongest) |
| **Clean** | `C` | [`practice/clean.md`](practice/clean.md) | Dead code, pointless duplication, excessive function lengths, or pass-through wrappers without logic? | Evaluation tier (Strongest) |
| **Conventions** | `N` | [`reference/conventions.md`](reference/conventions.md), logging/database guides | Naming conventions, directory structure, log levels, and database migrations? | Parent agent / Lightweight tier |
| **Testing** | `T` | [`reference/test.md`](reference/test.md), [`reference/testing-model.md`](reference/testing-model.md) | Test pyramid layering matches risk? Mock boundaries appropriate? Key edge cases covered? | Lightweight tier |
| **Stack** | `K` | Stack guides under `practice/` (TypeScript, React, Node, Electron) | Follows idiomatic patterns and performance practices for the active technology stack? | Lightweight tier |
| **Spec** | `S` | Stories, PRD acceptance criteria, test designs, and user intent | Unimplemented features, regressions, scope creep, or doc-code drift? | Lightweight tier |

#### Review Depths

| Depth | When to Trigger | Axes Executed & Strategy |
|---|---|---|
| **WIP (Default)** | Daily iterative development; user did not specify full or pre-merge review | Runs **Design, Clean, Stack** (+ **Testing** if test files changed). Up to 4 sub-agents. Fast and lightweight. |
| **Full (Pre-merge)** | Explicitly mentioned "full", "six-axis", "pre-merge", or delivery review | Runs all applicable axes based on changeset scope (skipped axes are documented with reasons). |

#### Example Usage

```bash
/pf review origin/main
/pf review Review uncommitted working tree changes
/pf review --full Run pre-merge delivery review
```

- **Target Path**: `docs/reviews/`

---

## 3. Routing & Dispatch Rules

1. **Explicit Dispatch**: If the user names a command (e.g., `/pf prd`), the agent directly opens that workflow reference.
2. **Intent Inference**: If unstated, routes automatically:
   - Positioning / Competitors $\to$ `strategy`
   - Requirements / Specs $\to$ `prd`
   - Technical design / Infrastructure $\to$ `arch`
   - Testing / Bug reproduction $\to$ `test`
   - Code tour / Visual diagrams $\to$ `understand`
   - Quality check / Diff evaluation $\to$ `review`
3. **Disambiguation**: If two commands fit equally well, the agent asks one single decisive question.
4. **Targeted Code Questions**: Simple queries about single functions or files are answered directly and do not trigger `/pf understand`.

---

## 4. Artifact Conventions & Default Paths

ProductForge avoids creating redundant parallel documents. All outputs adhere to standardized locations:

| Document Type | Default Location | Description |
|---|---|---|
| Strategy Triad | `docs/strategy/*.md` | Market, positioning, SWOT, lean canvas |
| Persona & Journey | `docs/user_persona_journey.md` | Customer touchpoints and pain points |
| Backlog & Stories | `docs/user_stories.md` | Prioritized user stories with criteria |
| Feature PRD | `docs/prd/[ID]_[Brief].md` | Single-story functional specification |
| System Architecture | `docs/technical_architecture.md` | Module boundaries, protocols, data flows |
| ADRs | `docs/adr/ADR-*.md` | Architectural decision records |
| Test Designs | `docs/testing/*.md` | Risk matrices and coverage strategies |
| Review Reports | `docs/reviews/` | Six-axis audit logs with findings |
| Code Walkthroughs | `docs/design/[ID]_Walkthrough.md` | Interactive tours (when requested as file) |

---

## 5. Installation & Setup

### 5.1 Skill Installation

Install ProductForge into your Agent Skills directory:

#### Option A: Global Installation (Recommended)
Supported across tools like Cursor, Claude Code, and Antigravity:
```bash
# Clone to global skills directory
mkdir -p ~/.agents/skills
git clone https://github.com/<your-org>/productforge.git ~/.agents/skills/pf

# Or create a symlink from your existing clone
ln -s /path/to/productforge ~/.agents/skills/pf
```

#### Option B: Workspace Installation
To enable ProductForge only for a specific repository:
```bash
mkdir -p .gemini/skills
ln -s /path/to/productforge .gemini/skills/pf
```

### 5.2 Install Visualization & AST Engine Dependencies

The `/pf understand` command includes an AST parser and layout engine. **Dependencies are installed locally inside the skill directory, keeping your host project completely clean**:

```bash
cd ~/.agents/skills/pf/scripts/understand
npm install
```

> **Requirements**: Node.js >= 18.0.0

### 5.3 Quick Verification

Trigger the skill in your AI agent chat:
```text
/pf
```
The agent will recognize ProductForge and propose contextual next steps based on your current workspace.

---

## 6. Engineering Practices

Located under `practice/`, these reference documents are loaded dynamically on demand:

- **Architectural Guidelines**:
  - [`practice/design.md`](practice/design.md): Reusability, module decoupling, dependency direction.
  - [`practice/yagni.md`](practice/yagni.md): Eliminating speculative features and redundant code.
  - [`practice/deep-module.md`](practice/deep-module.md): Deep modules with minimal surface interfaces.
  - [`practice/clean.md`](practice/clean.md): Local code smells and refactoring rules.
- **Tech Stack Guides**:
  - Best practices for TypeScript, React, Node.js, Electron, Structured Logging, and Database migrations.
