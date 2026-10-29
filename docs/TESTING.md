# 测试与自动检查

## 环境

使用 Node.js 24 与 `npm ci` 安装锁定依赖。完整验收环境为 Apple Silicon macOS、FFmpeg、ffprobe 和固定版本 yt-dlp。执行 `npm run tools:prepare` 准备工具。

类型检查与构建采用 TypeScript 7.0.2，通过 `@typescript/native` 别名安装；`typescript` 指向官方 `@typescript/typescript6` 兼容包，为 ESLint 提供 TypeScript 6 编译器 API。该组合遵循 [TypeScript 官方并行安装说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)，`tsc` 使用版本 7，`tsc6` 使用兼容版本。`@types/node` 更新至 26.6.6，运行验收使用 Node.js 24 与 Electron 45 内置的 Node.js 24。

## 检查入口与通过条件

| 入口 | 覆盖范围 | 通过条件 |
| --- | --- | --- |
| `npm run check:public` | Git 已跟踪及待提交文件 | 文件范围、大小、个人路径与常见凭据模式检查通过 |
| `npm run audit:dependencies` | 全部锁定依赖 | 高危及严重级别审计通过 |
| `npm run typecheck` | 主进程、界面、共享约定和测试 | TypeScript strict 通过 |
| `npm run lint` | 项目源码与脚本 | ESLint 零警告 |
| `npm test` | 来源、网络、媒体、存储、任务与恢复 | 所有测试通过；播放列表边界测试使用真实 ffprobe |
| `npm run build` | React 与 Electron | 两端构建成功 |
| `npm run test:ui` | 单条下载、格式、取消、重试及工具状态 | Electron 流程完成、媒体校验通过 |
| `npm run test:queue-ui` | 批量、队列、历史、偏好与重启恢复 | 状态、文件与持久化断言通过 |
| `npm run test:batch-ui` | 批量重读与来源恢复 | 重读失败清除旧准备结果，重新读取成功后恢复入队 |
| `npm run test:layout` | 窗口、长标题、长队列及模态 | 控件可达、页面尺寸与窗口匹配 |
| `npm run test:access-ui` | 登录会话、授权、平台隔离和来源恢复 | 隔离测试会话断言通过 |
| `npm run test:media` | 真实 yt-dlp、FFmpeg、ffprobe 与本地 HTTP | 真实产物与下载调用断言通过 |
| `npm run test:platform-media` / `test:expansion-media` | 平台格式、静音、流媒体与恢复 | 对应媒体和网络边界断言通过 |

`npm run check` 顺序执行公开文件检查、依赖审计、类型、Lint、单元测试和构建。源码导出的目录需初始化 Git 后执行公开文件检查。

## GitHub Actions

`CI` 在 main 推送、Pull Request 和手动触发时运行，使用 `macos-15` Apple Silicon runner、Node 24 和本机媒体工具。检查后执行基础下载、队列、批量重读与布局验收。工作流以只读仓库权限运行，Actions 固定到提交 SHA，Dependabot 跟进依赖更新。

`Prepare release` 手动触发，执行相同检查和界面验收，再打包、核验安装包、生成 ZIP 与 SHA256 工件。工作流具体步骤见 `.github/workflows/`。

## 数据和证据

测试使用独立临时目录及本地生成媒体，`evidence/` 存放运行证据。证据记录命令、退出码、摘要、日志以及对应源码和配置状态。共享媒体服务输入保持一致时可复用验证；新修改执行受影响入口。

实际平台探测命令 `probe:platforms` 和 `probe:expansion` 使用公网来源，其结果与当时网络、账号权限及平台响应有关。日常 CI 采用受控来源。
