/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import {
  MAX_NAME_LENGTH,
  primitiveTypeSchema,
  RUNTIME_FIELD_COMPOSITE_TYPE,
  scriptSchema,
} from './common';
import { fieldSettingsWithPopularitySchema } from '../schema_field_settings';

export const savedRuntimeFieldBaseSchema = fieldSettingsWithPopularitySchema.extends(
  {
    type: primitiveTypeSchema,
  },
  { meta: { id: 'kbn-saved-runtime-field-base-schema', title: 'Saved runtime field base' } }
);

export const savedPrimitiveRuntimeFieldSchema = savedRuntimeFieldBaseSchema.extends(
  {
    script: scriptSchema,
  },
  { meta: { id: 'kbn-saved-runtime-field-schema', title: 'Saved runtime field' } }
);

export const savedCompositeRuntimeFieldSchema = schema.object(
  {
    type: schema.literal(RUNTIME_FIELD_COMPOSITE_TYPE),
    fields: schema.recordOf(
      schema.string({ minLength: 1, maxLength: MAX_NAME_LENGTH }),
      savedRuntimeFieldBaseSchema
    ),
    script: scriptSchema,
  },
  {
    meta: {
      id: 'kbn-saved-composite-runtime-field-schema',
      title: 'Saved composite runtime field',
    },
  }
);

export const savedRuntimeFieldSchema = schema.discriminatedUnion('type', [
  savedPrimitiveRuntimeFieldSchema,
  savedCompositeRuntimeFieldSchema,
]);
