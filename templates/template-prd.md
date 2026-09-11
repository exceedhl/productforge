# PRD 模板

按 Story 复杂度删减不适用章节，不为填满模板编造内容。

```markdown
---
last_updated: YYYY-MM-DD
status: Draft | Approved | In Progress | Done | Deprecated
related_stories: [US-x.x]
---

# PRD：[ID] [简短标题]

## 问题与目标

- **目标用户与场景**：
- **当前问题**：
- **期望结果**：
- **已验证事实 / 待验证假设**：

## 用户流程

1. 用户执行……
2. 系统……
3. 用户看到……

## 验收标准

| ID | 可观察行为 | 优先级 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-x.1 | [成功路径、失败场景或边界条件下的可观察结果] | P0/P1/P2 | Unit / Functional（含 Component）/ Integration（含 Journey）/ 手动 | Pending |

## 范围

- **In-Scope**：
- **Out-of-Scope**：

## 关键约束

- **权限、错误与空态**：
- **协议或数据约束**：
- **已确定的技术约束**：

## 成功指标

- **主要指标**：
- **辅助或护栏指标**：[有独立决策价值时填写]
- **数据来源与判定方式**：

## 未决问题

- [会改变范围、行为或验收方式的问题]
```
