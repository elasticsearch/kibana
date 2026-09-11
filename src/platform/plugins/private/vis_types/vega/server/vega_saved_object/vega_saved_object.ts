/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { SavedObjectsType } from '@kbn/core/server';
import type { SavedObjectsFullModelVersion } from '@kbn/core-saved-objects-server';
import { ANALYTICS_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { VEGA_SAVED_OBJECT_TYPE } from '../../common/constants';

/**
 * Temporary duplicate `@kbn/config-schema` needed for `SavedObjectsType` compatibility.
 * Use zod schema once https://github.com/elastic/kibana/pull/262683 is merged.
 */
export const vegaLibraryItemSavedObjectSchema = schema.object({
  title: schema.string({ minLength: 1 }),
  description: schema.maybe(schema.string()),
  spec: schema.oneOf([
    schema.object({
      format: schema.literal('hjson'),
      value: schema.string({ minLength: 1 }),
    }),
    schema.object({
      format: schema.literal('json'),
      value: schema.object({}, { unknowns: 'allow' }),
    }),
  ]),
});

const modelVersion1: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    forwardCompatibility: vegaLibraryItemSavedObjectSchema.extends({}, { unknowns: 'ignore' }),
    create: vegaLibraryItemSavedObjectSchema,
  },
};

export const vegaLibraryItemSavedObjectType: SavedObjectsType = {
  name: VEGA_SAVED_OBJECT_TYPE,
  indexPattern: ANALYTICS_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'multiple-isolated',
  management: {
    icon: 'visualizeApp',
    defaultSearchField: 'title',
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.title;
    },
  },
  modelVersions: {
    '1': modelVersion1,
  },
  mappings: {
    dynamic: false,
    properties: {
      title: { type: 'text' },
      description: { type: 'text' },
    },
  },
  migrations: () => {
    return {};
  },
};
