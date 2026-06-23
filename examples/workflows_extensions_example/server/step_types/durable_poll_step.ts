/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import { z } from '@kbn/zod/v4';
import { durablePollStepCommonDefinition } from '../../common/step_types/durable_poll_step';

const authorStateSchema = z.object({
  requestId: z.string(),
  queryWindow: z.string(),
  submittedAt: z.string(),
  phase: z.enum(['queued', 'rendering', 'finalizing']),
});

export const durablePollStepDefinition = createPollServerStepDefinition({
  ...durablePollStepCommonDefinition,
  stateSchema: authorStateSchema,
  start: async ({ input, logger }) => {
    const requestId = `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info(`Queued async report ${requestId} for ${input.indexPattern}`);
    return {
      state: {
        requestId,
        queryWindow: input.indexPattern,
        submittedAt: new Date().toISOString(),
        phase: 'queued' as const,
      },
    };
  },
  poll: async (context) => {
    const { simulatedRenderPolls } = context.input;
    const state = context.state;

    if (!state) {
      throw new Error('Poll ran before start() seeded durable state — check engine wiring.');
    }

    const lastPollIndex = simulatedRenderPolls - 1;
    if (context.attempt < lastPollIndex) {
      const phase = context.attempt === 0 ? ('rendering' as const) : ('finalizing' as const);
      context.logger.debug(
        `Report ${state.requestId}: ${phase} (poll ${context.attempt + 1}/${simulatedRenderPolls})`
      );
      return {
        state: {
          ...state,
          phase,
        },
      };
    }

    context.logger.info(`Report ${state.requestId}: ready after ${context.attempt + 1} poll(s)`);
    return {
      output: {
        requestId: state.requestId,
        documentDownloadPath: `/internal/example/reports/${state.requestId}.ndjson`,
        totalHits: 42,
        generatedAt: new Date().toISOString(),
      },
    };
  },
  policy: { strategy: 'fixed', intervalMs: 2000 },
  // maxWaitMs caps each inter-poll sleep, not total step duration
  ceilings: { maxAttempts: 12, maxWaitMs: 20_000 },
});
