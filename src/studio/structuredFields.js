const cloneJSON = (value) => JSON.parse(JSON.stringify(value))

export function normalizeStructuredField(value) {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value) || typeof value === 'object') return cloneJSON(value)
  return [value]
}

const displayValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 0))

export function structuredFieldItems(value) {
  if (Array.isArray(value)) return value.map(displayValue)
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => key + ': ' + displayValue(item))
  }
  return value === null || value === undefined || value === '' ? [] : [displayValue(value)]
}

export function structuredFieldToEditor(value) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.join('\n')
  }
  if (value && (Array.isArray(value) || typeof value === 'object')) {
    return JSON.stringify(value, null, 2)
  }
  return value === null || value === undefined ? '' : String(value)
}

export function structuredFieldFromEditor(text) {
  const value = String(text || '').trim()
  if (!value) return []
  if (value.startsWith('{') || value.startsWith('[')) {
    const parsed = JSON.parse(value)
    if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
      throw new Error('结构化字段必须是 JSON 对象或数组')
    }
    return parsed
  }
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}
