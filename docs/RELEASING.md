# GitHub 发布流程

## 内容决策

| 内容 | 保存位置 | 校验 |
| --- | --- | --- |
| 代码、必要文档、测试、锁文件和许可 | Git 仓库 | `npm run check:public` |
| 下载工具 | 本地 vendor，发行时装入 App | 官方固定版本及仓库 SHA256 |
| 运行数据和历史交付材料 | 本地 evidence、历史 docs | Git 忽略规则 |
| 安装包、ZIP、SHA256 | 本地 release；GitHub Release 附件 | 签名、安装包验收、ZIP 与校验清单 |
| GitHub 自动检查 | `.github/workflows` | 固定 Actions SHA、只读权限、显式触发 |

## 本地准备

```sh
npm ci
npm run tools:prepare
npm run check
npm run test:ui
npm run test:queue-ui
npm run test:layout
npm run package
node scripts/packaged-smoke.mjs 'release/拾片-darwin-arm64/拾片.app/Contents/MacOS/拾片' evidence/packaged-release
npm run release:archive
```

`release/Clipkeep-<版本>-mac-arm64.zip` 保留整个打包目录，含 App、Electron/Chromium 许可、用户指南和版本说明。App 内 `Contents/Resources/third-party/` 保留项目、React、React DOM、Scheduler、Zod、Vite、yt-dlp 许可和组件版本清单。压缩包旁提供 `SHA256SUMS.txt`。

## 仓库设置

1. 创建 GitHub 仓库，设置 main 为默认分支，关联本地 Git。
2. 推送源码，确认 CI 的 **Source and macOS checks** 状态。
3. 为 main 配置 Pull Request 和上述检查要求。
4. 启用 Issues、Dependabot 与 Private vulnerability reporting。
5. 核对仓库描述、MIT 许可识别与 README 中的相对链接。

## 版本与分发

1. 同步 `package.json`、锁文件、CHANGELOG 和 `docs/releases/<版本>.md`。
2. 准备与 package.json 版本匹配的版本说明，完成上述检查。
3. 核对 yt-dlp 发行文件、原始许可与对应源码获取安排，参考 [第三方说明](../THIRD_PARTY_NOTICES.md)。
4. 在准备发布的提交创建 `v<版本>` 标签。
5. 针对该标签手动运行 **Prepare release**，下载 `clipkeep-mac-arm64` 工件。
6. 在 GitHub Releases 创建预发布，附 ZIP、SHA256SUMS 和版本说明。
7. 使用新 macOS 用户环境验收解压、首次打开、工具准备和第一条下载。

当前流程采用本地 ad-hoc 签名。更广范围发行时，将 Developer ID 签名、公证与首次安装体验纳入独立发布改动。

## 验证证据

本地报告保存于 `evidence/`；GitHub 的运行状态与日志以仓库 Actions 实际执行结果为准。安装包验收覆盖真实工具检测、页面隔离、平台入口和授权重置；平台下载行为由受控来源及相应实测记录覆盖。

官方参考：[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[macOS runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[yt-dlp 许可说明](https://github.com/yt-dlp/yt-dlp#license)。
