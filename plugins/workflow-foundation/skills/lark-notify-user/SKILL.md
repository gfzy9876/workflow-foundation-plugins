---
name: lark-notify-user
description: 通过 `lark-cli im +messages-send` 从 Codex 或其他智能体向指定飞书/Lark 用户或会话发送通知。适用于工作流完成、失败、部署、审计、长任务进度更新，或用户明确要求智能体给自己发送飞书/Lark 消息的场景。
---

# 飞书用户通知

## 概览

使用 `lark-cli` 从智能体发送简洁的飞书/Lark 消息。常规通知优先使用 bot 身份，因为应用配置完成后不需要每次重新获取用户 OAuth token。

## 前置条件

- 已安装 `lark-cli`，并已配置飞书/Lark 应用。
- 应用机器人已开启机器人能力，并已发布生效。
- 应用具备至少一个 IM 发消息权限，常见为 `im:message`、`im:message:send_as_bot` 或 `im:message:send`。
- 给用户私聊发消息时，目标用户必须在应用机器人的可用范围内。
- 给会话/群发消息时，机器人必须在目标会话中，并且有发言权限。

检查本地状态时不要暴露密钥：

```bash
lark-cli doctor
lark-cli profile list
lark-cli im +messages-send --help
```

不要输出 app secret、access token 或完整鉴权载荷。

## 接收方 ID

- 用户 `open_id` 以 `ou_` 开头。
- 群聊或单聊会话 `chat_id` 以 `oc_` 开头。
- 消息 ID 以 `om_` 开头。

如果用户给出 `oc_...` 并声称这是用户 open_id，先用 CLI 校验。`lark-cli im +messages-send --user-id oc_...` 会在本地拒绝为非法用户 ID；`oc_...` 应使用 `--chat-id`。

本机已验证的默认接收用户：

```text
user open_id: ou_e71b5467bf7448ccb530030b0a8b6a66
```

仅当用户要求通知同一个已配置 owner，或当前上下文明确指向该接收方时使用这个 ID。其他情况应要求用户提供用户 `ou_...` 或会话 `oc_...`。

## 发送通知

优先先发送简短纯文本通知：

```bash
lark-cli im +messages-send \
  --user-id ou_e71b5467bf7448ccb530030b0a8b6a66 \
  --text "Codex 通知：任务已完成。" \
  --as bot
```

发送到会话/群：

```bash
lark-cli im +messages-send \
  --chat-id oc_xxx \
  --text "Codex 通知：任务已完成。" \
  --as bot
```

发送 Markdown/富文本：

```bash
lark-cli im +messages-send \
  --user-id ou_xxx \
  --markdown "**Codex 通知**\n\n任务已完成。" \
  --as bot
```

可重试的自动化流程应使用 `--idempotency-key`，避免重复发送：

```bash
lark-cli im +messages-send \
  --user-id ou_xxx \
  --text "Codex 通知：部署完成。" \
  --idempotency-key "codex-deploy-<repo>-<commit>" \
  --as bot
```

## 获取用户 ID

如果用户只提供姓名、邮箱或手机号，先用 user 身份搜索通讯录：

```bash
lark-cli contact +search-user --query "name-or-email-or-phone" --as user --format pretty
```

如果返回 `need_user_authorization`，要求用户运行或授权：

```bash
lark-cli auth login --scope "contact:user.base:readonly"
```

仅有基础通讯录 scope 时，手机号搜索可能没有结果。可行时优先使用姓名或邮箱。

## 验证结果

只有返回 `ok: true` 且响应里包含 `message_id` 时，才视为发送成功。

成功响应示例：

```json
{
  "ok": true,
  "identity": "bot",
  "data": {
    "chat_id": "oc_...",
    "create_time": "2026-06-24 18:26:09",
    "message_id": "om_..."
  }
}
```

最终回复中报告 `message_id`、发送身份和接收方类型。除非用户确认，否则不要声称用户已经看到消息。

## 常见失败

- `invalid user ID format, should start with 'ou_'`：传入的不是用户 open_id。改用真实 `ou_...`，或用 `--chat-id` 发送到会话。
- `230002 Bot/User can NOT be out of the chat`：当前 bot 或 user 身份不在目标会话中。把机器人拉进会话，或改为发送给用户 `ou_...`。
- `230006 Bot ability is not activated`：应用未启用机器人能力。需要开启机器人能力并发布应用版本。
- `230013 Bot has NO availability to this user`：目标用户不在应用机器人可用范围内。把用户加入可用范围并发布应用。
- `230027 Lack of necessary permissions`：缺少发消息权限。到开发者后台补充 IM 发消息 scope，并按需发布/审批。
- `need_user_authorization`：user 身份操作需要运行 `lark-cli auth login --scope "<missing-scope>"` 完成授权。

如果 `lark-cli` 输出 `_notice.update`，在完成通知任务后顺带提示版本更新；不要让更新提示干扰发送结果判断。
