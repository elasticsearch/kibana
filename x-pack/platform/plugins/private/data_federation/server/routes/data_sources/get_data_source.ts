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

export function registerGetDataSourceRoute(router: IRouter): void {
  router.get(
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
      },
    },
    router.handleLegacyErrors(async (context, request, response) => {
      const { id } = request.params;
      const { client } = (await context.core).elasticsearch;
      const dataSourcesClient = new DataSourcesClient(client.asCurrentUser);
      const body = await dataSourcesClient.get(id);
      return response.ok({ body });
    })
  );
}
