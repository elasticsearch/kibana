/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';

import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { IndicesOptions } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { MlApi } from '../../../../services/ml_api_service';

interface CategoryResults {
  success: boolean;
  results: string[];
}

export function getCategoryFields(
  mlApi: MlApi,
  indexPatternName: string,
  fieldName: string,
  size: number,
  query: any,
  runtimeMappings?: RuntimeMappings,
  indicesOptions?: IndicesOptions,
  projectRouting?: string
): Promise<CategoryResults> {
  return new Promise((resolve, reject) => {
    mlApi
      .esSearch({
        index: indexPatternName,
        size: 0,
        body: {
          query,
          aggs: {
            catFields: {
              terms: {
                field: fieldName,
                size,
              },
            },
          },
          ...(runtimeMappings !== undefined ? { runtime_mappings: runtimeMappings } : {}),
          ...(projectRouting !== undefined ? { project_routing: projectRouting } : {}),
        },
        ...(indicesOptions ?? {}),
      })
      .then((resp: any) => {
        const catFields = get(resp, ['aggregations', 'catFields', 'buckets'], []);

        resolve({
          success: true,
          results: catFields.map((f: any) => f.key),
        });
      })
      .catch((resp: any) => {
        reject(resp);
      });
  });
}
