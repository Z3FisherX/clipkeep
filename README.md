# 拾片 · Clipkeep

面向 Apple Silicon Mac 的视频与音频下载工具。粘贴链接，选择格式和画质，在本机保存 MP4 视频、M4A 音频，或各保存一份。

当前版本：**0.6.1**，预发布试用。主界面采用固定双栏：左侧准备下载，右侧管理队列与历史。

[下载 Apple Silicon 版](https://github.com/Z3FisherX/clipkeep/releases/download/v0.6.1/Clipkeep-0.6.1-mac-arm64.zip) · [SHA256 校验文件](https://github.com/Z3FisherX/clipkeep/releases/download/v0.6.1/SHA256SUMS.txt) · [版本发布页](https://github.com/Z3FisherX/clipkeep/releases/tag/v0.6.1)

[使用指南](docs/USER-GUIDE.md) · [更新记录](CHANGELOG.md) · [开发与测试](docs/TESTING.md) · [发布流程](docs/RELEASING.md)

## 功能

- 读取 YouTube、B站、抖音、小红书、X、TikTok、Vimeo、微博，以及公开网页和 MP4/HLS/DASH 来源。
- 视频、音频与双输出；画质选择、独立任务目录和成品校验。
- 批量添加、顺序队列、排序、取消、重试和重启恢复。
- 历史搜索、状态筛选、打开成果与重新下载。
- 抖音、Vimeo、X 的 App 内网页登录及来源选择。

实际平台访问受内容权限、地区、登录验证和上游接口变化影响。请保存自己拥有下载权限的内容。

## 安装与使用

| 项目 | 要求 |
| --- | --- |
| 设备 | Apple Silicon Mac（arm64） |
| 系统 | 应用声明 macOS 13.0 起；实际测试范围见版本说明 |
| 下载工具 | App 随附固定版本 yt-dlp |
| 本机工具 | FFmpeg、ffprobe、Node.js 24 |
| 签名 | 当前发行流程采用本地 ad-hoc 签名 |

从上方入口下载 ZIP；解压后进入 `拾片-darwin-arm64` 文件夹，将 `拾片.app` 拖入“应用程序”。首次打开时按 macOS 的来源确认提示操作。

使用 Homebrew 准备本机工具：

```sh
brew install ffmpeg node@24
```

打开 App，在底部 **设置与帮助** 检查工具状态。粘贴链接、点击 **读取视频**，选择输出格式和目录，再点击 **开始下载**。结束的任务可在 **历史** 中查看。

完整的批量、登录、文件恢复和重启操作见 [使用指南](docs/USER-GUIDE.md)。

## 从源码运行

使用 Node.js 24、npm 和 Git，获取源码后执行：

```sh
git clone https://github.com/Z3FisherX/clipkeep.git
cd clipkeep
npm ci
npm run tools:prepare
npm run dev
```

`tools:prepare` 从 yt-dlp 官方 Release 下载固定版本，核对仓库记录的 SHA256；已有相同文件会复用。二进制保存在本地 `vendor/yt-dlp`。

## 开发与检查

```sh
npm run check
npm run test:ui
npm run test:queue-ui
npm run test:layout
```

`check` 覆盖公开文件、依赖审计、TypeScript、ESLint、单元测试与构建；Electron 操作验收在 macOS 上使用隔离数据和本机媒体工具。测试生成的数据位于本地 `evidence/`。

[测试范围与环境](docs/TESTING.md) · [实现说明](docs/IMPLEMENTATION.md) · [贡献约定](CONTRIBUTING.md)

## 构建安装包

```sh
npm run tools:prepare
npm run package
npm run release:archive
```

App 输出到 `release/拾片-darwin-arm64/拾片.app`；ZIP 和 SHA256 清单输出到 `release/`。手动运行 GitHub Actions 的 **Prepare release** 工作流可生成相同工件。

## 本地数据与隐私

任务、历史和偏好保存在应用用户数据目录；媒体写入用户选择的文件夹。Chrome 登录态由用户显式选择，App 网页会话由用户确认授权，按平台隔离。清除会话或退出 App 后结束会话授权。

公开网页请求经过本机网络校验；合成 DNS 环境使用 Cloudflare HTTPS DNS 核实公共 IP，查询内容含域名。技术边界见 [实现说明](docs/IMPLEMENTATION.md)。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `src/` | React 界面与任务交互 |
| `electron/` | 主进程、下载、队列、存储、会话与网络校验 |
| `shared/` | 类型、平台与通信约定 |
| `tests/`、`scripts/` | 测试、构建、公开文件检查与打包 |
| `vendor/` | 固定工具版本、校验清单与第三方许可 |
| `.github/` | 自动检查、发行工件流程与反馈模板 |

## 许可与反馈

项目原创代码和文档采用 [MIT](LICENSE)。第三方组件按各自许可提供，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。图标生成说明位于 [素材目录](assets/brand/generation.md)。

功能建议和问题反馈使用 [Issues](https://github.com/Z3FisherX/clipkeep/issues)。安全问题的报告范围与处理方式见 [SECURITY.md](SECURITY.md)。后续重点见 [路线图](docs/ROADMAP.md)。
