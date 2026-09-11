/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Logger } from '@kbn/core/server';
import { ExecutionError } from '@kbn/workflows/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { VerifyKiStepCommonDefinition } from '../../common/step_types/verify_ki_step';
import {
  createKiVerifierRegistry,
  KiVerificationInputError,
  KiVerificationService,
} from '../ki_verification';
import type { ContextEngineAnalyticsService } from '../telemetry';
import { isContextEngineEnabledInSpace } from '../utils/is_context_engine_enabled_in_space';
import { withKiVerificationTelemetry } from './helpers';

export const createVerifyKiStepDefinition = (
  coreSetup: CoreSetup,
  logger: Logger,
  analyticsService: ContextEngineAnalyticsService
) => {
  const service = new KiVerificationService(createKiVerifierRegistry());

  return createServerStepDefinition({
    ...VerifyKiStepCommonDefinition,
    handler: async (context) => {
      const [coreStart] = await coreSetup.getStartServices();
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      const isEnabled = await isContextEngineEnabledInSpace({
        savedObjects: coreStart.savedObjects,
        uiSettings: coreStart.uiSettings,
        spaceId,
      });
      if (!isEnabled) {
        throw new ExecutionError({
          type: 'FeatureDisabledError',
          message: `Context Engine is disabled. Enable the ${CONTEXT_ENGINE_ENABLED_SETTING_ID} advanced setting to verify knowledge indicators.`,
        });
      }

      const { verifiers } = context.input;

      const summary = await withKiVerificationTelemetry({
        analyticsService,
        logger,
        run: async () => {
          try {
            return await service.verifyKi(context.input.ki, {
              isEnabled,
              esClient: context.contextManager.getScopedEsClient(),
              logger,
              abortSignal: context.abortSignal,
              verifiers,
            });
          } catch (error) {
            if (error instanceof KiVerificationInputError) {
              throw new ExecutionError({
                type: 'InputValidationError',
                message: error.message,
              });
            }
            throw error;
          }
        },
      });

      return { output: summary };
    },
  });
};
