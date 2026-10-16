// InputNumber's spinner step is a UI increment, not a JSON Schema constraint.
// Native form validation would otherwise reject arbitrary decimal/radian values.
export function displayFormField(field) {
  // Compatibility for the existing navigation interaction contract. Only change
  // display units when BOTH the exact field and its declared SI unit are known.
  // Unrelated numbers, angles already in degrees and generic x/y stay unchanged.
  if (field.type !== 'number') return field
  let scale, label, description
  if (field.name === 'tolerance_position' && field.description?.includes('契约单位米')) {
    scale = 0.01
    label = '位置容差（厘米）'
    description = '以厘米填写，提交时换算为米；5 厘米 = 0.05 米。'
  } else if (field.name === 'tolerance_yaw' && field.description?.includes('契约单位弧度')) {
    scale = Math.PI / 180
    label = '朝向容差（度）'
    description = '以度填写，提交时换算为弧度；1.5 度 ≈ 0.02617993877991494 弧度。'
  } else return field
  const display = { ...field, source: field, scale, label, description }
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
    if (typeof field[key] === 'number') display[key] = field[key] / scale
  }
  return display
}

export function displayFormValue(field, value) {
  return typeof value === 'number' && field.scale ? value / field.scale : value
}

export function formResponse(fields, values) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.name]
      return [field.name, typeof value === 'number' && field.scale ? value * field.scale : value]
    })
  )
}

export function validFormField(field, value) {
  if (field.source) {
    return validFormField(field.source, formResponse([field], { [field.name]: value })[field.name])
  }
  if ([undefined, null, ''].includes(value)) return !field.required
  if (!['number', 'integer'].includes(field.type)) return true
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (field.type === 'integer' && !Number.isInteger(value)) return false
  if (typeof field.minimum === 'number' && value < field.minimum) return false
  if (typeof field.maximum === 'number' && value > field.maximum) return false
  if (typeof field.exclusiveMinimum === 'number' && value <= field.exclusiveMinimum) return false
  if (typeof field.exclusiveMaximum === 'number' && value >= field.exclusiveMaximum) return false
  return true
}
