# GitHub 发布流程

## 内容决策

| 内容 | 保存位置 | 校验 |
| --- | --- | --- |
| 代码、必要文档、测试、锁文件和许可 | Git 仓库 | `npm run check:public` |
| 下载工具 | 本地 vendor，发行时装入 App | 官方固定版本及仓库 SHA256 |
| 运行数据和历史交付材料 | 本地 evidence、历史 docs | Git 忽略规则 |
| 安装包、ZIP、SHA256 | 本地 release；GitHub Release 附件 | 签名、安装包验收、ZIP 与校验清单 |
| GitHub 自动检查 | `.github/workflows` | 固定 Actions SHA、只读权限、显式触发 |

## 提交与验收记录

实现、验收修正和文档按阶段独立提交，采用 Conventional Commits。代码与对应回归测试一同提交，交付文档使用 `docs` 提交记录。

| 提交 | 范围 | 验证记录 |
| --- | --- | --- |
| `6496b2e` · `feat(ux)` | 0.8.0 用户体验实现与初次交付 | 初次全量和集成证据 |
| `9caa77d` · `fix(ux)` | R01–R06 验收修正及回归 | 152 项测试、静态检查、六组 Electron 场景及修正版打包 |
| `docs(ux)` 文档提交 | README、更新记录、实现及发行说明 | 文档链接、差异检查与代码验证输入匹配 |

验收证据引用精确的代码提交。文档提交继续引用相同源码、依赖和配置对应的有效验证；安装包记录构建代码提交，归档记录随包文档提交与 SHA256。本地交接保存于 `evidence/user-optimization-20261103/handoff.json`。

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

默认打包采用本地 ad-hoc 签名。Developer ID 模式由 `scripts/release/signing.mjs` 生成配置，校验明确指定的 Application 身份与用户已经配置的公证 profile，并启用 Hardened Runtime、时间戳与公证。

```sh
CLIPKEEP_RELEASE_MODE=developer-id CLIPKEEP_SIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' CLIPKEEP_NOTARY_PROFILE='your-existing-profile' npm run package
node scripts/release/verify-signing.mjs 'release/拾片-darwin-arm64/拾片.app' evidence/signing.json
```

证书安装、账号与钥匙串授权由维护者本人完成。发行验收要求 `codesign --verify --deep --strict`、Developer ID 身份、公证装订票据和 Gatekeeper 评估全部通过。本机 ad-hoc 证据与 Developer ID 发行证据分别记录。打包在签名前校验固定上游 yt-dlp；Developer ID 模式对嵌入工具签名后的字节以最终发行归档 SHA256 为准。

应用内更新从固定 GitHub 仓库读取发布信息，安装包下载后校验官方 SHA256、归档路径、签名和公证，再通过 Finder 提供安装。解析器独立保存在应用数据目录，通过暂存校验及原子替换升级，升级前实际选用的随包、自选或应用内版本均保留已校验副本作回退。

## 验证证据

本地报告保存于 `evidence/`；GitHub 的运行状态与日志以仓库 Actions 实际执行结果为准。安装包验收覆盖真实工具检测、页面隔离、平台入口和授权重置；平台下载行为由受控来源及相应实测记录覆盖。

官方参考：[Electron 签名与公证](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[Forge macOS 签名](https://www.electronforge.io/guides/code-signing/code-signing-macos)、[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[macOS runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[yt-dlp 许可说明](https://github.com/yt-dlp/yt-dlp#license)。
