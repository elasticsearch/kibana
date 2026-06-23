/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { TestGrokPatternResponse } from '@kbn/file-upload-common';
import type { StartDeps } from './types';
import { wrapError } from './utils/error_wrapper';

/**
 * @apiGroup DataVisualizer
 *
 * @api {post} /internal/data_visualizer/test_grok_pattern Tests a grok pattern against a sample of text
 * @apiName testGrokPattern
 * @apiDescription Tests a grok pattern against a sample of text and return the positions of the fields
 */
export function routes(coreSetup: CoreSetup<StartDeps, unknown>, logger: Logger) {
  const router = coreSetup.http.createRouter();
  router.versioned
    .post({
      path: '/internal/data_visualizer/test_grok_pattern',
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['fileUpload:analyzeFile'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object({
              grokPattern: schema.string({ maxLength: 10000 }),
              text: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
              ecsCompatibility: schema.maybe(schema.string({ maxLength: 10000 })),
            }),
          },
        },
      },
      async (context, request, response) => {
        try {
          const esClient = (await context.core).elasticsearch.client;
          const body = await esClient.asInternalUser.transport.request<TestGrokPatternResponse>({
            method: 'GET',
            path: `/_text_structure/test_grok_pattern`,
            body: {
              grok_pattern: request.body.grokPattern,
              text: request.body.text,
            },
            ...(request.body.ecsCompatibility
              ? {
                  querystring: { ecs_compatibility: request.body.ecsCompatibility },
                }
              : {}),
          });

          return response.ok({ body });
        } catch (e) {
          logger.warn(`Unable to test grok pattern ${e.message}`);
          return response.customError(wrapError(e));
        }
      }
    );

  /**
   * @apiGroup DataVisualizer
   *
   * @api {get} /internal/data_visualizer/inference_endpoints Returns a list of inference endpoints which are currently deployed
   * @apiName inferenceEndpoints
   * @apiDescription Returns a list of inference endpoints where the underlying model is currently deployed
   */
  router.versioned
    .get({
      path: '/internal/data_visualizer/inference_endpoints',
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['fileUpload:analyzeFile'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      async (context, request, response) => {
        try {
          const esClient = (await context.core).elasticsearch.client;
          const { endpoints } = await esClient.asCurrentUser.inference.get({
            inference_id: '_all',
          });

          const filteredInferenceEndpoints = endpoints.filter((endpoint) => {
            return (
              endpoint.task_type === 'sparse_embedding' || endpoint.task_type === 'text_embedding'
            );
          });

          return response.ok({ body: filteredInferenceEndpoints });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      }
    );

  /**
   * @apiGroup DataVisualizer
   *
   * @api {get} /internal/data_visualizer/inference/{inferenceId} Runs inference on a given inference endpoint with the provided input
   * @apiName inference
   * @apiDescription Runs inference on a given inference endpoint with the provided input.
   */
  router.versioned
    .post({
      path: '/internal/data_visualizer/inference/{inferenceId}',
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['fileUpload:analyzeFile'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              inferenceId: schema.string({ maxLength: 10000 }),
            }),
            body: schema.object({
              input: schema.string({ maxLength: 10000 }),
            }),
          },
        },
      },
      async (context, request, response) => {
        try {
          const inferenceId = request.params.inferenceId;
          const input = request.body.input;
          const esClient = (await context.core).elasticsearch.client;
          const body = await esClient.asCurrentUser.inference.inference(
            {
              inference_id: inferenceId,
              input,
            },
            { maxRetries: 0, requestTimeout: 10 * 60 * 1000 }
          );

          return response.ok({ body });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      }
    );
}
