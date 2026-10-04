// Studio 持有唯一的对话实例；Dock 中的 Tab 只注册显示位置。
// 通过 Teleport 移动同一实例，避免最大化、移入中央时重建输入区和消息流。
export const conversationSurfaceKey = Symbol('studio-conversation-surface')
