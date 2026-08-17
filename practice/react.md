# React 最佳实践

## 渲染与状态

- **不再盲目记忆化 (No more blind Memoization)**：除非通过 Profiler 测出性能瓶颈，否则不要盲目使用 `useMemo` 和 `useCallback`。缓存的内存和比较开销往往可能大于重渲染成本。
- **警惕衍生状态 (Derived State)**：如果数据可以通过已有 props 或 state 计算得出，不要存入新的 `useState`，也无需 `useEffect` 同步。直接在渲染流中计算。

## 状态管理

- **服务器状态交给数据获取层**：避免用 `useEffect + fetch` 手写服务器状态生命周期。应使用成熟的数据获取和缓存方案处理缓存、去重、竞态和失效。
- **全局客户端状态集中管理**：跨层级共享的纯客户端 UI 状态应进入明确的客户端状态管理方案，不要用 `window.dispatchEvent` 之类的全局事件当隐式 event bus。
- **缓存失效显式化**：任何 mutation 后必须显式失效相关 cache key 或订阅源，禁止靠组件各自拼接 `setState` 来维持数据同步。

## 组件结构

- **分离逻辑与视图 (Custom Hooks)**：复杂业务逻辑与状态变更应抽离为自定义 Hooks，组件本身尽量只负责视图渲染。
- **诚实的依赖数组**：`useEffect` 必须完全包含内部使用的外部变量。若加了依赖导致无限循环，说明逻辑结构需要调整，严禁使用 `eslint-disable` 欺骗 Linter。

## React Doctor

触及 React UI 的 review / 交付自检时，用 React Doctor 做确定性扫描（安全、性能、正确性、架构）。命令需网络（`npx`）。

### 何时跑

- 变更包含 React 应用源码（含未跟踪文件）→ **必跑**。
- 未触及 React UI → skip，并在产出中写明原因。

扫描根目录是该仓库的 React 应用根（含 `package.json` 与组件源码的目录）。若当前仓库指定了根目录，以项目约定为准。

### 命令

`<base>` 与本次 git review 基线一致（如 `origin/main`）；`<app-root>` 为上面的 React 根目录：

```bash
npx -y react-doctor@latest <app-root> \
  -y \
  --json \
  --no-score \
  --scope changed \
  --base <base> \
  --include-untracked
```

### 产出约定

- 与 `/lh review` 同时跑时：完整 JSON 写到同次报告旁的 `<report-stem>-react-doctor.json`（默认目录与 review 报告相同，一般为 `docs/reviews/`；项目另有约定则从其约定）。单独跑时自定 stem。
- 写入 Markdown 时放在 **`## Stack` → `### React Doctor`**（不要单独开顶层 `## React Doctor`）。
- 命令失败 → 在 `## Stack` 中记录失败原因并注明「无 Doctor 输入」；不阻断其它自检。

```markdown
## Stack

### React Doctor
（skip 原因，或分数/摘要；每条诊断带 `startLine:endLine:path`；完整 JSON 见旁路文件）

### 栈实践 Findings
（typescript / react / node / electron practices 卡片；可与 Doctor 项互链）
```
