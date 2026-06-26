# Workflow Foundation Plugins

这是一个 Codex / Cursor 可复用插件仓库，用于分发 `workflow-foundation` 工作流技能集。

当前插件包含：

- `workflow-runtime`：最小确定性 Workflow Runtime 定义与本地 MVP 实现。
- `trace-emit`：结构化 trace emit schema、事件语义、工具实现与测试。
- `git-commit-convention`：安全提交与提交信息约定。
- `chrome-mcp-workflow`：Chrome MCP/CLI 浏览器操作流程约定。
- `express-star-cloudrun-deploy`：`express_star` CloudRun 云托管主服务部署流程。
- `express-star-cloudfunctions-deploy`：`express_star` 云开发云函数部署流程。
- `express-star-logs`：`express_star` CloudRun 部署记录、进程日志与健康检查。
- `admin-dev-deploy`：TrystOfStars admin 开发环境静态托管部署流程。
- `tryst-lark-cli`：TrystOfStars 飞书/Lark 证据同步工作流。
- `lark-notify-user`：通过 `lark-cli` 发送飞书/Lark 用户或群通知。
- `mini-runtime` 及其子技能：TrystOfStars 小程序真实运行时预览、烟测、流程验证、状态检查、console 监听与 CloudRun/RUM 取证。

## Codex 安装

在其他电脑上安装 marketplace：

```bash
codex plugin marketplace add git@github.com:gfzy9876/workflow-foundation-plugins.git
codex plugin marketplace upgrade
```

然后在 Codex 插件目录中安装 `workflow-foundation`。

## Cursor 安装

Cursor 使用仓库根目录的 `.cursor-plugin/plugin.json`。安装或更新时请使用当前 GitHub 仓库：

```text
https://github.com/gfzy9876/workflow-foundation-plugins
```

如果 Cursor 仍显示旧版本，先确认本地缓存是否还停在旧提交：

```bash
find ~/.cursor/plugins/cache/workflow-foundation -path '*/.cursor-plugin/plugin.json' -print
```

当前发布源以 GitHub `main` 为准；旧的 Gitee 地址只代表历史迁移路径，不再作为安装源。
