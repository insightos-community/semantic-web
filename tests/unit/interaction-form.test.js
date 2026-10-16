// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FormRenderer from '@/components/interaction/renderers/FormRenderer.vue'
import {
  displayFormField,
  displayFormValue,
  formResponse,
  validFormField
} from '@/studio/formFields'

let app
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

describe('interaction numeric form', () => {
  it('submits 5 cm and exact 1.5 degree radians as numbers without spinner rounding', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const replies = []
    app = createApp({
      render: () =>
        h(FormRenderer, {
          interaction: {
            id: 'navigation',
            schema: {
              type: 'object',
              properties: {
                position: { type: 'number', title: '位置（米）' },
                yaw: { type: 'number' }
              },
              required: ['position', 'yaw']
            }
          },
          onSubmit: (value) => replies.push(value)
        })
    })
    app.use(createPinia()).use(ElementPlus).mount(root)
    const values = ['0.05', String(Math.PI / 120)]
    for (const [i, input] of [...root.querySelectorAll('input')].entries()) {
      input.value = values[i]
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()
    }
    expect(root.textContent).toContain('位置（米）')
    expect(root.querySelector('form').noValidate).toBe(true)
    root.querySelector('button[type=submit]').click()
    await nextTick()
    expect(replies).toEqual([{ position: 0.05, yaw: Math.PI / 120 }])
  })
  it('honors declared integer and bounds while allowing unconstrained fractional numbers', () => {
    expect(validFormField({ type: 'number' }, Math.PI / 120)).toBe(true)
    expect(validFormField({ type: 'integer' }, 1.5)).toBe(false)
    expect(validFormField({ type: 'integer' }, 2)).toBe(true)
    expect(validFormField({ type: 'number', exclusiveMinimum: 0 }, 0)).toBe(false)
    expect(validFormField({ type: 'number', minimum: 0.05, maximum: 1 }, 0.05)).toBe(true)
    expect(validFormField({ type: 'number', minimum: 0.05 }, 0.04)).toBe(false)
    expect(validFormField({ type: 'number' }, NaN)).toBe(false)
    expect(validFormField({ type: 'number', required: true }, null)).toBe(false)
    expect(validFormField({ type: 'number' }, null)).toBe(true)
  })
  it('converts navigation cm/degrees to SI exactly once, including draft restore', () => {
    const fields = [
      { name: 'tolerance_position', type: 'number', description: '契约单位米', minimum: 0.01 },
      { name: 'tolerance_yaw', type: 'number', description: '契约单位弧度' }
    ].map(displayFormField)
    const response = formResponse(fields, { tolerance_position: 5, tolerance_yaw: 1.5 })
    expect(response.tolerance_position).toBe(0.05)
    expect(response.tolerance_yaw).toBeCloseTo(Math.PI / 120, 15)
    expect(fields[0].minimum).toBe(1)
    const restored = Object.fromEntries(
      fields.map((f) => [f.name, displayFormValue(f, response[f.name])])
    )
    expect(restored.tolerance_position).toBe(5)
    expect(restored.tolerance_yaw).toBeCloseTo(1.5, 14)
    expect(formResponse(fields, restored)).toEqual(response)
    expect(validFormField(fields[0], 0.5)).toBe(false)
    const unrelated = { name: 'angle', type: 'number', description: 'degrees' }
    expect(displayFormField(unrelated)).toBe(unrelated)
    expect(displayFormField({ name: 'tolerance_yaw', type: 'number' }).scale).toBeUndefined()
  })
})
