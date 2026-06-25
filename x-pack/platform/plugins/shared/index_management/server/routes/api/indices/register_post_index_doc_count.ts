/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from '../../../types';
import { addInternalBasePath } from '..';

export function registerPostIndexDocCountRoute({
  router,
  lib: { handleEsError },
}: RouteDependencies) {
  router.post(
    {
      path: addInternalBasePath('/index_doc_count'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: {
        body: schema.object({
          indexNames: schema.arrayOf(schema.string({ maxLength: 1000 }), {
            minSize: 1,
            maxSize: 1000,
          }),
        }),
      },
    },
    async (context, request, response) => {
      const client = (await context.core).elasticsearch.client.asCurrentUser;
      const { indexNames } = request.body;

      try {
        // use ES since index list is too long for query dsl
        const result = await client.esql.query({
          query: `FROM ${indexNames.join(',')} METADATA _index | STATS count() BY _index`,
          // return partial results instead of failing the whole request when some shards are unavailable
          allow_partial_results: true,
        });

        const indexNameIndex = result.columns.findIndex((col) => col.name === '_index');
        const countIndex = result.columns.findIndex((col) => col.name === 'count()');

        const values = (result.values || []).reduce((col, vals) => {
          col[vals[indexNameIndex] as string] = vals[countIndex] as number;
          return col;
        }, {} as Record<string, number>);

        // add zeros back in since they won't be present in the results
        indexNames.forEach((indexName) => {
          if (!(indexName in values)) {
            values[indexName] = 0;
          }
        });

        return response.ok({ body: values });
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}
