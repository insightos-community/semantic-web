// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// 对话域（17-web-ui-design §6.1/§8、docs/api/ws.md）：
// 会话列表 + 按会话分桶的消息流 + /ws/chat 连接生命周期。
// F3 落地：REST 分页加载（页码向页首回退，后端无 before 游标——以
// internal/server/http/handlers/chat.go 为准）、message.delta 按 run 聚合、
// message.done 定稿并 REST 对账、断线重连 sync 续传（client 内置，按事件 id 幂等）。
// F4 落地：interaction 审批队列（interaction.request 入队 / interaction.reply
// 上行乐观出队 / message.done 对账防服务端超时 reject 后卡片残留；
// 超时判定以服务端为准——internal/interaction/service.go 默认 300s 按拒绝处理，
// 本地只做倒计时展示）。
// R14 落地：subagent.delta/result 委派块聚合（契约以
// internal/agent/runtime/events.go SubAgent*Payload 为准，envelope.agent 归因
// 成员实例：id=query-1、name=角色名——runtime service.go publishSubAgent）；
// alert 分级路由（critical→消息流+侧栏高亮、normal→消息流简述+侧栏、
// low→仅侧栏告警列表；分级规则与聚合器 aggregate/rules.go 一致）。
// R19 落地：审批卡刷新恢复——selectSession 时拉 REST
// interactions?status=pending 重建待应答队列（payload 映射 ApprovalCard 记录），
// 已终结（answered/expired/cancelled）与本地已知记录不重建。
// 时间线修复（v0.1.2）：消息行统一带 ts 并按 ts 升序落位（insertSorted），
// 审批卡/告警/委派/产物等系统行进入对话时间线而非悬浮尾部（流式中的 run
// 保持在尾部直到 done，为运行中例外）；restoreInteractions 改为拉全量
// interactions——已终结的映射为带结果徽标的历史行，按 created_at 落回原位。
import { defineStore } from 'pinia'
import * as chatApi from '@/api/chat'
import * as interactionsApi from '@/api/interactions'
import { useSessionStore } from '@/stores/session'
import { useRunsStore } from '@/stores/runs'
import { useUiStore } from '@/stores/ui'
import { normalizeInteraction } from '@/stores/interactions'
import { stripEmbeddedThinkBlocks } from '@/utils/reasoning'
import { createWsClient, WS_STATUS } from '@/ws/client'
import { hasStudioCommandTransport, sendStudioCommand } from '@/studio/commandGateway'
import {
  fetchLastPage,
  loadEarlierMessages,
  loadMessages,
  refreshTail
} from '@/stores/chatPersistence'
import {
  ALERT_IMPORTANCE,
  ALERT_LIST_LIMIT,
  CONNECTION_STATUS,
  DELEGATION_STATUS,
  freshBucket,
  insertIndexByTs,
  INTERACTION_RESULT,
  INTERACTION_STATUS,
  MESSAGE_STATUS,
  deriveConversationTitle,
  agentRoleFromIdentity,
  isSystemActivityMetadata,
  isDefaultSessionTitle,
  parseToolArguments,
  restInteractionResult,
  alertImportance
} from '@/stores/chatModel'

export {
  ALERT_IMPORTANCE,
  ALERT_LIST_LIMIT,
  CONNECTION_STATUS,
  DELEGATION_STATUS,
  insertIndexByTs,
  INTERACTION_RESULT,
  INTERACTION_STATUS,
  MESSAGE_STATUS,
  reconcileMessages,
  alertImportance
} from '@/stores/chatModel'

let localSeq = 0 // 本地乐观消息序号（仅会话内唯一即可）
let delegSeq = 0 // 委派块序号（同 run 同成员再次被委派时另起新块）

// ---- 模块级 WS 持有（非响应式；同一时刻只挂一条 /ws/chat）----
let chatClient = null
let chatClientSessionId = ''
let unbindEvents = null
let unbindStatus = null
const eventCursors = new Map()

