let router = null

export function setStudioPanelOpener(next) {
  router = typeof next === 'function' ? next : null
}

export function clearStudioPanelOpener() {
  router = null
}

// 所有入口都经过 StudioView 的区域路由。调用方只表达“打开什么”，不能再
// 根据当前 Dock 焦点猜测应该放到中央、底部还是侧栏。
export function openStudioPanel(panelType, params = {}) {
  return router ? router(panelType, params) !== false : false
}
