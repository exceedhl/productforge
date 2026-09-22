# Conventions 轴（通用）

`/pf review` 的 **Conventions** 轴默认清单。Finding 前缀 **`N`**。

**不含** LLM 输出约定（见 [llm-output.md](llm-output.md)）。

**项目细则优先**：若仓库有 `AGENTS.md`（或等价）的命名 / 目录 / 日志 / 迁移节，**以仓库为准**；本文件只提供无项目文件时的通用检查项。日志与迁移细节另见 [practice/logging.md](../practice/logging.md)、[practice/database.md](../practice/database.md)。

本节文字是要求，不因为部分条款已由 lint 实现就删除。形状类条款（文件名、跨层 import、`console`、logger 工厂、迁移编号）优先进入各包 lint；名实、动词对齐、目录语义仍按条款判断。机器命令和产出路径见项目 `AGENTS.md` 的机器检查落点，不在本文件写死某一种扫描器。

---

## 检查什么

1. **命名**：文件、符号与仓库既有风格一致；名实相符；同层动词统一；避免含糊的 `Manager` / `Handler`。
2. **目录归属**：新代码落在既有分层/域边界内；不把业务逻辑堆进入口或杂物目录。
3. **日志**：用项目统一 logger；有可关联上下文；不散落 `console.log`；敏感信息脱敏。
4. **迁移**：schema 变更有迁移；与依赖该变更的代码同提交；破坏性迁移有备份/回滚路径（见 database practice）。

无发现时写「无发现」并注明对照了仓库约定还是本默认清单。
