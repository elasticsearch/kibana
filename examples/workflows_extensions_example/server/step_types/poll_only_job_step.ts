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
import { pollOnlyJobStepCommonDefinition } from '../../common/step_types/poll_only_job_step';

const authorStateSchema = z.object({
  lastKnownStatus: z.enum(['pending', 'running']),
  firstCheckedAt: z.string(),
  pollsSeen: z.number().int(),
});

export const pollOnlyJobStepDefinition = createPollServerStepDefinition({
  ...pollOnlyJobStepCommonDefinition,
  stateSchema: authorStateSchema,
  poll: async (context) => {
    const { jobId, simulatedStatusPolls } = context.input;
    const lastPollIndex = simulatedStatusPolls - 1;

    if (context.attempt < lastPollIndex) {
      const lastKnownStatus = context.attempt === 0 ? ('pending' as const) : ('running' as const);
      const pollsSeen = (context.state?.pollsSeen ?? 0) + 1;
      const firstCheckedAt = context.state?.firstCheckedAt ?? new Date().toISOString();

      context.logger.debug(
        `Job ${jobId}: ${lastKnownStatus} (poll ${context.attempt + 1}/${simulatedStatusPolls})`
      );

      return {
        state: {
          lastKnownStatus,
          firstCheckedAt,
          pollsSeen,
        },
      };
    }

    context.logger.info(`Job ${jobId}: completed after ${context.attempt + 1} poll(s)`);
    return {
      output: {
        jobId,
        status: 'completed' as const,
        resultUri: `/internal/example/jobs/${jobId}/result`,
        completedAt: new Date().toISOString(),
      },
    };
  },
  policy: {
    strategy: 'exponential',
    initialMs: 1500,
    maxMs: 8000,
    multiplier: 2,
    jitter: true,
  },
  // maxWaitMs caps each inter-poll sleep, not total step duration
  ceilings: { maxAttempts: 12, maxWaitMs: 30_000 },
});
