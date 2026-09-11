/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pRetry, { AbortError } from 'p-retry';
import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import { SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID } from '../agents/investigation';
import { NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID } from '../agents/deductive_investigation';
import { installInvestigationAgent } from '../lib/install_investigation_agent';
import { installDeductiveInvestigationAgent } from '../lib/install_deductive_investigation_agent';

/** Which agent a workflow wants installed. Defaults to the significant-events investigator. */
const AGENT_INSTALLERS = {
  [SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID]: installInvestigationAgent,
  [NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID]: installDeductiveInvestigationAgent,
} as const;

/**
 * `agents.ensure` guarantees the agent document exists, not that it is searchable, and the
 * lookup on the read side is a space-filtered search rather than a realtime get. Callers that
 * schedule the workflow through Task Manager get seconds of slack for free; two adjacent steps
 * in one execution do not, so the visibility has to be waited on explicitly. Matches the retry
 * agent_builder itself uses when it installs the default agent just-in-time.
 */
const VISIBILITY_RETRY_OPTIONS = { retries: 9, factor: 1, minTimeout: 300 } as const;

export const ensureInvestigationAgentStepDefinition = (
  getAgentBuilder: () => AgentBuilderPluginStart | undefined
) =>
  createServerStepDefinition({
    id: 'nightshift.ensureInvestigationAgent',
    label: 'Ensure Nightshift Investigation Agent',
    category: StepCategory.Ai,
    description:
      'Installs an investigation agent in the space this workflow runs in, so any caller can start an investigation without installing it first. Idempotent: an existing agent is left untouched.',
    inputSchema: z.object({
      agent_id: z
        .enum([
          SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID,
          NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID,
        ])
        .optional()
        .describe(
          `Which investigation agent to install. Defaults to ${SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID}.`
        ),
    }),
    outputSchema: z.object({
      space_id: z.string().describe('The space the investigation agent was ensured in'),
      agent_id: z.string().describe('The agent that was ensured'),
    }),
    handler: async (context) => {
      const agentBuilder = getAgentBuilder();
      if (!agentBuilder) {
        throw new Error('agentBuilder is not available, cannot install the investigation agent');
      }

      const { spaceId } = context.contextManager.getContext().workflow;
      // Defaulted here rather than on the schema: a step that omits `with` altogether never
      // reaches zod, so a schema-level default would leave `agent_id` undefined at runtime.
      const agentId = context.input.agent_id ?? SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID;

      await AGENT_INSTALLERS[agentId]({ agentBuilder, spaceId });

      // Polls in the space the agent was just written to: the fake request carries no space, so
      // `callKibanaApi` prefixes the path from `workflow.spaceId` instead. Reading through
      // `getRegistry({ request: getFakeRequest() })` would resolve the default space and could
      // match an agent installed there rather than the one written here (see #284786).
      // A 404 while the write is still refreshing throws, which is what drives the retry.
      await pRetry(async () => {
        if (context.abortSignal.aborted) {
          throw new AbortError(`Cancelled while waiting for the agent in space "${spaceId}"`);
        }
        await context.contextManager.callKibanaApi({
          method: 'GET',
          path: `/api/agent_builder/agents/${agentId}`,
        });
      }, VISIBILITY_RETRY_OPTIONS);

      return { output: { space_id: spaceId, agent_id: agentId } };
    },
  });
