/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EvaluationIndices } from './constants';

/**
 * Shared privilege descriptors for the golden cluster API key.
 *
 * Used by the CLI (`node scripts/evals init`) and the evals plugin
 * (remote Kibana configuration UI). Consumers override `name` and
 * `metadata` to suit their context.
 */
export const goldenClusterPrivileges = {
  kibana_role_descriptors: {
    'kbn-evals-all': {
      elasticsearch: {
        cluster: ['manage_index_templates'],
        indices: [
          {
            names: [`${EvaluationIndices.SCORES}*`],
            privileges: ['auto_configure', 'create_index', 'create', 'read', 'view_index_metadata'],
          },
          {
            names: ['traces-*'],
            privileges: ['auto_configure', 'create_index', 'create', 'read', 'view_index_metadata'],
          },
          {
            names: [
              `${EvaluationIndices.DATASETS}*`,
              `${EvaluationIndices.DATASET_EXAMPLES}*`,
              `${EvaluationIndices.EVALUATORS}*`,
            ],
            privileges: [
              'auto_configure',
              'create_index',
              'create',
              'read',
              'view_index_metadata',
              'delete',
              'index',
            ],
          },
        ],
      },
      kibana: [{ base: [], spaces: ['*'], feature: { evals: ['all'] } }],
    },
  },
} as const;
