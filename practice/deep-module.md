# 深模块设计准则

用于确实需要模块封装、接口设计或 seam 调整的场景。它不鼓励提前抽象；默认仍遵循 YAGNI：**先确认模块边界是当前问题真实需要的，再把模块设计成深模块。**

## 与 YAGNI 的关系

YAGNI 高于深模块设计：

- 不要为了“架构更漂亮”提前创建 module、interface、adapter、factory 或配置层。
- 不要为了未来复用引入当前没有调用方支撑的 seam。
- 不要把一行转发或薄 wrapper 包装成“架构层”。
- 如果当前问题不需要模块边界，保持 inline、小函数或复用现有能力。

但一旦当前需求、根因修复、测试 seam 或维护阻塞证明封装是必要的，就必须遵循深模块设计：**小 interface，大 implementation，清晰 seam，高 locality，高 leverage。**

## 何时允许引入模块封装

只有出现真实信号时才引入新模块边界：

- 多个调用点共享同一领域决策，继续分散会导致散弹式修改。
- 当前 bug 暴露出缺少 locality，无法在一个位置完成根因修复。
- 现有浅层 wrapper 增加调用方理解成本，却没有隐藏任何复杂度。
- 当前需求需要稳定公共能力，而不是某个页面、路由或函数内的一次性逻辑。
- 测试真实行为必须穿过一个缺失的公共 seam，且已与用户确认这是当前工作的一部分。
- 某个底层能力需要隔离可替换边界，例如文件系统、sandbox、LLM、数据库、外部 API 或桌面主进程 IPC。

## 核心词汇

保持术语一致，避免用含义模糊的词替换。

- **Module**：任何拥有 interface 和 implementation 的东西；可以是函数、类、包、领域能力或跨层切片。
- **Interface**：调用方为了正确使用 module 必须知道的一切，不只是 TypeScript 类型签名；还包括不变量、顺序约束、错误模式、配置要求和性能特征。
- **Implementation**：module 内部代码和复杂逻辑。
- **Depth**：调用方每学习一单位 interface 能获得多少行为。interface 小、背后行为多，就是深。
- **Seam**：可以通过某个公共边界改变或观察行为的位置。测试和调用方应穿过同一个 seam。
- **Adapter**：在 seam 上满足 interface 的具体实现。一个 adapter 通常是假想 seam；两个 adapter 才证明 seam 真实存在。
- **Leverage**：一个实现能服务多个调用点、测试或场景。
- **Locality**：变更、bug、知识和验证集中在一处，而不是散落在调用方。

## 深模块 vs 浅模块

深模块：

```text
小 interface
    ↓
隐藏复杂 implementation
    ↓
调用方获得高 leverage，维护者获得高 locality
```

浅模块：

```text
大 interface / 很多参数 / 很多方法
    ↓
薄 implementation / 纯转发 / 只改名不降复杂度
    ↓
调用方仍需理解内部细节
```

浅模块通常应该被删除、inline，或重新设计成真正隐藏复杂度的深模块。

## 设计规则

### 1. Interface 要小

- 减少方法数量。
- 减少参数数量。
- 用领域对象表达成组参数，避免 data clumps。
- 不把内部步骤暴露给调用方。
- 不让调用方知道内部排序、缓存、重试、状态流转等细节，除非这是业务 contract。

### 2. Implementation 可以深

- 复杂度应藏在 module 内部，而不是摊给每个调用方。
- 一个复杂实现如果换来简单 interface，是可接受的。
- 内部可以有私有小函数、内部 seam 或 adapter，但不要泄漏到公共 interface。

### 3. Seam 要真实

- seam 的位置是独立设计决策。
- 没有真实变化点时，不要引入 seam。
- 单实现 interface、单产品 factory、单 adapter abstraction 默认删除。
- 外部系统边界可以是 seam：数据库、文件系统、网络 API、桌面主进程、sandbox、LLM provider。

### 4. 测试穿过公共 interface

- interface 是测试表面。
- 测试外部行为，不测试私有实现细节。
- 不为了 mock 内部协作者而新增 production abstraction。
- 如果没有正确 seam 能覆盖真实行为，先与用户确认是否把 seam 调整纳入当前工作。

### 5. 用删除测试判断价值

想象删除该 module：

- 如果复杂度消失，它只是 pass-through，应删除或 inline。
- 如果复杂度会在多个调用方重新出现，它在提供 locality 和 leverage，值得保留。

不为目录分层新增一行转发；只有表达不同抽象层级或隔离可替换边界时才保留层。

## 命名规则

- 名称必须反映领域职责，而不是技术姿势。
- 避免 `Manager` / `Handler` 这类模糊名。
- 只读可能缺失用 `find` / `load`；必须存在用 `get` / `require`；持久化区分 `save` / `create` / `update`；执行语义用 `run` / `execute` / `refresh`。
- 平行领域的同类能力使用同一套动词与宾语，只替换 domain 主体。

## 最终判断

引入模块前问：

1. 当前问题是否真的需要新边界？
2. 删除它会让复杂度消失，还是让复杂度散回多个调用方？
3. 调用方需要学习的 interface 是否足够小？
4. implementation 是否隐藏了真实复杂度？
5. 测试是否能通过同一个公共 seam 验证行为？
6. 是否提高了 locality 和 leverage？

如果答案不能支持这些问题，就不要封装；如果能，就把它做深。
