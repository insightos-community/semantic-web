// 系统域 API。
// GET /system/healthz 为公开探活端点（auth 白名单），进程存活即 {status:"ok"}。
import request from './request'

export function getHealthz() {
  if (import.meta.env.VITE_STUDIO_FIXTURES === 'true') {
    return Promise.resolve({ status: 'ok', fixture_mode: true })
  }
  return request.get('/system/healthz')
}
