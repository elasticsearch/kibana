/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { esqlFieldTypes } from '@kbn/esql-types';
import { camelCase } from 'lodash';
import type {
  IndexAutocompleteItem,
  ESQLCallbacks,
  ESQLFieldWithMetadata,
  InferenceEndpointAutocompleteItem,
  EsqlDataset,
} from '@kbn/esql-types';
import { METADATA_FIELDS } from '../../..';

export const metadataFields: ESQLFieldWithMetadata[] = METADATA_FIELDS.map((field) => ({
  name: field,
  type: 'keyword',
  userDefined: false as false,
}));

export const fields: ESQLFieldWithMetadata[] = [
  ...esqlFieldTypes.map((type) => ({
    name: `${camelCase(type)}Field`,
    type,
    userDefined: false as false,
  })),
  { name: 'any#Char$Field', type: 'double', userDefined: false },
  { name: 'kubernetes.something.something', type: 'double', userDefined: false },
  { name: '@timestamp', type: 'date', userDefined: false },
];

export const enrichFields: ESQLFieldWithMetadata[] = [
  { name: 'otherField', type: 'text', userDefined: false },
  { name: 'yetAnotherField', type: 'double', userDefined: false },
];

// eslint-disable-next-line @typescript-eslint/naming-convention
export const unsupported_field: ESQLFieldWithMetadata[] = [
  { name: 'unsupported_field', type: 'unsupported', userDefined: false },
];

export const conflictingFields: ESQLFieldWithMetadata[] = [
  {
    name: 'conflictingField',
    type: 'unsupported',
    hasConflict: true,
    originalTypes: ['text', 'keyword'],
    userDefined: false,
  },
];

export const indexes = [
  'a_index',
  'index',
  'other_index',
  '.secret_index',
  'my-index',
  'unsupported_index',
  'conflict_index',
];

export const policies = [
  {
    name: 'policy',
    sourceIndices: ['enrich_index'],
    matchField: 'otherStringField',
    enrichFields: ['otherField', 'yetAnotherField'],
  },
  {
    name: 'policy$',
    sourceIndices: ['enrich_index'],
    matchField: 'otherStringField',
    enrichFields: ['otherField', 'yetAnotherField'],
  },
];

export const joinIndices: IndexAutocompleteItem[] = [
  {
    name: 'join_index',
    mode: 'Lookup',
    aliases: [],
  },
  {
    name: 'join_index_with_alias',
    mode: 'Lookup',
    aliases: ['join_index_alias_1', 'join_index_alias_2'],
  },
  {
    name: 'lookup_index',
    mode: 'Lookup',
    aliases: [],
  },
];

export const timeseriesIndices: IndexAutocompleteItem[] = [
  {
    name: 'timeseries_index',
    mode: 'Timeseries',
    aliases: [],
  },
  {
    name: 'timeseries_index_with_alias',
    mode: 'Timeseries',
    aliases: ['timeseries_index_alias_1', 'timeseries_index_alias_2'],
  },
  {
    name: 'time_series_index',
    mode: 'Timeseries',
    aliases: [],
  },
];

export const views = [
  {
    name: 'view_1',
    query: 'from logs* | WHERE host.name = "my-host" | LIMIT 100',
  },
  {
    name: 'view_2',
    query: 'from logs* | STATS count(*) by user.name',
  },
];

export const datasets: EsqlDataset[] = [
  {
    name: 'dataset_1',
    data_source: 'data_source_1',
    resource: 's3://bucket/path/**/*.parquet',
  },
  {
    name: 'dataset_2',
    data_source: 'data_source_2',
    resource: 'db.schema.table',
  },
];

export const editorExtensions = {
  recommendedQueries: [
    {
      name: 'Logs Count by Host',
      query: 'from logs* | STATS count(*) by host',
    },
  ],
  recommendedFields: [
    {
      name: 'host.name',
      pattern: 'logs*',
    },
    {
      name: 'user.name',
      pattern: 'logs*',
    },
    {
      name: 'kubernetes.something.something',
      pattern: 'logs*',
    },
  ],
};

export const inferenceEndpoints: InferenceEndpointAutocompleteItem[] = [
  {
    inference_id: 'inference_1',
    task_type: 'completion',
  },
];

export function getCallbackMocks(): ESQLCallbacks {
  return {
    getColumnsFor: jest.fn(async ({ query } = {}) => {
      if (/enrich/.test(query)) {
        return enrichFields;
      }
      if (/unsupported_index/.test(query)) {
        return unsupported_field;
      }
      if (/conflict_index/.test(query)) {
        return conflictingFields;
      }
      if (/join_index/.test(query)) {
        const field: ESQLFieldWithMetadata = {
          name: 'keywordField',
          type: 'unsupported',
          hasConflict: true,
          userDefined: false,
        };
        return [field];
      }
      if (/METADATA/i.test(query)) {
        return [...fields, ...metadataFields];
      }
      return fields;
    }),
    getSources: jest.fn(async () =>
      indexes.map((name) => ({
        name,
        hidden: name.startsWith('.'),
        type: 'Index',
      }))
    ),
    getPolicies: jest.fn(async () => policies),
    getJoinIndices: jest.fn(async () => ({ indices: joinIndices })),
    getTimeseriesIndices: jest.fn(async () => ({ indices: timeseriesIndices })),
    getViews: jest.fn(async () => ({ views })),
    getDatasets: jest.fn(async () => ({ datasets })),
    getEditorExtensions: jest.fn(async (queryString: string) => {
      if (queryString.includes('logs*')) {
        return {
          recommendedQueries: editorExtensions.recommendedQueries,
          recommendedFields: editorExtensions.recommendedFields,
        };
      }
      return { recommendedQueries: [], recommendedFields: [] };
    }),
    getInferenceEndpoints: jest.fn(async (taskType: string) => ({
      inferenceEndpoints,
    })),
  };
}

export const additionalFieldsMock = {
  fromJoin: () => Promise.resolve([]),
  fromEnrich: () => Promise.resolve([]),
  fromFrom: () => Promise.resolve([]),
};
