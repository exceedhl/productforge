# PRD 输出模板

```markdown
---
last_updated: YYYY-MM-DD
status: Draft | Approved | In Progress | Done | Deprecated
related_stories: [US-x.x]
---

# PRD: [ID]_[Brief] (中文标题)

## 1. 项目背景
*   **Story ID**: [ID]
*   **Brief**: [Brief]
*   **Description**: (Copy from User Story)
*   **Status**: Pending / Partially Done / Done

## 2. 核心流程 (Workflow)
1. 用户执行 [动作A]
2. 系统响应 [处理B]
3. 用户看到 [结果C]
4. ...

## 3. 验收标准 (Acceptance Criteria)

| ID | 描述 (Description) | 优先级 | 验证方式 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| AC-x.1 | [具体、可测量的条件] | P0/P1/P2 | 单元测试/E2E/手动 | Pending |

## 4. 成功指标 (Success Metrics)
*   **主要指标**: [如：注册转化率提升 X%]
*   **次要指标**: [如：页面加载时间 < Xs]
*   **护栏指标**: [不能因此恶化的指标，如：跳出率不超过 Y%]

## 5. 技术规格 (Tech Spec)
*   **Architecture**: 简要描述
*   **API**: 关键接口设计
*   **DB**: 数据模型变更

## 6. 范围边界 (Scope)
*   **In-Scope**: [本期必做]
*   **Out-of-Scope**: [本期不做，记录原因]

## 7. 待定问题 (Open Questions)
*   [问题1]
*   [问题2]
```