function chatWsUrl(sessionId, token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const q = new URLSearchParams({ token, session_id: sessionId })
  return `${proto}://${window.location.host}/ws/chat?${q.toString()}`
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: [], // ChatSession 摘要列表（历史列表只列 ChatSession，14-frontend-api §6）
    currentSessionId: '',
    // sid → { list, earliestPage, total, loaded, loadingEarlier }
    // earliestPage 为已加载的最靠页首的页码（>1 说明还有更早页可拉）
    messagesBySession: {},
    streaming: null, // 当前流式中的助手消息（message.delta 聚合体，同时挂在对应桶尾部）
    sending: false, // chat.message 已发出、等待本轮 done/error
    connectionStatus: CONNECTION_STATUS.OFFLINE,
    composerDraft: '',
    // F4 审批队列：待应答记录按到达序排列（与 interactionsById、消息行共享
    // 同一响应式对象）；置顶卡取当前会话最新一条，消息行按 interactionId 取记录
    pendingInteractions: [],
    interactionsById: {}, // interaction_id → 审批记录
    // R14 委派块：delegation 记录按 id 存放（消息行按 delegationId 取同一
    // 响应式对象）；activeDelegations 跟踪进行中的委派
    // （key = `${sid}:${runId}:${agentId}` → delegation id），result 定稿即移除
    delegationsById: {},
    activeDelegations: {},
    // R14 侧栏告警列表：全级别条目（最新在前，容量 ALERT_LIST_LIMIT）；
    // 会话无关（广播告警 session_id 为空也入列）
    alerts: [],
    // sid → {mode, host_execution_enabled, host_execution_allowed, busy}。
    // 执行权限是会话态，full 与宿主开关不跨会话继承。
    executionBySession: {},
    executionLoadingSession: '',
    executionSavingSession: ''
  }),
  getters: {
    currentSession: (s) => s.sessions.find((it) => it.id === s.currentSessionId) || null,
    messages: (s) => s.messagesBySession[s.currentSessionId]?.list || [],
    currentBucket: (s) => s.messagesBySession[s.currentSessionId] || null,
    currentExecution: (s) => s.executionBySession[s.currentSessionId] || null,
    hasEarlier: (s) => (s.messagesBySession[s.currentSessionId]?.earliestPage ?? 1) > 1,
    // 当前会话的委派块列表（按创建序；SubAgentBlock 数据源）
    delegations: (s) =>
      Object.values(s.delegationsById).filter((d) => d.sessionId === s.currentSessionId),
    // 输入区上方置顶的审批卡：当前会话最新一条待应答（无则隐藏）
    currentPendingInteraction: (s) => {
      for (let i = s.pendingInteractions.length - 1; i >= 0; i -= 1) {
        if (s.pendingInteractions[i].sessionId === s.currentSessionId) {
          return s.pendingInteractions[i]
        }
      }
      return null
    }
  },
  actions: {
    setComposerDraft(text) {
      this.composerDraft = String(text || '')
    },
    _bucket(sid) {
      if (!this.messagesBySession[sid]) {
        this.messagesBySession[sid] = freshBucket()
      }
      return this.messagesBySession[sid]
    },
    setSessions(list) {
      this.sessions = Array.isArray(list) ? list : []
    },
    // 拉取会话列表：后端按最近活跃倒序返回，本地再兜底排一次
    async loadSessions() {
      const data = await chatApi.listSessions()
      const list = Array.isArray(data?.sessions) ? [...data.sessions] : []
      list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      this.setSessions(list)
      return list
    },
    // 新建会话：置顶插入并选中，直接开 WS（用户进来就是要发消息）
    async createSession(title = '') {
      const data = await chatApi.createSession(title ? { title } : {})
      const sess = data?.session
      if (sess?.id) {
        this.sessions = [sess, ...this.sessions.filter((it) => it.id !== sess.id)]
        this.currentSessionId = sess.id
        this.messagesBySession[sess.id] = { ...freshBucket(), loaded: true }
        this.streaming = null
        this.openChat(sess.id)
      }
      return sess || null
    },
    // 选择会话：先连 WS（load 期间不漏实时事件），再拉最新一页（含对账），
    // 最后恢复审批卡（R19 + 时间线修复：REST 全量 interactions——pending 重建
    // 待应答队列，已终结落带结果徽标的历史行；刷新后 WS 补发不含历史
    // interaction.request，REST 是唯一恢复通道）
    async selectSession(id, { connect = true, loadMessages = true } = {}) {
      if (!id) return
      const same = id === this.currentSessionId
      this.currentSessionId = id
      this.streaming = null
      this.sending = false
      if (connect && (!same || !chatClient || chatClient.status === WS_STATUS.OFFLINE)) {
        await this.openChat(id)
      }
      if (loadMessages) {
        await this.loadMessages(id)
        await this.restoreInteractions(id)
      }
    },
    async deleteSession(id) {
      if (!id) return
      await chatApi.deleteSession(id)
      const wasCurrent = id === this.currentSessionId
      this.sessions = this.sessions.filter((item) => item.id !== id)
      delete this.messagesBySession[id]
      delete this.executionBySession[id]
      eventCursors.delete(id)
      if (!wasCurrent) return
      this.closeChat()
      this.currentSessionId = ''
      const next = this.sessions[0]?.id
      if (next) await this.selectSession(next)
    },

    // 读取会话执行策略。请求失败时保留旧值，让检查器可以显示最后一次已确认状态。
    async loadSessionExecution(sessionId = this.currentSessionId) {
      if (!sessionId) return null
      this.executionLoadingSession = sessionId
      try {
        const data = await chatApi.getSessionExecution(sessionId)
        const execution = data?.execution || null
        if (execution) this.executionBySession[sessionId] = execution
        return execution
      } finally {
        if (this.executionLoadingSession === sessionId) this.executionLoadingSession = ''
      }
    },

    // 原子更新 mode 与宿主开关；成功响应是唯一落本地状态的来源，避免前端
    // 乐观状态与 Server 全局硬开关不一致。
    async saveSessionExecution(sessionId, { mode, enabled }) {
      if (!sessionId) return null
      this.executionSavingSession = sessionId
      try {
        const data = await chatApi.updateSessionExecution(sessionId, { mode, enabled })
        const execution = data?.execution || null
        if (execution) this.executionBySession[sessionId] = execution
        return execution
      } finally {
        if (this.executionSavingSession === sessionId) this.executionSavingSession = ''
      }
    },

    // REST 分页 action 独立在 chatPersistence，Pinia 仍以 this 绑定 store。
    _fetchLastPage: fetchLastPage,
    loadMessages,
    loadEarlierMessages,
    refreshTail,

    // ---- 审批卡刷新恢复（R19；时间线修复起恢复全量历史）----
    // selectSession 时拉 REST interactions?session_id=（不带 status——端点
    // interactions.go 空 status 不过滤，返回全部状态）：
    // - pending → 重建待应答队列 + 可操作审批卡（刷新后唯一恢复通道：WS 补发
    //   只含续传期间事件，历史 interaction.request 不会重发）；
    // - answered/expired/cancelled → 历史行（channel=interaction，resolved
    //   带结果徽标、不可再操作），按 created_at 落在时间线原位（通常在触发
    //   它的用户消息之后、run 完成的助手回复之前）。
    // 本地已知记录（Studio snapshot、WS 或上次恢复）以本地状态为准，
    // 但记录存在不代表消息行存在：恢复时间线与更新领域状态分别去重。
    // 恢复失败不阻塞会话打开（实时审批仍走 WS），仅告警提示。
    async restoreInteractions(sid = this.currentSessionId) {
      if (!sid) return 0
      let restored = 0
      // Snapshot 先 hydrate Interaction Store，消息 REST 随后加载。即使
      // 补查失败或只返回部分历史，也应显示已经确认属于该会话的待答卡。
      for (const record of Object.values(this.interactionsById)) {
        if (record.sessionId === sid && this._ensureInteractionMessage(record)) restored += 1
      }
      let rows
      try {
        rows = await this._fetchAllInteractions(sid)
      } catch (e) {
        useUiStore().notify({ type: 'warning', message: `审批记录恢复失败：${e.message}` })
        return restored
      }
      for (const row of rows) {
        const rec = this._restoreInteraction(row, sid)
        if (rec) restored += 1
      }
      return restored
    },
    // 拉取会话全部 interactions（端点按创建时间倒序分页，空 status = 不过滤），
    // 反转为创建升序返回：pending 队列按到达序入队（置顶卡取尾部最新一条的
    // 语义不变）；消息行由 insertSorted 按 ts 落位，与遍历顺序无关
    async _fetchAllInteractions(sid) {
      const rows = []
      let page = 1
      let total = Infinity
      while (rows.length < total) {
        const data = await interactionsApi.listInteractions({ sessionId: sid, page, pageSize: 100 })
        const batch = Array.isArray(data?.interactions) ? data.interactions : []
        rows.push(...batch)
        total = data?.total ?? rows.length
        if (batch.length === 0) break
        page += 1
      }
      return rows.reverse()
    },
    // REST 交互行 → 审批记录（与 applyInteraction 的 WS 路径同模型，队列/
    // 置顶卡/消息行共享同一响应式对象）。消息行 id 用 evt-restored- 前缀——
    // 本地未对账的非 dialogue 行，REST 消息对账时原样保留（同 WS 的 evt- 行）。
    // pending 入待应答队列；已终结按 reply.approved/status 映射结果徽标
    // （restInteractionResult），仅作历史展示、不可再操作。
    _restoreInteraction(row, sid) {
      const iid = row?.id
      if (!iid) return null
      const sessionId = row.conversation_id || row.session_id || row.sessionId || sid
      if (!sessionId || sessionId !== sid) return null
      let rec = this.interactionsById[iid]
      if (rec?.sessionId && rec.sessionId !== sessionId) return null
      const isNew = !rec
      if (!rec) {
        const normalized = normalizeInteraction({ ...row, sessionId })
        const pending = normalized.status === 'pending'
        rec = {
          ...normalized,
          status: pending ? INTERACTION_STATUS.PENDING : INTERACTION_STATUS.RESOLVED,
          result: pending ? '' : restInteractionResult(row),
          repliedAt: 0
        }
        this.interactionsById[iid] = rec
      } else {
        // 只补缺失的身份/创建时间，不用迟到的 REST 覆盖新版选择项、revision
        // 或已应答状态（包括本端已提交、正等待服务端确认的记录）。
        if (!rec.sessionId) rec.sessionId = sessionId
        if (!rec.ts) rec.ts = row.created_at
      }
      if (
        rec.status === INTERACTION_STATUS.PENDING &&
        !this.pendingInteractions.some((item) => item.id === iid)
      ) {
        this.pendingInteractions.push(rec)
      }
      const inserted = this._ensureInteractionMessage(rec)
      return isNew || inserted ? rec : null
    },
    _ensureInteractionMessage(record, { messageId, ts } = {}) {
      if (!record?.id || !record.sessionId) return false
      if (this._bucket(record.sessionId).list.some((item) => item.interactionId === record.id))
        return false
      this.insertSorted(
        {
          id: messageId || `evt-restored-${record.id}`,
          role: 'system',
          agentName: record.agentName,
          channel: 'interaction',
          type: 'interaction.request',
          interactionId: record.id,
          text: '',
          ts: record.ts || ts,
          status: MESSAGE_STATUS.DONE
        },
        record.sessionId
      )
      return true
    },

    // ---- WS 生命周期（/ws/chat，切会话/退出时关）----
    async openChat(sessionId) {
      this.closeChat()
      if (!sessionId) return
      const session = useSessionStore()
      if (!session.token) return
      // 延迟引入 dispatcher：dispatcher 静态引用本 store，避免模块环
      const { createDefaultDispatcher } = await import('@/ws/dispatcher')
      const dispatcher = createDefaultDispatcher()
      chatClientSessionId = sessionId
      chatClient = createWsClient({
        url: chatWsUrl(sessionId, session.token),
        initialLastEventId: eventCursors.get(sessionId) || ''
      })
      unbindStatus = chatClient.onStatus((st) => this.setConnectionStatus(st))
      unbindEvents = chatClient.on('*', (env) => {
        // 协议应答 error（ws.md：非 envelope，无 channel）单独处理，不进分发器
        if (env?.type === 'error') {
          this.applyProtocolError(env)
          return
        }
        dispatcher.dispatch(env)
      })
      this.setConnectionStatus(WS_STATUS.CONNECTING)
      chatClient.connect()
    },
    closeChat() {
      if (chatClient && chatClientSessionId && chatClient.lastEventId) {
        eventCursors.set(chatClientSessionId, chatClient.lastEventId)
      }
      unbindEvents?.()
      unbindStatus?.()
      unbindEvents = null
      unbindStatus = null
      chatClient?.disconnect()
      chatClient = null
      chatClientSessionId = ''
      this.streaming = null
      this.sending = false
      this.setConnectionStatus(CONNECTION_STATUS.OFFLINE)
    },
    // Project 切换与 Studio 卸载时彻底释放旧 Project 的对话状态。
    // closeChat 负责解除监听和断开 socket；游标和 Pinia 数据也必须一起清理，
    // 否则相同 Conversation ID 或迟到的界面渲染会泄漏旧 Project 数据。
    clearProjectData() {
      this.closeChat()
      eventCursors.clear()
      this.$reset()
    },

    // 发送消息：乐观插入用户消息（服务端无 WS 回执，done 后 REST 对账对齐），
    // 再走 /ws/chat 上行 chat.message
    async uploadAttachment(file) {
      const data = await chatApi.uploadAttachment(file)
      return data?.attachment || null
    },
    sendChatMessage(
      text,
      {
        interruptCurrent = false,
        runId = '',
        attachments = [],
        reasoningEffort = 'auto',
        reasoningVisibility = 'auto',
        sendScope = null
      } = {}
    ) {
      const scope = sendScope || {
        type: 'conversation',
        conversation_id: this.currentSessionId,
        target_agent_id: 'leader',
        intent: 'message'
      }
      const sid = scope.conversation_id || this.currentSessionId
      const taskScoped = scope.type === 'task'
      const content = (text || '').trim() || (attachments.length ? '请分析这些图片。' : '')
      if (!sid || !content) return false
      // interrupt_current 必须精确指向 Server 保存的活动 Run。缺少 run_id 时
      // 不发送模糊中断命令，也不插入无法兑现的本地乐观消息。
      if (interruptCurrent && !runId) return false
      const useStudioTransport = hasStudioCommandTransport()
      if (!useStudioTransport && (!chatClient || chatClient.status !== WS_STATUS.ONLINE))
        return false
      const session = taskScoped ? null : this.sessions.find((item) => item.id === sid)
      if (session && isDefaultSessionTitle(session.title)) {
        const title = deriveConversationTitle(text, attachments)
        if (title) session.title = title
      }
      if (!taskScoped) {
        localSeq += 1
        this.insertSorted(
          {
            id: `local-${Date.now()}-${localSeq}`,
            role: 'user',
            agentName: '',
            targetAgentId: scope.target_agent_id || 'leader',
            text: content,
            attachments,
            ts: new Date().toISOString(),
            status: MESSAGE_STATUS.DONE,
            channel: 'dialogue',
            type: 'chat.message'
          },
          sid
        )
      }
      const payload = {
        session_id: sid,
        conversation_id: sid,
        text: content,
        attachments: attachments.map((item) => item.id),
        interrupt_current: interruptCurrent,
        run_id: interruptCurrent ? runId : '',
        reasoning_effort: reasoningEffort,
        reasoning_visibility: reasoningVisibility,
        send_scope: { ...scope, conversation_id: sid }
      }
      const ok = useStudioTransport
        ? sendStudioCommand('chat.message', payload)
        : chatClient.send('chat.message', payload)
      if (ok && !taskScoped) this.sending = true
      return ok
    },
    async cancelCurrentRun() {
      const sid = this.currentSessionId
      if (!sid) return false
      if (hasStudioCommandTransport()) {
        const { useRunsStore } = await import('@/stores/runs')
        const runs = useRunsStore()
        const run = runs.activeForConversation(sid)
        return run ? runs.cancel(run.id) : false
      }
      if (!chatClient || chatClient.status !== WS_STATUS.ONLINE) return false
      return chatClient.send('chat.cancel', { session_id: sid })
    },

    setConnectionStatus(status) {
      this.connectionStatus = status
    },
    // 幂等按时间线插入：按消息 id 去重（WS 续传可能重发），按 ts 升序落位
    // （同 ts 稳定，落在既有同 ts 行之后）——审批卡/告警/委派/产物等系统行
    // 由此进入对话时间线对应位置，而非悬浮在消息流尾部
    insertSorted(msg, sid = this.currentSessionId) {
      if (!msg || !msg.id || !sid) return
      const bucket = this._bucket(sid)
      if (bucket.list.some((it) => it.id === msg.id)) return
      bucket.list.splice(insertIndexByTs(bucket.list, msg.ts), 0, msg)
    },
    // 会话列表顺序刷新：本轮有产出即视为活跃（updated_at 取事件时间）
    _bumpSession(sid, ts) {
      const sess = this.sessions.find((it) => it.id === sid)
      if (!sess) return
      sess.updated_at = ts || new Date().toISOString()
      this.sessions = [...this.sessions].sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      )
    },

    // ---- dispatcher 入口 ----
    // message.delta/tool.result 按 run_id 聚合为"进行中的助手消息"；
    // message.done 定稿。
    // 补发事件已在 ws client 按事件 id 去重，这里无需再去重。
    applyDialogue(env) {
      const sid = env.session_id || this.currentSessionId
      if (!sid) return
      const bucket = this._bucket(sid)
      const eventRunId = env.parent?.run_id || env.payload?.run_id || ''
      const authorRun = useRunsStore().byId(eventRunId)
      const isDelegate =
        env.agent?.role === 'service' && (!authorRun || authorRun.agent_id !== env.agent?.id)
      // subagent 委派事件（同 channel=dialogue）走委派块聚合，不进助手消息流
      if (
        env.type === 'subagent.delta' ||
        env.type === 'subagent.result' ||
        (env.type === 'reasoning.delta' && isDelegate) ||
        ((env.type === 'tool.call' || env.type === 'tool.result') && isDelegate)
      ) {
        this._applySubAgent(env, sid)
        return
      }
      if (
        env.type === 'message.delta' ||
        env.type === 'reasoning.delta' ||
        env.type === 'tool.call' ||
        env.type === 'tool.result'
      ) {
        const runId = eventRunId
        let cur = bucket.list.find(
          (item) => item.runId === runId && item.status === MESSAGE_STATUS.STREAMING
        )
        if (!cur) {
          cur = {
            id: `stream-${runId}`,
            sessionId: sid,
            runId,
            role: 'assistant',
            agentName: env.agent?.id || env.agent?.name || 'leader',
            text: '',
            reasoning: '',
            toolCalls: [],
            delegations: [],
            ts: authorRun?.started_at || env.ts,
            status: MESSAGE_STATUS.STREAMING,
            channel: env.channel,
            type: env.type
          }
          // 运行中例外：流式聚合行直接压尾，直到 done 定稿（原地替换）后
          // 再由 refreshTail 对账进全局时间线
          bucket.list.push(cur)
          this.streaming = cur
        }
        if (env.type === 'message.delta') {
          if (env.payload?.reset === true) cur.text = ''
          cur.text += env.payload?.text || ''
        } else if (env.type === 'reasoning.delta') {
          cur.reasoning += env.payload?.text || ''
          cur.reasoningRounds ||= []
          const turn = env.payload?.turn || 1
          if (cur.reasoningRounds.at(-1)?.turn !== turn)
            cur.reasoningRounds.push({ turn, text: '' })
          cur.reasoningRounds.at(-1).text += env.payload?.text || ''
        } else if (env.type === 'tool.call') {
          cur.toolCalls ||= []
          cur.toolCalls.push({
            id: env.payload?.call_id || env.id,
            name: env.payload?.name || 'tool',
            status: 'running',
            params: parseToolArguments(env.payload?.arguments)
          })
        } else {
          cur.toolCalls ||= []
          const callId = env.payload?.call_id
          const call = cur.toolCalls.find((item) => callId && item.id === callId)
          if (call) {
            call.status = 'done'
            call.result = env.payload?.result ?? ''
            if (env.payload?.truncated === true) call.truncated = true
          } else {
            cur.toolCalls.push({
              id: callId || env.id,
              name: env.payload?.name || 'tool',
              status: 'done',
              result: env.payload?.result ?? '',
              ...(env.payload?.truncated === true ? { truncated: true } : {})
            })
          }
        }
        // A run bubble represents the whole exchange, not its latest chunk.
        // Moving its timestamp makes questions raised mid-run precede their cause.
        return
      }
      if (env.type === 'message.done') {
        const runId = env.payload?.run_id || ''
        const cur =
          this.streaming?.runId === runId
            ? this.streaming
            : bucket.list.find((m) => m.runId === runId && m.status === MESSAGE_STATUS.STREAMING)
        const error = env.payload?.error || ''
        const cancelled = env.payload?.cancelled === true
        const metadata = env.payload?.metadata || {}
        const agentName = env.agent?.id || env.agent?.name || cur?.agentName || 'leader'
        const systemActivity = isSystemActivityMetadata(metadata)
        const final = {
          id: env.id,
          sessionId: sid,
          runId,
          traceId: env.payload?.trace_id || cur?.traceId || '',
          role: systemActivity ? 'system' : 'assistant',
          agentName,
          agentRole: agentRoleFromIdentity(agentName, env.agent?.role || metadata.agent_role),
          messageKind: metadata.message_kind || '',
          systemActivity,
          activity: systemActivity
            ? {
                workflowId: metadata.workflow_id || '',
                taskId: metadata.task_id || '',
                subtaskId: metadata.subtask_id || '',
                status: metadata.status || '',
                reason: metadata.reason || '',
                resultSummary: metadata.result_summary || '',
                assignedAgentId: metadata.assigned_agent_id || '',
                assignedRobotId: metadata.assigned_robot_id || ''
              }
            : null,
          text: env.payload?.text || cur?.text || '',
          ts: systemActivity
            ? env.ts
            : metadata.started_at || cur?.ts || authorRun?.started_at || env.ts,
          status: cancelled
            ? MESSAGE_STATUS.CANCELLED
            : error
              ? MESSAGE_STATUS.ERROR
              : MESSAGE_STATUS.DONE,
          channel: env.channel,
          type: env.type,
          toolCalls: cur?.toolCalls || [],
          delegations: cur?.delegations || [],
          reasoning: cur?.reasoning || '',
          reasoningRounds: cur?.reasoningRounds || [],
          modelResolution: env.payload?.model || cur?.modelResolution || null,
          turns: env.payload?.turns,
          usage: env.payload?.usage || null,
          error: error || undefined
        }
        if (cur) {
          const idx = bucket.list.indexOf(cur)
          if (idx >= 0) bucket.list.splice(idx, 1, final)
          else bucket.list.push(final)
        } else {
          // 无流式行（delta 未达/跨重连补发 done）：按 ts 落进时间线（自带幂等）
          this.insertSorted(final, sid)
        }
        if (this.streaming?.runId === runId) this.streaming = null
        this.sending = false
        this._bumpSession(sid, env.ts)
        this.refreshTail(sid).catch(() => {}) // 尽力对账，失败不影响已渲染内容
      }
    },
    // 上行消息的直接错误应答（非 envelope）：CHAT_MESSAGE_FAILED 等
    applyProtocolError(env) {
      if (env.code === 'INTERACTION_REPLY_FAILED') {
        // errorReply 不携带 interaction_id（以代码为准：ws/chat.go errorReply
        // 仅 type/code/message）。应答与超时竞速时单会话 run 串行，改判当前会话
        // 最近一次应答过的记录；无则应答的是仍在队列中的最老一条（本地时钟偏快）。
        const mine = Object.values(this.interactionsById).filter(
          (it) => it.sessionId === this.currentSessionId
        )
        const target =
          mine.filter((it) => it.repliedAt).sort((a, b) => b.repliedAt - a.repliedAt)[0] ||
          this.pendingInteractions.find((it) => it.sessionId === this.currentSessionId)
        if (target) {
          if (target.status === INTERACTION_STATUS.PENDING) {
            this._resolveInteraction(target.id, INTERACTION_RESULT.EXPIRED)
          } else {
            target.result = INTERACTION_RESULT.EXPIRED
          }
        }
        useUiStore().notify({
          type: 'error',
          message: env.message || '审批应答未生效（交互已终结）'
        })
        return
      }
      this.sending = false
      if (this.streaming) {
        this.streaming.status = MESSAGE_STATUS.ERROR
        this.streaming.error = env.message || '消息处理失败'
        this.streaming = null
      }
      useUiStore().notify({
        type: 'error',
        message: env.message || `消息发送失败（${env.code || 'UNKNOWN'}）`
      })
    },
    // ---- subagent 委派块（R14；契约 runtime/events.go SubAgent*Payload）----
    // delta 按委派块聚合流式产出（result 字段运行中即过程明细）；result 定稿
    // 任务与结果全文。SubAgent 是 Leader 本轮执行活动的一部分，因此归并进
    // 同一个 streaming 助手行；平级、独立存活 Agent 的发言才进入独立消息行。
    _applySubAgent(env, sid) {
      const p = env.payload || {}
      const runId = p.run_id || ''
      const agentId = env.agent?.id || 'subagent'
      const key = `${sid}:${runId}:${agentId}`
      let rec = this.delegationsById[this.activeDelegations[key]]
      if (!rec) {
        delegSeq += 1
        rec = {
          id: `deleg-${runId}-${agentId}-${delegSeq}`,
          sessionId: sid,
          runId,
          agentName: agentId, // 成员实例 id（如 query-1，头部展示用）
          // 角色名（角色色令牌用）：envelope.agent.name 即角色（publishSubAgent
          // 填 def.Role）；缺省从实例 id 去 "-N" 后缀兜底
          agentRole: env.agent?.name || agentId.replace(/-\d+$/u, ''),
          task: '',
          status: DELEGATION_STATUS.RUNNING,
          result: '',
          reasoning: '',
          tools: [],
          ts: env.ts
        }
        this.delegationsById[rec.id] = rec
        const bucket = this._bucket(sid)
        let cur = this.streaming
        if (!cur || cur.runId !== runId || cur.sessionId !== sid) {
          cur = bucket.list.find((item) => item.runId === runId && item.role === 'assistant')
        }
        if (!cur || cur.runId !== runId || cur.sessionId !== sid) {
          cur = {
            id: `stream-${runId}`,
            sessionId: sid,
            runId,
            role: 'assistant',
            agentName: 'leader',
            text: '',
            reasoning: '',
            toolCalls: [],
            delegations: [],
            ts: env.ts,
            status: MESSAGE_STATUS.STREAMING,
            channel: 'dialogue',
            type: 'subagent.delta'
          }
          bucket.list.push(cur)
          this.streaming = cur
        }
        cur.delegations ||= []
        cur.delegations.push(rec)
      }
      if (env.type === 'reasoning.delta') {
        this.activeDelegations[key] = rec.id
        rec.reasoning += p.text || ''
        return
      }
      if (env.type === 'tool.call') {
        this.activeDelegations[key] = rec.id
        rec.tools.push({
          id: p.call_id || env.id,
          name: p.name || 'tool',
          status: 'running',
          params: parseToolArguments(p.arguments)
        })
        return
      }
      if (env.type === 'tool.result') {
        this.activeDelegations[key] = rec.id
        const call = rec.tools.find((item) => p.call_id && item.id === p.call_id)
        if (call) {
          call.status = 'done'
          call.result = p.result ?? ''
          call.truncated = p.truncated === true
        } else {
          rec.tools.push({
            id: p.call_id || env.id,
            name: p.name || 'tool',
            status: 'done',
            result: p.result ?? '',
            truncated: p.truncated === true
          })
        }
        return
      }
      if (env.type === 'subagent.delta') {
        this.activeDelegations[key] = rec.id
        rec.result += p.text || ''
        rec.ts = env.ts || rec.ts
        return
      }
      // subagent.result：定稿（无 delta 直达 result 时上面的补建块直接落成 done）
      rec.task = p.task || rec.task
      // 新版 Framework 已在 AgentTool 边界移除内嵌思考；这里兼容修复前
      // 的实时事件，避免 reasoning 面板与原始 <think> 正文重复展示。
      rec.result = p.text ? stripEmbeddedThinkBlocks(p.text) : rec.result
      rec.status = DELEGATION_STATUS.DONE
      rec.ts = env.ts || rec.ts
      delete this.activeDelegations[key]
      this._bumpSession(sid, env.ts)
    },
    // ---- alert 分级路由（R14）----
    // critical → 消息流 + 侧栏告警列表（ui.notify 由 dispatcher 负责）；
    // normal → 消息流简述 + 侧栏列表；low → 仅侧栏列表（不打断对话流）。
    // 真实负载以 internal/agent/monitor/alert.go 为准：
    // {rule, level(数值 1-5), message, topic}；description 为旧契约兜底字段。
    applyAlert(env) {
      const p = env.payload || {}
      const importance = alertImportance(env)
      const rec = {
        id: env.id,
        sessionId: env.session_id || '',
        importance,
        level: p.level,
        rule: p.rule || '',
        topic: p.topic || '',
        agentName: env.agent?.name || env.agent?.id || 'monitor',
        text: p.message || p.description || '',
        ts: env.ts
      }
      // 断连补发可能与实时到达重叠：按事件 id 幂等入列
      if (!this.alerts.some((it) => it.id === rec.id)) {
        this.alerts.unshift(rec)
        if (this.alerts.length > ALERT_LIST_LIMIT) this.alerts.length = ALERT_LIST_LIMIT
      }
      if (importance === ALERT_IMPORTANCE.LOW) return
      this.insertSorted(
        {
          id: env.id,
          role: 'system',
          agentName: rec.agentName,
          channel: env.channel,
          type: env.type,
          level: p.level ?? 'info',
          importance,
          text: rec.text,
          ts: env.ts,
          status: MESSAGE_STATUS.DONE
        },
        env.session_id || this.currentSessionId
      )
    },
    applyArtifact(env) {
      this.insertSorted(
        {
          id: env.id,
          role: 'system',
          agentName: env.agent?.name || '',
          channel: env.channel,
          type: env.type,
          artifact: env.payload || null,
          text: env.payload?.summary || '',
          ts: env.ts,
          status: MESSAGE_STATUS.DONE
        },
        env.session_id || this.currentSessionId
      )
    },
    // ---- interaction 审批队列（F4；契约 docs/api/ws.md，payload 以
    // internal/interaction/service.go RequestPayload 为准）----
    // interaction.request 入队：建记录（队列/置顶卡/消息行共享同一响应式对象）
    // 并在消息流按 ts 落一行 interaction 行（insertSorted）。消息行 id 用事件
    // id（evt-*）——本地未对账的非 dialogue 行，REST 对账时原样保留（同
    // alert/artifact）。
    applyInteraction(env) {
      const sid = env.session_id || this.currentSessionId
      if (!sid) return
      if (env.type === 'interaction.resolved') {
        // 架构预留类型（14-frontend-api §4.3，当前后端无生产方）：按契约先实现对账
        this._resolveInteraction(env.payload?.interaction_id, env.payload?.result || '')
        return
      }
      if (env.type !== 'interaction.request') return
      const p = env.payload || {}
      const iid = p.interaction_id
      if (!iid) return
      let rec = this.interactionsById[iid]
      if (!rec) {
        rec = {
          id: iid,
          sessionId: sid,
          kind: p.type || 'confirm',
          question: p.question || '',
          risk: p.risk || '',
          timeoutTs: p.timeout_ts || 0, // 服务端应答截止（Unix 秒）；本地只做倒计时展示
          stateRevision: Number(p.source_revision || 0),
          agentName: env.agent?.name || 'leader',
          ts: env.ts,
          status: INTERACTION_STATUS.PENDING,
          result: '',
          repliedAt: 0 // 本端最近一次应答的本地时间（INTERACTION_REPLY_FAILED 改判用）
        }
        this.interactionsById[iid] = rec
      }
      // Studio 订阅先把完整 Interaction 写入 interactions store，再把同一事件
      // 分发给消息时间线。此时记录已存在，但消息行尚不存在，不能因为 Store
      // 已对账就漏掉 Conversation 中唯一的完整表单入口。
      this._ensureInteractionMessage(rec, { messageId: env.id, ts: env.ts })
      // 断连补发可能与实时到达重叠：按 interaction_id 幂等入队
      if (
        rec.status === INTERACTION_STATUS.PENDING &&
        !this.pendingInteractions.some((it) => it.id === iid)
      ) {
        this.pendingInteractions.push(rec)
      }
      this._bumpSession(sid, env.ts)
    },
    // 审批应答只进入 submitting。服务端事件或快照才可以把 Interaction
    // 改为终态，避免网络超时、revision 冲突时前端伪造“已批准”。
    replyInteraction(interactionId, approved) {
      const rec = this.interactionsById[interactionId]
      if (!rec || rec.status !== INTERACTION_STATUS.PENDING || rec.submitting) return false
      const payload = {
        interaction_id: interactionId,
        expected_state_revision: rec.stateRevision || 0,
        approved
      }
      const ok = hasStudioCommandTransport()
        ? sendStudioCommand('interaction.reply', payload)
        : chatClient?.status === WS_STATUS.ONLINE && chatClient.send('interaction.reply', payload)
      if (!ok) return false
      rec.repliedAt = Date.now()
      rec.submitting = true
      return true
    },
    // 记录定稿（幂等）：状态迁移 resolved + 出队；result 缺省按已超时
    _resolveInteraction(interactionId, result) {
      const rec = this.interactionsById[interactionId]
      if (!rec || rec.status !== INTERACTION_STATUS.PENDING) return
      rec.status = INTERACTION_STATUS.RESOLVED
      rec.result = result || INTERACTION_RESULT.EXPIRED
      rec.submitting = false
      this.pendingInteractions = this.pendingInteractions.filter((it) => it.id !== interactionId)
    }
  }
})
