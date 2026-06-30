/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { API_BASE_PATH } from '../../../common/constants';
import type { RouteDependencies } from '../../types';
import { pipelineSchema } from './shared';

const bodySchema = schema.object(pipelineSchema);

const paramsSchema = schema.object({
  name: schema.string(),
});

export const registerUpdateRoute = ({
  router,
  lib: { handleEsError },
}: RouteDependencies): void => {
  router.put(
    {
      path: `${API_BASE_PATH}/{name}`,
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: {
        body: bodySchema,
        params: paramsSchema,
      },
    },
    async (ctx, req, res) => {
      const { client: clusterClient } = (await ctx.core).elasticsearch;
      const { name } = req.params;
      const { description, processors, version, on_failure, _meta, field_access_pattern } =
        req.body;

      try {
        // Verify pipeline exists; ES will throw 404 if it doesn't
        await clusterClient.asCurrentUser.ingest.getPipeline({ id: name });

        const response = await clusterClient.asCurrentUser.ingest.putPipeline({
          id: name,
          description,
          processors,
          version,
          on_failure,
          _meta,
          field_access_pattern,
        });

        return res.ok({ body: response });
      } catch (error) {
        return handleEsError({ error, response: res });
      }
    }
  );
};
