/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { RouteDependencies } from '../../../types';
import { addBasePath } from '..';
import type { MeteringStatsResponse } from '../../../lib/types';
import type { Index } from '../../../../common/types/indices';

export function registerIndicesGet({ router, lib: { handleEsError }, config }: RouteDependencies) {
  router.get(
    {
      path: addBasePath('/indices_get'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      const { client } = (await context.core).elasticsearch;

      try {
        const indicesPromise = client.asCurrentUser.indices.get({
          index: '*',
          expand_wildcards: ['hidden', 'all'],
          // only get specified index properties from ES to keep the response under 536MB
          // node.js string length limit: https://github.com/nodejs/node/issues/33960
          filter_path: [
            '*.aliases',
            '*.settings.index.number_of_shards',
            '*.settings.index.number_of_replicas',
            '*.settings.index.frozen',
            '*.settings.index.hidden',
            '*.settings.index.mode',
            '*.settings.index.lifecycle.name',
            '*.data_stream',
          ],
          // for better performance only compute aliases and settings of indices but not mappings
          features: ['aliases', 'settings'],
        });

        // Used for serverless
        let statsPromise: Promise<MeteringStatsResponse> | undefined;
        if (config.isSizeAndDocCountEnabled) {
          // this api is internal only and therefore requires elevated privileges
          statsPromise = client.asSecondaryAuthUser.transport
            .request<MeteringStatsResponse>({
              method: 'GET',
              path: '/_metering/stats/*',
            })
            .catch(() => ({ indices: [] }));
        } else {
          statsPromise = Promise.resolve({ indices: [] });
        }

        const [indices, { indices: indicesStats }] = await Promise.all([
          indicesPromise,
          statsPromise,
        ]);

        const indexStatsMap = indicesStats.reduce<
          Record<string, { size_in_bytes: number; num_docs: number }>
        >((prev, index) => {
          prev[index.name] = { size_in_bytes: index.size_in_bytes, num_docs: index.num_docs };
          return prev;
        }, {});

        const mappedIndices: Record<string, Index> = Object.keys(indices).reduce<
          Record<string, Index>
        >((prev, indexName: string) => {
          const indexData = indices[indexName];
          const aliases = Object.keys(indexData.aliases!);
          prev[indexName] = {
            name: indexName,
            primary: Number(indexData.settings?.index?.number_of_shards),
            replica: Number(indexData.settings?.index?.number_of_replicas),
            isFrozen: indexData.settings?.index?.frozen === 'true',
            hidden: indexData.settings?.index?.hidden === 'true',
            data_stream: indexData.data_stream,
            mode: indexData.settings?.index?.mode,
            ilmPolicyName: indexData.settings?.index?.lifecycle?.name,
          };

          if (aliases.length) {
            prev[indexName].aliases = aliases;
          }

          if (indexStatsMap[indexName]) {
            prev[indexName].documents = indexStatsMap[indexName].num_docs ?? 0;
            prev[indexName].size = indexStatsMap[indexName].size_in_bytes ?? 0;
          }
          return prev;
        }, {});

        return response.ok({ body: mappedIndices });
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}
