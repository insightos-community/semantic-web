// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SpanIOViewer from '@/components/trace/SpanIOViewer.vue'
vi.mock('@/api/traces', () => ({ getSpanIO: vi.fn() }))
import { getSpanIO } from '@/api/traces'
let app
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
it('loads selected model IO and ignores an older request after switching spans', async () => {
  let finishOld
  getSpanIO
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        })
    )
    .mockResolvedValueOnce({ input: 'new input', output: 'new output', output_truncated: true })
  const span = ref(1)
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(SpanIOViewer, { traceId: 'trace-a', spanId: span.value }) })
  app.component('el-button', { render: () => h('button') })
  app.mount(host)
  expect(getSpanIO).toHaveBeenCalledWith('trace-a', 1)
  span.value = 2
  await nextTick()
  await nextTick()
  expect(host.textContent).toContain('new output')
  expect(host.textContent).toContain('已截断')
  finishOld({ input: 'stale input', output: 'stale output' })
  await nextTick()
  await nextTick()
  expect(host.textContent).not.toContain('stale')
})
