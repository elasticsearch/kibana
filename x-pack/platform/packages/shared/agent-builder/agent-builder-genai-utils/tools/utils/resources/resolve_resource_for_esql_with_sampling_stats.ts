/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { EsResourceType } from '@kbn/agent-builder-common';
import type { MappingFieldWithStats } from '../sampling';
import { getSampleDocs, createStatsFromSamples, combineFieldsWithStats } from '../sampling';
import type { ResolveResourceResponse } from './resolve_resource';
import { resolveResourceForEsql } from './resolve_resource';

export type ResolvedResourceWithSampling = Omit<ResolveResourceResponse, 'fields'> & {
  fields: MappingFieldWithStats[];
};

/**
 * Resolve an ES|QL target and generate field stats based on sampling.
 */
export const resolveResourceForEsqlWithSamplingStats = async ({
  resourceName,
  esClient,
  samplingSize,
  includeDatasets = false,
}: {
  resourceName: string;
  esClient: ElasticsearchClient;
  samplingSize?: number;
  includeDatasets?: boolean;
}) => {
  const resource = await resolveResourceForEsql({ resourceName, esClient, includeDatasets });
  // datasets are not searchable via `_search`, so skip sampling entirely for them
  const stats =
    resource.type === EsResourceType.dataset
      ? createStatsFromSamples({ samples: [] })
      : await getSampleDocs({ esClient, index: resourceName, size: samplingSize })
          .then(({ samples }) => createStatsFromSamples({ samples }))
          .catch(() => createStatsFromSamples({ samples: [] }));

  const combinedFields = combineFieldsWithStats({ fields: resource.fields, stats });

  return {
    ...resource,
    fields: combinedFields,
  };
};
