/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import { createKiStepCommonDefinition } from '../../common/step_types/create_ki';
import type { KiStepDependencies } from './helpers';
import {
  assertContextEngineEnabled,
  assertKiWritePrivilege,
  assertWritableDest,
  resolveOrCreateAiIndex,
  withKiWriteTelemetry,
} from './helpers';

export const getCreateKiStepDefinition = ({
  getAiIndexService,
  isContextEngineEnabled,
  checkWritePrivilege,
  analyticsService,
  logger,
}: KiStepDependencies) =>
  createServerStepDefinition({
    ...createKiStepCommonDefinition,
    handler: async (context) => {
      const request = context.contextManager.getFakeRequest();
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      await assertContextEngineEnabled(isContextEngineEnabled, spaceId);

      const { ai_index_id: aiIndexId, ki_id: kiId, ki } = context.input;
      return withKiWriteTelemetry({
        action: 'create',
        aiIndexId,
        analyticsService,
        logger,
        run: async (setManaged) => {
          await assertKiWritePrivilege(checkWritePrivilege, request, spaceId);

          const { dest, managed } = await resolveOrCreateAiIndex(
            getAiIndexService,
            aiIndexId,
            spaceId
          );
          setManaged(managed);
          assertWritableDest(aiIndexId, dest);
          if (kiId !== undefined && dest.type === 'data_stream') {
            throw new ExecutionError({
              type: 'ValidationError',
              message: `Cannot create KI '${kiId}' in AI index '${aiIndexId}': the data stream backing store '${dest.value}' generates document ids`,
              details: { aiIndexId, kiId, destValue: dest.value },
            });
          }
          const esClient = context.contextManager.getScopedEsClient();

          const response = await esClient.index(
            {
              index: dest.value,
              ...(kiId !== undefined && { id: kiId }),
              document: { '@timestamp': new Date().toISOString(), ...ki },
              // Data streams only accept `create`; `wait_for` makes the KI visible to later steps.
              ...(dest.type === 'data_stream' && { op_type: 'create' as const }),
              refresh: 'wait_for',
            },
            { signal: context.abortSignal }
          );

          return { output: { id: response._id } };
        },
      });
    },
  });
