/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Type } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { PRIMITIVE_RUNTIME_FIELD_TYPES } from '@kbn/as-code-data-views-schema';
import { MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH } from '../common/constants';
import type { RuntimeType } from '../common';

export const serializedFieldFormatSchema = schema.object(
  {
    id: schema.maybe(
      schema.string({
        meta: {
          description:
            'The unique identifier for the field format, such as `number`, `bytes`, or `percent`.',
        },
      })
    ),
    params: schema.maybe(
      schema.any({
        meta: {
          description:
            'Configuration parameters for the field format. The available options depend on the format type.',
        },
      })
    ),
  },
  {
    meta: {
      id: 'serialized_field_format',
      description: 'Custom formatter to apply when displaying the field value.',
    },
  }
);

export const runtimeFieldNonCompositeFieldsSpecTypeSchema = schema.oneOf(
  PRIMITIVE_RUNTIME_FIELD_TYPES.map((runtimeFieldType) => schema.literal(runtimeFieldType)) as [
    Type<RuntimeType>
  ]
);

const primitiveRuntimeFieldSchemaShared = {
  script: schema.maybe(
    schema.object({
      source: schema.string({
        meta: { description: 'The Painless script to execute at query time.' },
      }),
    })
  ),
  format: schema.maybe(serializedFieldFormatSchema),
  customLabel: schema.maybe(
    schema.string({
      meta: { description: 'A custom display label for the runtime field.' },
    })
  ),
  customDescription: schema.maybe(
    schema.string({
      maxLength: MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH,
      meta: { description: 'A custom description for the runtime field.' },
    })
  ),
  popularity: schema.maybe(
    schema.number({
      min: 0,
      meta: {
        description:
          'A popularity score for the field, used to prioritize fields in the field list. Higher values indicate more popular fields.',
      },
    })
  ),
};

export const primitiveRuntimeFieldSchema = schema.object({
  type: runtimeFieldNonCompositeFieldsSpecTypeSchema,
  ...primitiveRuntimeFieldSchemaShared,
});

const primitiveRuntimeFieldSchemaUpdate = schema.object({
  type: schema.maybe(runtimeFieldNonCompositeFieldsSpecTypeSchema),
  ...primitiveRuntimeFieldSchemaShared,
});

const compositeRuntimeFieldSchemaShared = {
  script: schema.maybe(
    schema.object({
      source: schema.string({
        meta: {
          description:
            'The Painless script to execute at query time. A composite script emits multiple values accessed as sub-fields.',
        },
      }),
    })
  ),
  fields: schema.maybe(
    schema.recordOf(
      schema.string(),
      schema.object({
        type: runtimeFieldNonCompositeFieldsSpecTypeSchema,
        format: schema.maybe(serializedFieldFormatSchema),
        customLabel: schema.maybe(
          schema.string({
            meta: { description: 'A custom display label for this sub-field.' },
          })
        ),
        customDescription: schema.maybe(
          schema.string({
            maxLength: MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH,
            meta: { description: 'A custom description for this sub-field.' },
          })
        ),
        popularity: schema.maybe(
          schema.number({
            min: 0,
            meta: { description: 'A popularity score for this sub-field.' },
          })
        ),
      }),
      {
        meta: {
          description:
            'A map of sub-field names to their type and format definitions. Each sub-field maps to a value emitted by the composite script.',
        },
      }
    )
  ),
};

export const compositeRuntimeFieldSchema = schema.object({
  type: schema.literal('composite') as Type<RuntimeType>,
  ...compositeRuntimeFieldSchemaShared,
});

const compositeRuntimeFieldSchemaUpdate = schema.object({
  type: schema.maybe(schema.literal('composite') as Type<RuntimeType>),
  ...compositeRuntimeFieldSchemaShared,
});

export const runtimeFieldSchema = schema.oneOf(
  [primitiveRuntimeFieldSchema, compositeRuntimeFieldSchema],
  { meta: { id: 'runtime_field' } }
);

export const runtimeFieldSchemaUpdate = schema.oneOf(
  [primitiveRuntimeFieldSchemaUpdate, compositeRuntimeFieldSchemaUpdate],
  { meta: { id: 'runtime_field_update' } }
);

export const fieldSpecSchemaFields = {
  name: schema.string({
    maxLength: 1000,
    meta: { description: 'The name of the field.' },
  }),
  type: schema.string({
    defaultValue: 'string',
    maxLength: 1000,
    meta: {
      description:
        'The field type, such as `string`, `number`, `date`, `boolean`, `geo_point`, or `ip`.',
    },
  }),
  count: schema.maybe(
    schema.number({
      min: 0,
      meta: {
        description:
          'A popularity count for the field, used to prioritize fields in the field list.',
      },
    })
  ),
  script: schema.maybe(
    schema.string({
      maxLength: 1000000,
      meta: { description: 'A Painless script for a scripted field.' },
    })
  ),
  format: schema.maybe(serializedFieldFormatSchema),
  esTypes: schema.maybe(
    schema.arrayOf(schema.string(), {
      maxSize: 60,
      meta: { description: 'The Elasticsearch field types associated with this field.' },
    })
  ),
  scripted: schema.maybe(
    schema.boolean({
      meta: { description: 'Indicates whether this is a scripted field.' },
    })
  ),
  subType: schema.maybe(
    schema.object(
      {
        multi: schema.maybe(
          schema.object({
            parent: schema.string({
              meta: { description: 'The name of the parent multi-field.' },
            }),
          })
        ),
        nested: schema.maybe(
          schema.object({
            path: schema.string({
              meta: { description: 'The path to the nested field.' },
            }),
          })
        ),
      },
      {
        meta: { description: 'Sub-type information for multi-fields and nested fields.' },
      }
    )
  ),
  customLabel: schema.maybe(
    schema.string({
      meta: { description: 'A custom display label for the field.' },
    })
  ),
  customDescription: schema.maybe(
    schema.string({
      maxLength: MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH,
      meta: { description: 'A custom description for the field.' },
    })
  ),
  shortDotsEnable: schema.maybe(
    schema.boolean({
      meta: {
        description:
          'Indicates whether short dot notation is enabled. When enabled, long field names such as `a.b.c.d` are displayed as `a.b...d`. This is a read-only value derived from the Kibana `shortDots:enable` setting.',
      },
    })
  ),
  searchable: schema.maybe(
    schema.boolean({
      meta: { description: 'Indicates whether the field is searchable.' },
    })
  ),
  aggregatable: schema.maybe(
    schema.boolean({
      meta: { description: 'Indicates whether the field can be used in aggregations.' },
    })
  ),
  readFromDocValues: schema.maybe(
    schema.boolean({
      meta: { description: 'Indicates whether the field values are read from doc values.' },
    })
  ),
  runtimeField: schema.maybe(runtimeFieldSchema),
};

export const fieldSpecSchema = schema.object(fieldSpecSchemaFields, {
  // Allow and ignore unknowns to make fields transient.
  // Because `fields` have a bunch of calculated fields
  // this allows to retrieve an index pattern and then to re-create by using the retrieved payload
  unknowns: 'ignore',
  meta: { id: 'field_spec' },
});
