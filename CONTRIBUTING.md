# 参与开发

欢迎围绕实际使用场景提交 Issue 和 Pull Request。提案描述触发条件、期望行为及验收方式，改动集中于一个主题。

## 环境与运行

Apple Silicon Mac、Node.js 24、FFmpeg/ffprobe。克隆后执行：

```sh
npm ci
npm run tools:prepare
npm run dev
```

## 编码约定

- TypeScript strict；使用 `unknown` 和类型守卫处理外部输入。
- 对象优先定义 `interface`；联合和交叉使用 `type`。
- React 函数组件与 Hooks；异步使用 async/await。
- 变量和函数 camelCase，类型 PascalCase，常量 UPPER_SNAKE_CASE。
- 按功能组织目录，新文件控制在 300 行以内，函数控制在 50 行以内。
- 提交信息使用 Conventional Commits，例如 `fix(queue): preserve original quality`。

## 验证

提交前执行 `npm run check`。业务修复增加覆盖实际行为的回归测试；界面和下载流程改动执行相关 Electron 验收，参见 [测试说明](docs/TESTING.md)。

说明验证命令、结果和环境。测试证据按输入状态复用，相关代码、依赖或配置改变后运行受影响的检查。

## 公开内容

源码、必要文档、测试和许可进入仓库。运行数据、截图原稿、下载媒体、安装包和历史交付资料保存在本地目录；公开截图和日志先去除个人目录、账号、会话信息和签名地址。`npm run check:public` 校验待提交文件范围及常见敏感内容。

Issue 示例使用公开且有权下载的内容。登录、验证码和系统授权由使用者本人完成。

## 许可

贡献的项目原创代码和文档按仓库 MIT 许可提供。引入第三方组件时同步更新版本、来源、原始许可和发行清单。
