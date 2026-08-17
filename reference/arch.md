# 技术架构设计 (Technical Architecture Design)

包含两个可独立运行的阶段。

`/lh arch`

用户说选型、模块、DB、API、ADR → 阶段 A（架构设计）。用户说部署、CI、环境变量、setup guide → 阶段 B。只点命令：编码前偏 A。

## 阶段导航

| 阶段 | 时机 | 适用场景 |
|---|---|---|
| **阶段 A：架构设计** | 编码前 | 选型、架构、DB、API、组件设计 |
| **阶段 B：部署与环境** | 编码后/实现中 | 部署方案、CI/CD、Setup Guide |

> 两个阶段**完全独立**，根据用户文字和当前开发阶段选择。
>
> **上游**: 建议先完成 `/lh prd` 的 Backlog/PRD。
>
> **下游**: 架构设计完成后，走 `/lh test` 规划测试策略。

## 参考资料

- `templates/TEMPLATE_ADR.md` — Architecture Decision Record 模板

---

## 文件与目录规范

| 文档类型 | 路径 | 所属阶段 |
|---|---|---|
| 技术架构总文档 | `docs/technical_architecture.md` | A |
| API 文档 | `docs/api/` | A |
| 架构决策记录 | `docs/adr/ADR-XXX_[标题].md`（项目可改写此目录） | A |
| 部署文档 | `docs/deployment.md` | B |
| 本地开发指南 | `docs/setup_guide.md` | B |

> 所有文档顶部应包含 `last_updated`, `status`, `related_stories` 元信息。

---

## 交互式引导 (Interactive Discovery)

### 阶段 A 引导问题
1. **需求来源**: 要设计哪些 User Stories 的技术方案？（文件路径或 ID）
2. **现有技术栈**: 项目已有的技术选型是什么？（语言、框架、数据库）
3. **团队能力**: 团队最熟悉哪些技术？有哪些技术债？
4. **非功能需求**: 有特殊的性能/安全/合规要求吗？
5. **规模预估**: 预期用户量和数据量级别？

### 阶段 B 引导问题
1. **目标环境**: 部署到哪里？（云服务商、自建机房、Serverless）
2. **现有基础设施**: 已有的 CI/CD、容器化、监控方案？
3. **团队规模**: 有多少人需要搭建本地环境？
4. **自动化程度**: 对 CI/CD 自动化的期望？（全自动 / 半自动 / 手动）

---

## 文档同步机制

- 新增/删除 DB 表或字段 → 更新架构文档 DB 章节
- 新增/修改 API → 更新 API 设计章节
- 引入新依赖 → 更新选型章节和 `docs/setup_guide.md`
- 修改部署配置 → 更新 `docs/deployment.md`
- **重大架构变更** → 在 ADR 目录新增 ADR（模板参见 `templates/TEMPLATE_ADR.md`）

### 代码变更检查清单
完成 Story 开发后检查：
- [ ] `docs/technical_architecture.md` 相关章节是否仍准确
- [ ] 新增环境变量是否已记录在 `docs/setup_guide.md`
- [ ] 部署变更是否已更新 `docs/deployment.md`
- [ ] 相关 PRD 的 AC Status 是否已更新

---

## 阶段 A：架构设计（编码前）

### 核心原则
*   **需求驱动**: 严禁过度设计。
*   **合适优于先进**: 选型基于团队熟悉度和业务场景。
*   **可扩展性**: 不为遥远的未来牺牲当下效率。
*   **文档即代码**: 架构变更必须同步更新文档。

实现量遵循 [practice/yagni.md](../practice/yagni.md)；一旦需要新模块边界，遵循 [practice/deep-module.md](../practice/deep-module.md)。

### A1. 分析需求
阅读 User Stories 和 PRD，理解业务目标和非功能性需求。

### A2. 技术选型
语言、框架、库/工具 + 决策理由。

### A3. 系统概览
Mermaid 架构图 + 核心模块职责描述。

### A4. 数据库设计
Mermaid ER 图 + 关键表 Schema。

### A5. 关键 API 设计
仅设计最关键、最复杂的 API。简单 CRUD 无需详列。

### A6. 关键组件设计（前端）
核心组件 + 状态管理设计。

### A7. 非功能性需求
识别 NFR 并**转化为 User Story** 加入 Backlog。

### A8. 架构决策记录 (ADR)
> 模板参见 `templates/TEMPLATE_ADR.md`

对于重大技术决策（如选择数据库、通信协议、认证方案），记录为 ADR：
- 文件命名（默认）: `docs/adr/ADR-001_[决策标题].md`；项目另有 ADR 目录则从其约定
- 必须包含: 背景、决策、备选方案对比、后果
- 状态生命周期: Proposed → Accepted → *(Deprecated / Superseded)*

---

## 阶段 B：部署与环境搭建（编码后/实现中）

### 核心原则
*   **可复现**: 任何人按文档操作都能得到一致结果。
*   **环境隔离**: 开发/测试/生产差异必须明确记录。
*   **安全优先**: Secret 永远不能硬编码或出现在文档中。

### B1. 部署架构
Mermaid 部署拓扑 + 环境划分 + 域名/网络配置。

### B2. CI/CD 流程
流水线设计 + 分支策略 + 回滚方案。

### B3. 环境变量与配置管理
变量清单（不含实际 secret）+ 配置加载优先级 + Secret 管理方式。

### B4. 基础设施即代码 (IaC)
如有 Docker/K8s/Terraform 等，说明组织方式和使用方法。

### B5. 本地开发环境 (Setup Guide)
前置依赖 + 快速启动（≤ 5 步）+ 常见问题 FAQ + 开发约定。
