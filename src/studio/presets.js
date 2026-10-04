export const PRESET_LABELS = Object.freeze({
  default: '默认',
  debug: '调试',
  focus: '专注'
})

const presetEditorPanels = Object.freeze({
  default: ['scene-workspace'],
  debug: ['scene-workspace'],
  focus: ['conversation']
})

const presetShell = Object.freeze({
  default: {
    primaryVisible: true,
    secondaryVisible: true,
    bottomVisible: false,
    primaryView: 'explorer',
    bottomTab: 'activity'
  },
  debug: {
    primaryVisible: true,
    secondaryVisible: true,
    bottomVisible: true,
    primaryView: 'run',
    bottomTab: 'activity'
  },
  focus: {
    primaryVisible: false,
    secondaryVisible: false,
    bottomVisible: false,
    primaryView: 'conversation',
    bottomTab: 'activity'
  }
})

export function panelsForPreset(preset) {
  return presetEditorPanels[preset] || presetEditorPanels.default
}

export function shellForPreset(preset, viewportWidth = 1440) {
  const source = presetShell[preset] || presetShell.default
  return {
    primaryWidth: 280,
    secondaryWidth: 420,
    bottomHeight: 360,
    ...source,
    // 小屏先保证主编辑器可用；用户仍可通过顶栏重新打开对应区域。
    secondaryVisible: viewportWidth >= 1200 ? source.secondaryVisible : false,
    primaryVisible: viewportWidth >= 900 ? source.primaryVisible : false
  }
}
