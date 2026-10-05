#!/usr/bin/env node
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

// Explicit browser steps only. No mock routes, injected Pinia state, HTTP approval,
// automatic tool approvals, automatic retries of actions, or automatic next round.
import { chromium, expect } from '@playwright/test'
import { appendFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    session: { type: 'string' },
    phase: { type: 'string', default: 'plan' },
    round: { type: 'string', default: '1' },
    prompt: { type: 'string' },
    agent: { type: 'string' },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '2400' }
  }
})
if (
  !args.session ||
  !['plan', 'review', 'execute', 'observe', 'message', 'reset'].includes(args.phase)
) {
  throw new Error(
    'Use --session <private file> --phase plan|review|execute|observe|message|reset [--round 1] [--agent display-name] [--prompt text]'
  )
}
if (!/^\d+$/.test(args.round) || Number(args.round) < 1) throw new Error('Round must be positive')
const session = JSON.parse(await readFile(args.session, 'utf8'))
const sessionMode = (await stat(args.session)).mode & 0o777
if (sessionMode & 0o077) throw new Error('Session credentials must be private (chmod 600)')
for (const base of [session.http_base, session.web_base]) {
  const url = new URL(base)
  if (url.hostname !== '127.0.0.1' || ['8080', '8081', '8090'].includes(url.port)) {
    throw new Error('Only isolated loopback services are allowed')
  }
}
const roundDir = path.join(session.output, 'rounds', args.round.padStart(2, '0'))
const roundFile = path.join(roundDir, 'round.json')
const phaseKey = `${args.phase}-${Date.now()}`
await mkdir(roundDir, { recursive: true, mode: 0o700 })
const save = (name, data) =>
  writeFile(path.join(roundDir, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const append = (name, data) =>
  appendFile(path.join(roundDir, name), JSON.stringify(data) + '\n', { mode: 0o600 })
let round
try {
  round = JSON.parse(await readFile(roundFile, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  round = {
    round: Number(args.round),
    project_id: session.project_id,
    physical_result: 'pending_review'
  }
}
if (round.project_id !== session.project_id) throw new Error('Round belongs to another Project')
if (args.phase === 'plan' && round.conversation_id)
  throw new Error('Round already planned; use a new round number')
if (args.phase === 'review' && !round.conversation_id)
  throw new Error('Review requires an existing conversation')
if (args.phase === 'execute' && (!round.proposal_id || round.workflow_id))
  throw new Error('Execute requires an unexecuted reviewed plan')
if (args.phase === 'observe' && !round.workflow_id)
  throw new Error('Observe requires this round’s Workflow')
if (args.phase === 'message' && !args.prompt)
  throw new Error('Message requires an explicit --prompt')

const browser = await chromium.launch({ headless: !args.headed })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: {
    dir: path.join(roundDir, phaseKey + '-video'),
    size: { width: 1600, height: 1000 }
  }
})
await context.addInitScript(
  ({ token }) =>
    localStorage.setItem(
      'session',
      JSON.stringify({
        token,
        user: { id: 'admin', name: 'admin' },
        currentTeam: null
      })
    ),
  { token: session.token }
)
const page = await context.newPage()
const projectBase = `/api/v1/projects/${encodeURIComponent(session.project_id)}`
let audit = Promise.resolve()
const log = (value) => {
  audit = audit.then(() => append(phaseKey + '-browser.jsonl', value))
}
page.on('pageerror', (error) => log({ at: Date.now(), type: 'pageerror', message: error.message }))
page.on('websocket', (socket) => {
  // Record relevant public conversation events, never handshake URLs or headers.
  for (const direction of ['framesent', 'framereceived'])
    socket.on(direction, ({ payload }) => {
      try {
        const event = JSON.parse(String(payload))
        if (
          event.type === 'chat.message' ||
          /^(run\.|message\.done|message\.error)/.test(event.type || '')
        ) {
          log({ at: Date.now(), direction, event })
        }
      } catch {
        /* binary scene frames are captured through actual snapshots below */
      }
    })
})
async function get(endpoint, { allowNotFound = false } = {}) {
  const response = await context.request.get(session.http_base + endpoint, {
    headers: { Authorization: `Bearer ${session.token}` },
    timeout: 30_000
  })
  if (allowNotFound && response.status() === 404) return null
  if (!response.ok()) throw new Error(`GET ${endpoint}: HTTP ${response.status()}`)
  return response.json()
}
const screenshot = (name) =>
  page.screenshot({ path: path.join(roundDir, `${phaseKey}-${name}.png`) })
const sidebar = page.getByTestId('studio-conversation-sidebar')
async function openSceneWorkspace(viewMode) {
  // The activity rail is the public entry point; there is no top-bar scene shortcut.
  await page.locator('.activity-bar').getByTitle('场景', { exact: true }).click()
  const workspace = page.getByTestId('scene-workspace')
  await expect(workspace).toBeVisible()
  if (viewMode)
    await workspace
      .getByRole('button', { name: viewMode === 'setup' ? '场景配置' : '现场', exact: true })
      .click()
  return workspace
}
async function openConversation(id) {
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  const items = (await get(projectBase + '/conversations')).conversations || []
  const item = items.find((row) => row.id === id)
  if (!item) throw new Error('Expected conversation is absent')
  await sidebar.getByRole('button', { name: '选择历史对话', exact: true }).click()
  const picker = sidebar.getByRole('dialog', { name: '选择对话', exact: true })
  await picker.getByRole('textbox', { name: '搜索对话', exact: true }).fill(item.title)
  const row = picker.locator(`.history-row[data-conversation-id="${id}"]`)
  await row.click()
  await expect(page.getByRole('textbox', { name: '对话消息', exact: true })).toBeVisible()
}
async function createConversation() {
  // Starting or selecting a scene can activate Inspector. Use the same tab
  // switch as a person before interacting with the preserved conversation view.
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === projectBase + '/conversations'
  )
  const [response] = await Promise.all([
    pending,
    sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  ])
  if (!response.ok()) throw new Error('Browser could not create conversation')
  return (await response.json()).conversation.id
}
async function send(mode, prompt) {
  await sidebar.locator('.mode-btn').click()
  await page
    .getByRole('menuitem')
    .filter({ hasText: mode === 'plan' ? '规划' : '协作' })
    .click()
  if (args.agent) {
    await sidebar.getByRole('button', { name: '选择接收 Agent', exact: true }).click()
    await sidebar.getByRole('textbox', { name: '搜索 Agent', exact: true }).fill(args.agent)
    const options = sidebar
      .getByRole('listbox', { name: '接收 Agent', exact: true })
      .getByRole('option')
    await expect(options).toHaveCount(1)
    await options.click() // The UI maps display name to the actual directory identity.
  }
  const input = page.getByRole('textbox', { name: '对话消息', exact: true })
  await input.fill(prompt)
  await input.press('Enter')
}
async function scene() {
  const result = await get(projectBase + '/simulation/snapshot')
  return result.simulation?.instance || result.instance
}
async function physicalSample(workflowView, label) {
  const started = Date.now()
  const instance = await scene()
  if (!instance?.instance_id) throw new Error('Physical evidence requires a live scene')
  const base = `${projectBase}/simulation/instances/${encodeURIComponent(instance.instance_id)}`
  const snapshot = await get(base + '/snapshot')
  const robots = (await get(base + '/robots')).robots || []
  const states = []
  // Sequential reads avoid piling up requests on the Runtime physics lock.
  for (const robot of robots)
    states.push({
      robot_id: robot.robot_id,
      state: await get(base + `/robots/${encodeURIComponent(robot.robot_id)}/state`)
    })
  await append('physical.jsonl', {
    sampled_at: new Date().toISOString(),
    request_started_at: started,
    duration_ms: Date.now() - started,
    label,
    workflow_id: round.workflow_id || null,
    active_subtasks: (workflowView?.subtasks || []).filter((s) =>
      ['running', 'paused', 'stopping'].includes(s.status)
    ),
    instance,
    snapshot,
    robot_states: states
  }) // Full joints/tool/heldObjects/profile evidence; no invented travel boolean.
}
async function captureExecutions() {
  const executions = (await get(projectBase + '/robot-executions')).executions || []
  const selected = executions.filter(
    (e) => e.workflow_id === round.workflow_id && round.workflow_id
  )
  const artifactResults = []
  for (const execution of selected) {
    let cursor = 0
    const events = []
    let latest = execution
    while (true) {
      const detail = await get(
        `/api/v1/robot-executions/${encodeURIComponent(execution.id)}?after_sequence=${cursor}`
      )
      events.push(...(detail.events || []))
      latest = detail.execution
      if (!detail.has_more) break
      if (!(detail.next_sequence > cursor))
        throw new Error('Execution pagination cursor did not advance')
      cursor = detail.next_sequence
    }
    await save(`execution-${execution.id}.json`, {
      execution: latest,
      events,
      complete_pagination: true
    })
    for (const mapping of latest.artifact_sync || []) {
      if (!mapping.server_artifact_id) {
        artifactResults.push({ ...mapping, downloaded: false })
        continue
      }
      const response = await context.request.get(
        session.http_base +
          `/api/v1/chat/artifacts/${encodeURIComponent(mapping.server_artifact_id)}`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      )
      const ext =
        { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mapping.media_type] ||
        'bin'
      const filename = `artifact-${mapping.server_artifact_id.replace(/[^\w-]/g, '_')}.${ext}`
      if (response.ok())
        await writeFile(path.join(roundDir, filename), await response.body(), { mode: 0o600 })
      artifactResults.push({
        ...mapping,
        downloaded: response.ok(),
        http_status: response.status(),
        filename
      })
    }
  }
  round.execution_ids = selected.map((e) => e.id)
  await save('artifact-index.json', artifactResults)
}
async function captureConversation() {
  const messages = []
  for (let n = 1; ; n++) {
    const result = await get(
      `/api/v1/chat/sessions/${round.conversation_id}/messages?page=${n}&page_size=200`
    )
    messages.push(...(result.messages || []))
    if (messages.length >= (result.total || 0) || !(result.messages || []).length) break
  }
  await save('messages.json', messages)
  const projectRuns = []
  for (let n = 1; ; n++) {
    const result = await get(projectBase + `/runs?page=${n}&page_size=100`)
    projectRuns.push(...(result.runs || []))
    if (projectRuns.length >= (result.total || 0) || !(result.runs || []).length) break
  }
  const runs = projectRuns.filter(
    (run) =>
      run.conversation_id === round.conversation_id ||
      (round.workflow_id && run.workflow_id === round.workflow_id)
  )
  await save('runs.json', runs)
  for (const run of runs)
    if (run.trace_id) {
      await save(
        `trace-${run.id}.json`,
        await get(`/api/v1/traces/${encodeURIComponent(run.trace_id)}/spans`)
      )
      const events = []
      let cursor = 0
      let eventsAvailable = true
      while (true) {
        const batch = await get(
          `/api/v1/runs/${encodeURIComponent(run.id)}/events?after_sequence=${cursor}&limit=100`,
          { allowNotFound: true }
        )
        if (!batch) {
          eventsAvailable = false // Old candidates retain their original API surface.
          break
        }
        events.push(...(batch.events || []))
        if (!batch.has_more) break
        if (!(batch.next_sequence > cursor)) throw new Error('Run event cursor did not advance')
        cursor = batch.next_sequence
      }
      await save(`events-${run.id}.json`, {
        events,
        complete_pagination: eventsAvailable,
        ...(eventsAvailable ? {} : { unavailable: 'Candidate has no Run events endpoint' })
      })
    }
}
try {
  await page.goto(`${session.web_base}/projects/${session.project_id}/studio`)
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  await expect(sidebar).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.status-bar')).toContainText('Server 已连接', { timeout: 60_000 })
  if (args.phase === 'plan' || args.phase === 'review') {
    if (args.phase === 'plan') {
      if (!(await scene())?.instance_id) {
        const workspace = await openSceneWorkspace('setup')
        await workspace
          .getByRole('button', { name: '启动此 Layout', exact: true })
          .click({ timeout: 60_000 })
      }
      await expect
        .poll(
          async () => {
            const devices = (await get('/api/v1/devices/snapshot')).snapshot?.robots || []
            const robot = devices.find((d) => d.robot_id === session.installed.robot_id)
            return (
              robot?.pilot?.status === 'online' &&
              robot?.ability_framework?.status === 'ready' &&
              session.installed.skills.every((skill) =>
                (robot.installed_skills || []).some(
                  (s) =>
                    s.name === skill.name &&
                    s.version === skill.version &&
                    s.enabled &&
                    s.status === 'installed'
                )
              )
            )
          },
          { timeout: 180_000, intervals: [3000] }
        )
        .toBeTruthy()
      await save('map-before.json', await get(projectBase + '/maps/simulation_map'))
      await physicalSample(null, 'before-plan')
      await openSceneWorkspace('live')
      await screenshot('ready-before-conversation')
      round.conversation_id = await createConversation()
      round.prompt =
        args.prompt ||
        '将来源托盘当前最上面一层周转箱，搬到目标托盘对应位置，放稳并恢复行走姿态。先给我计划。'
      await save('round.json', round)
      await send('plan', round.prompt)
    } else {
      await openConversation(round.conversation_id)
      if (args.prompt) {
        // Explicit review feedback revises this same proposal, never approves it
        // or starts an extra round. Keep the rejected version as evidence.
        const before = (await get(projectBase + '/plan-proposals/active')).plan_proposal
        if (before?.conversation_id !== round.conversation_id || before.status !== 'ready')
          throw new Error('Review feedback requires this round’s ready proposal')
        await save(phaseKey + '-before-revision.json', before)
        await send('plan', args.prompt)
        await expect
          .poll(
            async () => {
              const proposal = (await get(projectBase + '/plan-proposals/active')).plan_proposal
              return (
                proposal?.conversation_id === round.conversation_id &&
                proposal.status === 'ready' &&
                proposal.revision > before.revision
              )
            },
            { timeout: 300_000, intervals: [3000] }
          )
          .toBeTruthy()
      }
    }
    await expect(
      page
        .getByTestId('plan-proposal-summary')
        .getByRole('button', { name: '批准并执行', exact: true })
    ).toBeVisible({ timeout: 300_000 })
    const proposal = (await get(projectBase + '/plan-proposals/active')).plan_proposal
    if (proposal.conversation_id !== round.conversation_id || proposal.status !== 'ready')
      throw new Error('Plan does not belong to this round')
    Object.assign(round, {
      proposal_id: proposal.id,
      proposal_revision: proposal.revision,
      status: 'awaiting_review'
    })
    await save('proposal.json', proposal)
    await page.getByTestId('plan-proposal-summary').scrollIntoViewIfNeeded()
    await screenshot('plan-for-review')
    await captureConversation()
  } else if (args.phase === 'reset') {
    const active = (await get(projectBase + '/workflows?include_ended=true')).workflows || []
    if (
      active.some(
        (w) =>
          !['completed', 'failed', 'cancelled', 'canceled', 'terminated', 'stopped'].includes(
            w.status
          )
      )
    ) {
      throw new Error('Reset refused while a Workflow is nonterminal')
    }
    await physicalSample(null, 'before-explicit-reset')
    const workspace = await openSceneWorkspace('live')
    await workspace.getByRole('button', { name: '重置', exact: true }).click()
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/reset')
    )
    await page.locator('.el-message-box').getByRole('button', { name: '重置', exact: true }).click()
    if (!(await response).ok()) throw new Error('Browser scene reset failed')
    await screenshot('reset')
  } else if (args.phase === 'message') {
    const messageConversation = round.conversation_id || (await createConversation())
    if (round.conversation_id) await openConversation(round.conversation_id)
    round.conversation_id = messageConversation
    await save('round.json', round)
    const previousRuns = new Set(
      (
        (await get(projectBase + `/runs?conversation_id=${messageConversation}&page_size=100`))
          .runs || []
      ).map((run) => run.id)
    )
    await send('collaboration', args.prompt)
    await screenshot('message-sent-no-tool-approval')
    await save(phaseKey + '.json', {
      conversation_id: messageConversation,
      prompt: args.prompt,
      agent_display_name: args.agent,
      status: 'submitted_no_automatic_tool_approval',
      workflow_id: round.workflow_id || null
    })
    // Wait for the addressed reply or approval boundary without approving tools.
    const replyDeadline = Date.now() + 180_000
    let newRuns = []
    while (Date.now() < replyDeadline) {
      newRuns = (
        (await get(projectBase + `/runs?conversation_id=${messageConversation}&page_size=100`))
          .runs || []
      ).filter((run) => !previousRuns.has(run.id))
      if (
        newRuns.some((run) =>
          ['completed', 'failed', 'cancelled', 'canceled', 'waiting_input'].includes(run.status)
        )
      )
        break
      await page.waitForTimeout(3000)
    }
    await save(phaseKey + '-runs.json', newRuns)
    await save(
      phaseKey + '-messages.json',
      await get(`/api/v1/chat/sessions/${messageConversation}/messages?page=1&page_size=200`)
    )
    await captureConversation()
    await screenshot('message-response-or-approval')
  } else {
    await openConversation(round.conversation_id)
    if (args.phase === 'execute') {
      const proposal = (await get(projectBase + `/plan-proposals/${round.proposal_id}`))
        .plan_proposal
      if (proposal.status !== 'ready' || proposal.revision !== round.proposal_revision)
        throw new Error('Reviewed proposal changed; review again')
      await screenshot('before-explicit-approval')
      const pending = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === projectBase + `/plan-proposals/${round.proposal_id}/approve`
      )
      await page
        .getByTestId('plan-proposal-summary')
        .getByRole('button', { name: '批准并执行', exact: true })
        .click()
      const response = await pending
      if (!response.ok()) throw new Error('Browser plan approval failed')
      round.workflow_id = (await response.json()).workflow_view.workflow.id
      round.approved_at = new Date().toISOString()
      round.status = 'running'
      await save('round.json', round)
      await openSceneWorkspace('live')
      await screenshot('approved-still-in-scene')
    }
    if (args.phase === 'observe') await openSceneWorkspace('live')
    const deadline = Date.now() + Number(args.timeout) * 1000
    let view
    let previousStageKey = ''
    let stageFrame = 0
    while (Date.now() < deadline) {
      view = (await get(projectBase + `/workflows/${round.workflow_id}/view`)).workflow_view
      await append('workflow.jsonl', { at: new Date().toISOString(), workflow_view: view })
      const executionStages = ((await get(projectBase + '/robot-executions')).executions || [])
        .filter((execution) => execution.workflow_id === round.workflow_id)
        .map((execution) => ({
          id: execution.id,
          subtask_id: execution.subtask_id,
          skill_name: execution.skill_name,
          stage: execution.stage,
          status: execution.status
        }))
        .sort((left, right) => left.id.localeCompare(right.id))
      const stageState = {
        workflow_id: round.workflow_id,
        subtasks: (view.subtasks || [])
          .map((subtask) => ({
            id: subtask.id,
            status: subtask.status,
            execution_ref: subtask.execution_ref
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        executions: executionStages
      }
      const stageKey = JSON.stringify(stageState)
      if (stageKey !== previousStageKey) {
        previousStageKey = stageKey
        const frameName = `stage-${String(++stageFrame).padStart(3, '0')}`
        await screenshot(frameName)
        await append('stage-frames.jsonl', {
          at: new Date().toISOString(),
          filename: `${phaseKey}-${frameName}.png`,
          ...stageState
        })
      }
      try {
        await physicalSample(view, 'execution')
      } catch (error) {
        await append('evidence-errors.jsonl', { at: Date.now(), message: error.message })
      }
      if (
        ['completed', 'failed', 'cancelled', 'canceled', 'terminated', 'stopped'].includes(
          view.workflow.status
        )
      )
        break
      await page.waitForTimeout(3000)
    }
    round.workflow_status = view?.workflow.status
    round.status = [
      'completed',
      'failed',
      'cancelled',
      'canceled',
      'terminated',
      'stopped'
    ].includes(round.workflow_status)
      ? 'terminal_pending_physical_review'
      : 'observation_timeout_execution_may_continue'
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(3000)
      try {
        await physicalSample(view, `post-observation-${i}`)
      } catch (error) {
        await append('evidence-errors.jsonl', { at: Date.now(), message: error.message })
      }
    }
    await save('workflow-final.json', view)
    await captureExecutions()
    await captureConversation()
    await save('map-after.json', await get(projectBase + '/maps/simulation_map'))
    await screenshot('final')
  }
} catch (error) {
  await save(phaseKey + '-error.json', {
    message: error.message,
    at: new Date().toISOString(),
    execution_may_continue: Boolean(round.workflow_id),
    physical_result: 'not_passed'
  })
  await screenshot('failure').catch(() => {})
  if (round.workflow_id) await captureExecutions().catch(() => {})
  throw error
} finally {
  await save('round.json', round)
  await audit
  await context.close()
  await browser.close()
  console.log(
    `Evidence: ${roundDir}; physical result remains pending review. Closing the browser does not stop Robot work.`
  )
}
