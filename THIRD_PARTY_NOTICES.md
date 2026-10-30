# 第三方组件与素材

[MIT LICENSE](LICENSE) 适用于本仓库原创代码及文档。下表列出的组件保留各自许可；发行包附带原始声明。

| 内容 | 许可与来源 | 发行方式 |
| --- | --- | --- |
| Electron / Chromium | [Electron MIT](https://github.com/electron/electron/blob/main/LICENSE)，Chromium 及第三方声明 | 打包器保留 `LICENSE` 和 `LICENSES.chromium.html`，发行 ZIP 一并携带 |
| React / React DOM | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | 前端构建中使用，原始许可随 App 附带 |
| Scheduler | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | 随 React DOM 使用，原始许可随 App 附带 |
| Vite 构建辅助代码 | [MIT 与第三方条款](https://github.com/vitejs/vite/blob/main/LICENSE) | 构建工具及注入的辅助代码声明随 App 附带 |
| Zod | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) | 主进程构建中使用，原始许可随 App 附带 |
| yt-dlp | [Unlicense 与第三方条款](vendor/licenses/)；macOS 独立程序组合分发适用 GPLv3+ | 固定版本校验后原样随 App 附带；保留完整上游许可与版本来源 |
| 视频号协议适配 | [wx-downloader 许可](vendor/licenses/wx-downloader-LICENSE.txt)，MIT + Commons Clause | `electron/wechat/protocol.ts` 参考并适配上游元宝/视频号预览协议，随 App 携带原始许可 |
| FFmpeg / ffprobe | [FFmpeg 许可说明](https://ffmpeg.org/legal.html) | 使用用户本机安装 |
| Node.js | [Node.js 许可](https://github.com/nodejs/node/blob/main/LICENSE) | 使用用户本机安装 |
| 拾片图标 | 本项目 AI 生成素材；生成说明见 [generation.md](assets/brand/generation.md) | 作为项目素材提供，品牌名称与标识授权范围见下文 |

## yt-dlp 版本与源码

版本和哈希位于 [vendor/yt-dlp.json](vendor/yt-dlp.json)，原始声明位于 [vendor/licenses/](vendor/licenses/)。

- [对应版本完整发布](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19)
- [对应版本源码](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19)
- [完整第三方声明与组件源码入口](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/THIRD_PARTY_LICENSES.txt)
- [构建方法](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/bundle/pyinstaller.py)

公开分发包含该可执行文件的版本时，维护者按上游各组件许可履行声明与对应源码提供义务。发行清单要求核对实际归档的组件版本、许可及源码获取方式；项目 MIT 许可覆盖项目原创部分。

## 视频号协议适配

协议适配来源：[QinGeneral/wx-downloader client.py](https://github.com/QinGeneral/wx-downloader/blob/main/src/wx_channels_cli/client.py)，上游参考 [ltaoo/wx_channels_download](https://github.com/ltaoo/wx_channels_download)。授权文件保留上游的版权归属与 Commons Clause 附加条件。

`electron/wechat/protocol.ts` 的适配部分按上述条款提供；项目原创 UI、会话管理和队列代码继续按项目 MIT 许可提供。Commons Clause 对条款所定义的收费产品或服务要求单独授权，分发时一并保留该条件。许可已纳入 `vendor/licenses/` 的发行收集流程。

## 品牌素材

图标制作过程见素材目录。项目代码和文档按 MIT 提供；拾片名称及标识用于标识本项目，衍生发行应清楚标明其维护者与来源。AI 生成素材的权利范围以适用法律和生成服务条款为准。
