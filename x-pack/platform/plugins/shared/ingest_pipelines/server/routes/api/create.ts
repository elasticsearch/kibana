/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';

import type { Pipeline } from '../../../common/types';
import { API_BASE_PATH } from '../../../common/constants';
import type { RouteDependencies } from '../../types';
import { pipelineSchema } from './shared';

const bodySchema = schema.object({
  name: schema.string({ maxLength: 1000 }),
  ...pipelineSchema,
});

export const registerCreateRoute = ({
  router,
  lib: { handleEsError },
}: RouteDependencies): void => {
  router.post(
    {
      path: API_BASE_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: {
        body: bodySchema,
      },
    },
    async (ctx, req, res) => {
      const { client: clusterClient } = (await ctx.core).elasticsearch;
      const pipeline = req.body as Pipeline;

      const { name, description, processors, version, on_failure, _meta, field_access_pattern } =
        pipeline;

      try {
        // Check that a pipeline with the same name doesn't already exist
        const pipelineByName = await clusterClient.asCurrentUser.ingest.getPipeline({
          id: name,
        });

        if (pipelineByName[name]) {
          return res.conflict({
            body: new Error(
              i18n.translate('xpack.ingestPipelines.createRoute.duplicatePipelineIdErrorMessage', {
                defaultMessage: "There is already a pipeline with name ''{name}''.",
                values: {
                  name,
                },
              })
            ),
          });
        }
      } catch (e) {
        // Silently swallow error
      }

      try {
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
