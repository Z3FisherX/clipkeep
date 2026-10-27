# 下载工具来源

执行 `npm run tools:prepare`，从官方 Release 获取固定版本的 macOS 通用可执行文件，并与仓库记录的 SHA256 核对。已有文件通过相同校验后复用。

- 版本、下载地址与校验值：[yt-dlp.json](yt-dlp.json)。
- 官方校验清单：[SHA2-256SUMS](https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS)。
- 版本源码与构建入口：[2026.08.19](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19)、[PyInstaller 构建脚本](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/bundle/pyinstaller.py)。
- 原始许可：[licenses/](licenses/)。

准备后的 `vendor/yt-dlp` 保存在本地，打包时原样复制到 App 的 `Contents/Resources/yt-dlp`。源码仓库保存获取脚本和校验清单。

yt-dlp 项目本身采用 Unlicense；macOS PyInstaller 可执行文件含有第三方组件，组合分发适用 GPLv3+ 等上游条款。详见 [第三方说明](../THIRD_PARTY_NOTICES.md)。FFmpeg、ffprobe 和 Node.js 使用用户本机安装。
