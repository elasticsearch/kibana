/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';

import { DATA_SOURCE_BY_ID_ROUTE_PATH } from '../../../common';
import { DataSourcesClient } from '../../data_sources_client';
import { getRouteErrorMessage } from '../../get_route_error_message';
import type { DataFederationConfigType } from '../../config';

import { putDataSourceBodySchema } from './data_source_schema';

export function registerCreateDataSource(router: IRouter, config: DataFederationConfigType): void {
  router.put(
    {
      path: DATA_SOURCE_BY_ID_ROUTE_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      options: {
        access: 'internal',
      },
      validate: {
        params: schema.object({
          id: schema.string({ maxLength: 256 }),
        }),
        body: putDataSourceBodySchema,
      },
    },
    router.handleLegacyErrors(async (context, request, response) => {
      const { id } = request.params;
      const { client } = (await context.core).elasticsearch;
      const dataSourcesClient = new DataSourcesClient(client.asCurrentUser);
      // check to see if other requests need to try/catch
      try {
        if (request.body.type === 'gcs' && !config.enableGoogleCloudStorageDataSourceType) {
          return response.badRequest({
            body: {
              message: 'Google Cloud Storage data sources are disabled by configuration.',
            },
          });
        }
        if (request.body.type === 'azure' && !config.enableAzureDataSourceType) {
          return response.badRequest({
            body: {
              message: 'Azure data sources are disabled by configuration.',
            },
          });
        }
        await dataSourcesClient.put(id, request.body);
        return response.ok();
      } catch (error) {
        return response.badRequest({
          body: {
            message: getRouteErrorMessage(error),
          },
        });
      }
    })
  );
}
