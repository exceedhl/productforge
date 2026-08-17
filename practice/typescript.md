# TypeScript 最佳实践

## 类型边界

- **严禁滥用 `any`，拥抱 `unknown`**：禁止新增无理由的 `any` 来关闭类型检查。系统边界、外部输入、动态 DSL、schema、agent tool payload 等不确定类型应优先使用 `unknown`、schema 校验、类型守卫或更精确的领域类型；历史 `any` 在触及时逐步收敛，并在确需保留时通过命名、局部封装或注释说明边界原因。
- **巧用 `satisfies` 操作符**：当需要校验对象结构合法性，同时又想保留其内部属性的最精确类型推导时，使用 `satisfies` 而非直接的类型断言或标注。
- **接口 (Interface) vs 类型 (Type)**：对外暴露的 API 或对象结构优先使用 `interface`；联合类型、交叉类型或复杂工具类型使用 `type`。

## 类型建模

- **利用辨识联合 (Discriminated Unions) 作为状态机**：处理多分支状态时，必须使用一个共有属性（如 `status` 或 `type`）来实现类型安全的分支推导与穷尽检查。
- **利用推导，拒绝过度注解**：对于简单的赋值推导，不要画蛇添足加类型注解。仅在系统边界（函数参数、返回值、对外 API）进行严格显式注解。
- **拒绝大写基础类型 (Avoid Boxed Types)**：永远只使用小写的原始类型（`string`、`number`、`boolean`），严禁使用大写的包装类型（`String`、`Number`）。
