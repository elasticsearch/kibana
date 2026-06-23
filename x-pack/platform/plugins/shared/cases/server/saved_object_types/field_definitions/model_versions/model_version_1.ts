/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsModelVersion } from '@kbn/core-saved-objects-server';
import { schema } from '@kbn/config-schema';
import {
  MAX_CUSTOM_FIELD_KEY_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TEMPLATE_DESCRIPTION_LENGTH,
} from '../../../../common/constants';

export const fieldDefinitionSchema = schema.object({
  fieldDefinitionId: schema.string({ maxLength: MAX_CUSTOM_FIELD_KEY_LENGTH }),
  name: schema.string({ maxLength: MAX_TITLE_LENGTH }),
  definition: schema.string({ maxLength: MAX_DESCRIPTION_LENGTH }),
  owner: schema.string({ maxLength: 30 }),
  description: schema.maybe(schema.string({ maxLength: MAX_TEMPLATE_DESCRIPTION_LENGTH })),
  isGlobal: schema.maybe(schema.boolean()),
});

export const modelVersion1: SavedObjectsModelVersion = {
  changes: [],
  schemas: {
    create: fieldDefinitionSchema,
    forwardCompatibility: fieldDefinitionSchema.extends({}, { unknowns: 'ignore' }),
  },
};
