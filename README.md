# Workflow Foundation Plugins

这是一个 Codex 插件 marketplace 仓库，用于分发 `workflow-foundation` 插件。

当前插件包含：

- `workflow-runtime`：最小确定性 Workflow Runtime 定义与本地 MVP 实现。
- `trace-emit`：结构化 trace emit schema、事件语义、工具实现与测试。
- `git-commit-convention`：安全提交与提交信息约定。
- `chrome-mcp-workflow`：Chrome MCP/CLI 浏览器操作流程约定。
- `express-star-cloudrun-deploy`：`express_star` CloudRun 云托管主服务部署流程。
- `express-star-cloudfunctions-deploy`：`express_star` 云开发云函数部署流程。

在其他电脑上安装 marketplace：

```bash
codex plugin marketplace add git@gitee.com:gfzy9876/workflow-foundation-plugins.git
codex plugin marketplace upgrade
```

然后在 Codex 插件目录中安装 `workflow-foundation`。
