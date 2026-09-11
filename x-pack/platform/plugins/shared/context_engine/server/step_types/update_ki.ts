/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { isResponseError } from '@kbn/es-errors';
import { updateKiStepCommonDefinition } from '../../common/step_types/update_ki';
import type { KiStepDependencies } from './helpers';
import {
  assertContextEngineEnabled,
  assertKiWritePrivilege,
  findKiBackingIndex,
  kiNotFoundError,
  resolveAiIndex,
  withKiWriteTelemetry,
} from './helpers';

export const getUpdateKiStepDefinition = ({
  getAiIndexService,
  isContextEngineEnabled,
  checkWritePrivilege,
  analyticsService,
  logger,
}: KiStepDependencies) =>
  createServerStepDefinition({
    ...updateKiStepCommonDefinition,
    handler: async (context) => {
      const request = context.contextManager.getFakeRequest();
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      await assertContextEngineEnabled(isContextEngineEnabled, spaceId);

      const { ai_index_id: aiIndexId, ki_id: kiId, ki } = context.input;
      return withKiWriteTelemetry({
        action: 'update',
        aiIndexId,
        analyticsService,
        logger,
        run: async (setManaged) => {
          await assertKiWritePrivilege(checkWritePrivilege, request, spaceId);

          const { dest, managed } = await resolveAiIndex(getAiIndexService, aiIndexId, spaceId);
          setManaged(managed);
          const esClient = context.contextManager.getScopedEsClient();

          const backingIndex = await findKiBackingIndex({
            esClient,
            aiIndexId,
            destValue: dest.value,
            kiId,
            abortSignal: context.abortSignal,
          });

          const response = await esClient
            .update(
              {
                index: backingIndex,
                id: kiId,
                doc: ki,
                refresh: 'wait_for',
              },
              { signal: context.abortSignal }
            )
            .catch((error) => {
              // The KI may have been removed concurrently.
              if (isResponseError(error) && error.statusCode === 404) {
                throw kiNotFoundError(aiIndexId, kiId);
              }
              throw error;
            });

          return {
            output: {
              id: kiId,
              result: response.result === 'noop' ? ('noop' as const) : ('updated' as const),
            },
          };
        },
      });
    },
  });
