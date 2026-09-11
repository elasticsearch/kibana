/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, IRouter, RequestHandlerContext } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { schema } from '@kbn/config-schema';
import type {
  InferenceInferenceEndpointInfo,
  InferenceTaskType,
} from '@elastic/elasticsearch/lib/api/types';

import { inferenceEndpointSchema } from '@kbn/inference-common/src/inference_endpoint_schema';

import type { InferenceServicesGetResponse } from '../types';
import { INFERENCE_ENDPOINT_INTERNAL_API_VERSION } from '../../common';
import { inferenceEndpointExists } from '../lib/inference_endpoint_exists';
import { unflattenObject } from '../utils/unflatten_object';

export const getInferenceServicesRoute = (
  router: IRouter<RequestHandlerContext>,
  logger: Logger
) => {
  router.versioned
    .get({
      access: 'internal',
      path: '/internal/_inference/_services',
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to es client',
        },
      },
    })
    .addVersion(
      {
        version: INFERENCE_ENDPOINT_INTERNAL_API_VERSION,
        validate: {},
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<InferenceServicesGetResponse>> => {
        try {
          const esClient = (await context.core).elasticsearch.client.asInternalUser;

          const result = await esClient.transport.request<InferenceServicesGetResponse>({
            method: 'GET',
            path: `/_inference/_services`,
          });

          return response.ok({
            body: result,
          });
        } catch (err) {
          logger.error(err);
          return response.customError({
            body: { message: err.message },
            statusCode: err.statusCode,
          });
        }
      }
    );

  router.versioned
    .post({
      access: 'internal',
      path: '/internal/_inference/_add',
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to es client',
        },
      },
    })
    .addVersion(
      {
        version: INFERENCE_ENDPOINT_INTERNAL_API_VERSION,
        validate: {
          request: {
            body: inferenceEndpointSchema,
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<InferenceInferenceEndpointInfo>> => {
        try {
          const esClient = (await context.core).elasticsearch.client.asCurrentUser;

          const { config, secrets } = request.body;

          const serviceSettings = {
            ...unflattenObject(config?.providerConfig ?? {}),
            ...unflattenObject(secrets?.providerSecrets ?? {}),
          };

          const taskSettingsWithHeaders = {
            ...unflattenObject(config?.taskTypeConfig ?? {}), // TODO: confirm this unflatten is needed
            ...(config?.headers ? { headers: config.headers } : {}),
          };

          const result = await esClient.inference.put({
            inference_id: config?.inferenceId ?? '',
            task_type: config?.taskType as InferenceTaskType,
            inference_config: {
              service: config?.provider,
              service_settings: serviceSettings,
              ...(Object.keys(taskSettingsWithHeaders).length
                ? { task_settings: taskSettingsWithHeaders }
                : {}),
            },
          });

          return response.ok({
            body: result,
          });
        } catch (err) {
          logger.error(err);
          return response.customError({
            body: err.message,
            statusCode: err.statusCode,
          });
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: '/internal/_inference/_exists/{inferenceId}',
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to es client',
        },
      },
    })
    .addVersion(
      {
        version: INFERENCE_ENDPOINT_INTERNAL_API_VERSION,
        validate: {
          request: {
            params: schema.object({
              inferenceId: schema.string(),
            }),
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<{ isEndpointExists: boolean }>> => {
        try {
          const esClient = (await context.core).elasticsearch.client.asCurrentUser;

          const result = await inferenceEndpointExists(esClient, request.params.inferenceId);

          return response.ok({
            body: { isEndpointExists: result },
          });
        } catch (err) {
          logger.error(err);
          return response.customError({
            body: err.message,
            statusCode: err.statusCode,
          });
        }
      }
    );

  router.versioned
    .put({
      access: 'internal',
      path: '/internal/_inference/_update',
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to es client',
        },
      },
    })
    .addVersion(
      {
        version: INFERENCE_ENDPOINT_INTERNAL_API_VERSION,
        validate: {
          request: {
            body: inferenceEndpointSchema,
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<InferenceInferenceEndpointInfo>> => {
        try {
          const esClient = (await context.core).elasticsearch.client.asCurrentUser;

          const { config, secrets } = request.body;

          const taskSettingsWithHeaders = {
            ...unflattenObject(config?.taskTypeConfig ?? {}),
            ...(config?.headers ? { headers: config.headers } : {}),
          };

          const adaptiveAllocations = config?.providerConfig?.adaptive_allocations;
          const numAllocations = config?.providerConfig?.num_allocations;

          let allocationSettings = {};
          if (adaptiveAllocations) {
            allocationSettings = { adaptive_allocations: adaptiveAllocations };
          } else if (numAllocations) {
            allocationSettings = { num_allocations: numAllocations };
          }

          const body = {
            service_settings: {
              ...(secrets?.providerSecrets?.api_key && {
                api_key: secrets.providerSecrets.api_key,
              }),
              ...allocationSettings,
            },
            ...(Object.keys(taskSettingsWithHeaders).length
              ? { task_settings: taskSettingsWithHeaders }
              : {}),
          };

          const result = await esClient.transport.request<InferenceInferenceEndpointInfo>(
            {
              method: 'PUT',
              path: `/_inference/${config.taskType}/${config.inferenceId}/_update`,
              body: JSON.stringify(body),
            },
            {
              headers: {
                'content-type': 'application/json',
              },
            }
          );

          return response.ok({
            body: result,
          });
        } catch (err) {
          logger.error(err);
          return response.customError({
            body: err.message,
            statusCode: err.statusCode,
          });
        }
      }
    );
};
