// 链路追踪 API（Trace 视图数据源，R19）。
// 后端契约（internal/server/http/handlers/traces.go、metering.go，以代码为准）：
// - GET /traces?trace_id=&page=&page_size=
//     → {traces:[{trace_id, name, kind, started_at, duration_ms, span_count}],
//        page, page_size, total}
//     按开始时间倒序；trace_id 精确匹配链路 ID；
//     duration_ms 为全部跨度耗时合计（嵌套不去重）；page_size 上限 100。
// - GET /traces/{trace_id}/spans → {spans:[{id, parent_id, name, kind,
//     started_at, duration_ms, attrs, has_io}]}（按开始时间升序，attrs 为 JSON 对象；
//     has_io 表示另有模型输入输出，正文不在本列表）
// - GET /traces/{trace_id}/spans/{span_id}/io → {span_id, input, output,
//     input_truncated, output_truncated, input_sha256, output_sha256}
// - GET /metering/traces/{id} → {records:[{trace_id, agent, role, model, purpose,
//     prompt_tokens, completion_tokens, total_tokens, cost_estimate, created_at}],
//     page, page_size, total}（{id} 即链路 ID，与 trace_id 同义）
import request from './request'

export function listTraces({ traceId, page = 1, pageSize = 50 } = {}) {
  return request.get('/traces', {
    params: { trace_id: traceId, page, page_size: pageSize }
  })
}

export function getSpans(traceId) {
  return request.get(`/traces/${encodeURIComponent(traceId)}/spans`)
}

export function getSpanIO(traceId, spanId) {
  return request.get(
    `/traces/${encodeURIComponent(traceId)}/spans/${encodeURIComponent(spanId)}/io`
  )
}

export function getTraceMetering(id, { page = 1, pageSize = 100 } = {}) {
  return request.get(`/metering/traces/${encodeURIComponent(id)}`, {
    params: { page, page_size: pageSize }
  })
}
