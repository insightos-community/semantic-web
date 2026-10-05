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

import request from './request'
import { studioFixture } from '@/fixtures/studioFixture'

const fixtureEnabled = () => import.meta.env.VITE_STUDIO_FIXTURES === 'true'
const id = (value) => encodeURIComponent(value)

export async function listWorkflows(projectId, includeEnded = false) {
  const response = fixtureEnabled()
    ? await studioFixture.listWorkflows(projectId, includeEnded)
    : await request.get('/projects/' + id(projectId) + '/workflows', {
        params: { include_ended: includeEnded }
      })
  return response?.workflows || []
}

export async function getActivePlanProposal(projectId) {
  const response = fixtureEnabled()
    ? await studioFixture.getActivePlanProposal(projectId)
    : await request.get('/projects/' + id(projectId) + '/plan-proposals/active')
  return response?.plan_proposal || null
}

export async function getPlanProposal(projectId, proposalId) {
  const response = fixtureEnabled()
    ? await studioFixture.getPlanProposal(proposalId)
    : await request.get('/projects/' + id(projectId) + '/plan-proposals/' + id(proposalId))
  return response.plan_proposal
}

export async function approvePlanProposal(projectId, proposalId, revision) {
  const response = fixtureEnabled()
    ? await studioFixture.transitionPlanProposal(proposalId, 'approve', { revision })
    : await request.post(
        '/projects/' + id(projectId) + '/plan-proposals/' + id(proposalId) + '/approve',
        { revision }
      )
  return response.workflow_view
}

export async function discardPlanProposal(projectId, proposalId, revision) {
  const response = fixtureEnabled()
    ? await studioFixture.transitionPlanProposal(proposalId, 'discard', { revision })
    : await request.post(
        '/projects/' + id(projectId) + '/plan-proposals/' + id(proposalId) + '/discard',
        { revision }
      )
  return response.plan_proposal
}

export async function getWorkflowView(projectId, workflowId) {
  const response = fixtureEnabled()
    ? await studioFixture.getWorkflowView(workflowId)
    : await request.get('/projects/' + id(projectId) + '/workflows/' + id(workflowId) + '/view')
  return response.workflow_view
}

async function transition(projectId, workflowId, action, payload = {}) {
  const response = fixtureEnabled()
    ? await studioFixture.transitionWorkflow(workflowId, action, payload)
    : await request.post(
        '/projects/' + id(projectId) + '/workflows/' + id(workflowId) + '/' + action,
        payload
      )
  return response.workflow_view
}

export const pauseWorkflow = (projectId, workflowId, revision) =>
  transition(projectId, workflowId, 'pause', { revision })
export const resumeWorkflow = (projectId, workflowId, revision) =>
  transition(projectId, workflowId, 'resume', { revision })
export const retryRobotDecision = (projectId, workflowId, revision) =>
  transition(projectId, workflowId, 'retry-decision', { revision })
export const stopWorkflow = (projectId, workflowId, revision) =>
  transition(projectId, workflowId, 'stop', { revision })
export const confirmWorkflowStop = (projectId, workflowId, revision, reason) =>
  transition(projectId, workflowId, 'confirm-stop', {
    revision,
    physical_state_confirmed: true,
    reason
  })
