# 拾片应用图标

生成方式：内置 imagegen 工具，2026-10-24。透明背景 PNG 原图保存在 `clipkeep-icon-v2.png`；Swift/AppKit 按原图等比缩放生成 16–1024 px 图标与 macOS ICNS，保留 Alpha。

- `clipkeep-icon-v2.png`：完整生成原图。
- `clipkeep-mark-128.png`：界面品牌标志。
- `clipkeep-favicon-64.png`：页面图标。
- `Clipkeep-v2.icns`：macOS 应用与 Dock 图标。
- `Clipkeep-v2.iconset/`：各分辨率 PNG。

生成提示词：

```text
Use case: logo-brand
Asset type: production macOS desktop application icon for Clipkeep (拾片), a personal local video and audio downloader and collection manager.
Primary request: Create one exceptionally polished, distinctive macOS app icon communicating keeping a video clip locally: a warm ivory rounded video tile with a simple triangular play cutout nestles into a deep teal open collection tray, one elegant integrated silhouette. A tiny mint edge on the rear tile suggests a collection. Calm, friendly, premium desktop utility.
Style/medium: precise minimalist dimensional app icon, softly sculpted satin surfaces, subtle bevels and restrained studio shading, excellent small-size legibility.
Composition/framing: single front-facing centered icon, square canvas, a deep forest-teal rounded-square app tile filling about 86% of canvas, generous consistent transparent outside padding. The ivory clip and collection tray centered within the tile, bold and instantly readable at 32 pixels.
Color palette: derive from the existing app's forest teal #236d64, pale mint and warm ivory.
Constraints: actual transparent background outside the rounded-square tile. Single finished icon, no presentation sheet, no scene, no desktop screenshot, no typography, no letters, no watermark, no extra decorations. Symmetrical overall visual balance, crisp clean silhouette.
```

图标格式生成：

```sh
swift scripts/icon-from-image.swift assets/brand/clipkeep-icon-v2.png assets/brand/Clipkeep-v2.iconset
iconutil -c icns assets/brand/Clipkeep-v2.iconset -o assets/brand/Clipkeep-v2.icns
```
