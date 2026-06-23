# 存储与监控管线

## MVP 管线

先从 append-only 本地 sink 开始：

```txt
trace.emit
  -> JSONL file 或 stdout
  -> offline parser
  -> basic query/report script
```

建议本地路径：

```txt
traces/YYYY-MM-DD/<trace-root-or-date-bucket>.jsonl
```

emit API 仍然只暴露 `traceId` 和 `parentTraceId`；root 聚合属于存储层优化。

## 生产管线

```txt
trace.emit
  -> local buffer
  -> HTTP collector 或 queue
  -> durable event store
  -> derived metrics and tree indexes
  -> dashboard, alerting, replay, statistics
```

可选存储：

- ClickHouse：适合高容量分析型 trace。
- PostgreSQL：适合低中容量运维查询。
- Elasticsearch/OpenSearch：适合文本搜索较重的运维场景。
- Object storage：适合 raw JSONL 归档。

## 表结构

核心列：

```txt
trace_id
parent_trace_id
timestamp
schema_version
layer
emitter
event
status
level
subject_type
subject_name
subject_id
duration_ms
error_code
error_retryable
attributes_json
security_redaction
```

建议索引：

```txt
trace_id
parent_trace_id
timestamp
event
layer
subject_name
status
error_code
```

## 派生视图

这些能力放在 emit tool 之外构建：

- 基于 `parentTraceId` 递归遍历的 trace tree；
- workflow 成功/失败统计；
- step 耗时分位数；
- tool 成功率和重试率；
- checkpoint restore 频率；
- approval 等待时长；
- 按 `error.code` 聚合的失败分布；
- 最慢 emitter 或 tool wrapper 排名。

## MVP 范围

最小可用版本：

- 实现 `trace.emit`；
- 持久化 JSONL；
- 强制字段：`traceId`、`parentTraceId`、`timestamp`、`layer`、`emitter`、`event`、`status`；
- 支持 `events.md` 中的标准事件；
- 加默认脱敏策略；
- 后续再补一个 tree reconstruction 查询或脚本。

不要把 dashboard、collector、alerting、replay UI 作为第一版前置条件。
