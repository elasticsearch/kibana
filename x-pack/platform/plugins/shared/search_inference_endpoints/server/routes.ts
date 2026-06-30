/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, KibanaRequest } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { Logger } from '@kbn/logging';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';
import type { InferenceConnector } from '@kbn/inference-common';
import { fetchInferenceEndpoints } from './lib/fetch_inference_endpoints';
import { defineInferenceSettingsRoutes } from './routes/inference_settings';
import { defineInferenceFeaturesRoutes } from './routes/inference_features';
import { defineInferenceConnectorsRoute } from './routes/inference_connectors';
import { defineRegionPolicyRoutes } from './routes/region_policy';
import type { InferenceFeatureRegistry } from './inference_feature_registry';
import type { ResolvedInferenceEndpoints } from './types';
import { APIRoutes } from './types';
import { errorHandler } from './utils/error_handler';
import { deleteInferenceEndpoint } from './lib/delete_inference_endpoint';

export function defineRoutes({
  logger,
  router,
  featureRegistry,
  getForFeature,
  getConnectorList,
  getConnectorById,
}: {
  logger: Logger;
  router: IRouter;
  featureRegistry: InferenceFeatureRegistry;
  getForFeature: (featureId: string, request: KibanaRequest) => Promise<ResolvedInferenceEndpoints>;
  getConnectorList: (request: KibanaRequest) => Promise<InferenceConnector[]>;
  getConnectorById: (id: string, request: KibanaRequest) => Promise<InferenceConnector>;
}) {
  defineInferenceSettingsRoutes({ logger, router, featureRegistry, getConnectorById });
  defineInferenceFeaturesRoutes({ logger, router, featureRegistry });
  defineRegionPolicyRoutes({ logger, router });
  defineInferenceConnectorsRoute({
    logger,
    router,
    featureRegistry,
    getForFeature,
    getConnectorList,
    getConnectorById,
  });
  router.get(
    {
      path: APIRoutes.GET_INFERENCE_ENDPOINTS,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      validate: {},
    },
    errorHandler(logger)(async (context, request, response) => {
      const {
        client: { asCurrentUser },
      } = (await context.core).elasticsearch;

      const { inferenceEndpoints } = await fetchInferenceEndpoints(asCurrentUser);

      return response.ok({
        body: {
          inference_endpoints: inferenceEndpoints,
        },
        headers: { 'content-type': 'application/json' },
      });
    })
  );

  router.delete(
    {
      path: APIRoutes.INFERENCE_ENDPOINT,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      validate: {
        params: schema.object({
          type: schema.string(),
          id: schema.string(),
        }),
        query: schema.object({
          scanUsage: schema.maybe(schema.boolean()),
        }),
      },
    },
    errorHandler(logger)(async (context, request, response) => {
      const {
        client: { asCurrentUser },
      } = (await context.core).elasticsearch;

      const { type, id } = request.params;
      const { scanUsage } = request.query;
      const result = await deleteInferenceEndpoint(
        asCurrentUser,
        type as InferenceTaskType,
        id,
        scanUsage ?? false
      );

      return response.ok({ body: result });
    })
  );
}
