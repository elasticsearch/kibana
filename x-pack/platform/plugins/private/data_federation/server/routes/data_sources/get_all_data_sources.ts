/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';

import { DATA_SOURCES_LIST_ROUTE_PATH } from '../../../common';
import { DataSourcesClient } from '../../data_sources_client';

export function registerGetAllDataSources(router: IRouter): void {
  router.get(
    {
      path: DATA_SOURCES_LIST_ROUTE_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      options: {
        access: 'internal',
      },
      validate: false,
    },
    router.handleLegacyErrors(async (context, _request, response) => {
      const { client } = (await context.core).elasticsearch;
      const dataSourcesClient = new DataSourcesClient(client.asCurrentUser);
      const body = await dataSourcesClient.getAll();
      return response.ok({ body });
    })
  );
}
