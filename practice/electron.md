# Electron 最佳实践

## 进程职责

- **Main 当 Server，Renderer 当 Client**：严格区分主进程与渲染进程职责。任何涉及文件系统、数据库、系统级敏感操作只能在主进程执行。
- **避免阻塞主进程**：不允许在主进程执行高耗时或 CPU 密集型任务，必须移交给 Worker Threads、独立进程或其他隔离执行环境，避免 UI 冻结。

## 安全配置

- **安全三板斧**：创建窗口时强制配置：1) `nodeIntegration: false` 2) `contextIsolation: true` 3) `sandbox: true`。
- **严格白名单的 Preload 桥接**：绝不能将整个 `ipcRenderer` 暴露给前端。必须通过 `contextBridge.exposeInMainWorld` 定义极度受限的白名单 API 函数。

## IPC 通信

- **现代 IPC 通信模型 (invoke/handle)**：优先使用基于 Promise 的 RPC 模式：前端调用 `ipcRenderer.invoke`，主进程使用 `ipcMain.handle` 响应，保障类型安全与异步逻辑清晰。避免无约束地使用基于事件的 `send/on`。

## 版本来源

- **版本来源单一化**：桌面端展示版本必须从 Electron/package metadata 读取（如 `app.getVersion()`），禁止在 About 面板、安装包配置或 UI 中硬编码版本号。
