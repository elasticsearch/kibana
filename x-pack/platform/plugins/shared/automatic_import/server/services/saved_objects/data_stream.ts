/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { dataStreamSchemaV1 } from './schemas/data_stream_schema';
import { DATA_STREAM_SAVED_OBJECT_TYPE } from './constants';

export const dataStreamSavedObjectType: SavedObjectsType = {
  name: DATA_STREAM_SAVED_OBJECT_TYPE,
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: {
    dynamic: false,
    properties: {
      data_stream_id: {
        type: 'keyword',
      },
      integration_id: {
        type: 'keyword',
      },
      title: {
        type: 'text',
      },
      created_by: {
        type: 'keyword',
      },
      job_info: {
        type: 'nested',
        properties: {
          job_id: {
            type: 'keyword',
          },
          job_type: {
            type: 'keyword',
          },
          status: {
            type: 'keyword',
          },
          phase: {
            type: 'keyword',
            ignore_above: 1024,
          },
        },
      },
      metadata: {
        properties: {
          // sample_count , version , created_at etc.,
        },
      },
      result: {
        properties: {
          // ingest_pipeline , field_mapping etc.,
        },
      },
    },
  },
  management: {
    icon: 'data_stream',
    defaultSearchField: 'title',
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.title;
    },
  },
  modelVersions: {
    1: {
      changes: [],
      schemas: {
        forwardCompatibility: dataStreamSchemaV1.extends({}, { unknowns: 'ignore' }),
        create: dataStreamSchemaV1,
      },
    },
    2: {
      changes: [
        {
          type: 'mappings_addition',
          addedMappings: {
            title: { type: 'text' },
          },
        },
      ],
      schemas: {
        forwardCompatibility: dataStreamSchemaV1.extends({}, { unknowns: 'ignore' }),
        create: dataStreamSchemaV1,
      },
    },
    3: {
      changes: [
        {
          type: 'mappings_addition',
          addedMappings: {
            job_info: {
              type: 'nested',
              properties: {
                phase: { type: 'keyword', ignore_above: 1024 },
              },
            },
          },
        },
      ],
      schemas: {
        forwardCompatibility: dataStreamSchemaV1.extends({}, { unknowns: 'ignore' }),
        create: dataStreamSchemaV1,
      },
    },
  },
};
