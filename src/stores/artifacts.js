// Artifact 资源 Store：元数据列表、工作区显式登记和引用约束删除。
// 文件本体不进入 Pinia，预览组件按需通过鉴权 API 获取 Blob。
import { defineStore } from 'pinia'
import * as chatApi from '@/api/chat'

export const useArtifactsStore = defineStore('artifacts', {
  state: () => ({
    items: [],
    loading: false,
    registering: false,
    deletingId: ''
  }),
  actions: {
    async load() {
      this.loading = true
      try {
        const data = await chatApi.listArtifacts({ page: 1, pageSize: 200 })
        this.items = Array.isArray(data?.artifacts) ? data.artifacts : []
        return this.items
      } finally {
        this.loading = false
      }
    },

    async register({ projectId, path, mediaType = '', summary = '' }) {
      this.registering = true
      try {
        const data = await chatApi.registerWorkspaceArtifact({
          project_id: projectId,
          path,
          media_type: mediaType,
          summary
        })
        const artifact = data?.artifact || null
        if (artifact) {
          this.items = [artifact, ...this.items.filter((item) => item.id !== artifact.id)]
        }
        return artifact
      } finally {
        this.registering = false
      }
    },

    async remove(id, { force = false } = {}) {
      if (!id) return false
      this.deletingId = id
      try {
        await chatApi.deleteArtifact(id, { force })
        this.items = this.items.filter((item) => item.id !== id)
        return true
      } finally {
        if (this.deletingId === id) this.deletingId = ''
      }
    }
  }
})
