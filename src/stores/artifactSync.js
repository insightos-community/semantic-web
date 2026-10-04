import { defineStore } from 'pinia'

export const useArtifactSyncStore = defineStore('artifactSync', {
  state: () => ({
    records: [],
    selectedRef: ''
  }),
  getters: {
    forExecution: (state) => (executionId) =>
      state.records.filter((item) => item.execution_id === executionId),
    pendingCount: (state) =>
      state.records.filter((item) =>
        ['announced', 'uploading', 'downloading'].includes(item.status)
      ).length,
    failedCount: (state) => state.records.filter((item) => item.status === 'failed').length
  },
  actions: {
    hydrateExecutions(executions = []) {
      this.records = executions.flatMap((execution) =>
        (execution.artifact_sync || []).map((record) => ({
          ...record,
          execution_id: execution.id,
          robot_id: execution.robot_id
        }))
      )
    },
    mergeExecutions(executions = []) {
      for (const execution of executions) {
        for (const record of execution.artifact_sync || []) {
          this.upsert({ ...record, execution_id: execution.id, robot_id: execution.robot_id })
        }
      }
    },
    upsert(record) {
      const key = record.local_artifact_id || record.server_artifact_id || record.ref
      if (!key) return false
      const index = this.records.findIndex(
        (item) =>
          (item.local_artifact_id || item.server_artifact_id || item.ref) === key &&
          item.execution_id === record.execution_id
      )
      if (index < 0) this.records.unshift(record)
      else this.records.splice(index, 1, { ...this.records[index], ...record })
      return true
    },
    applyEvent(event) {
      const record = event?.payload?.artifact_sync || event?.payload?.artifact
      return record ? this.upsert(record) : false
    },
    clear() {
      this.$reset()
    }
  }
})
