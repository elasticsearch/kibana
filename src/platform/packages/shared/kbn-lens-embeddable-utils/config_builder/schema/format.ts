/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { LENS_FORMAT_NUMBER_DECIMALS_DEFAULT, LENS_FORMAT_COMPACT_DEFAULT } from './constants';
import { dslDurationFormatSchema, esqlDurationFormatSchema } from './duration_units';

const numericFormatSchema = schema.object(
  {
    type: schema.oneOf([schema.literal('number'), schema.literal('percent')], {
      meta: {
        description: 'Value format type: `number` for plain numbers, `percent` for percentages.',
      },
    }),
    /**
     * Number of decimals
     */
    decimals: schema.number({
      defaultValue: LENS_FORMAT_NUMBER_DECIMALS_DEFAULT,
      meta: {
        description: 'Number of decimal places to display.',
      },
    }),
    /**
     * Suffix
     */
    suffix: schema.maybe(
      schema.string({
        meta: {
          description: 'Suffix appended to the formatted value.',
        },
      })
    ),
    /**
     * Whether to use compact notation
     */
    compact: schema.boolean({
      defaultValue: LENS_FORMAT_COMPACT_DEFAULT,
      meta: {
        description:
          'When `true`, uses compact notation (for example, 1.2k instead of 1,200). Defaults to `false`.',
      },
    }),
  },
  {
    meta: {
      id: 'numericFormat',
      title: 'Numeric Format',
      description:
        'Number or percentage format with optional decimal places, suffix, and compact notation.',
    },
  }
);

const byteFormatSchema = schema.object(
  {
    type: schema.oneOf([schema.literal('bits'), schema.literal('bytes')], {
      meta: { description: 'Data size unit: `bits` or `bytes`.' },
    }),
    /**
     * Number of decimals
     */
    decimals: schema.number({
      defaultValue: LENS_FORMAT_NUMBER_DECIMALS_DEFAULT,
      meta: {
        description: 'Number of decimal places to display.',
      },
    }),
    /**
     * Suffix
     */
    suffix: schema.maybe(
      schema.string({
        meta: {
          description: 'Suffix appended to the formatted value.',
        },
      })
    ),
  },
  {
    meta: {
      id: 'byteFormat',
      title: 'Byte Format',
      description: 'Data size format in bits or bytes, with optional decimal places and suffix.',
    },
  }
);

const customFormatSchema = schema.object(
  {
    type: schema.literal('custom'),
    /**
     * Pattern
     */
    pattern: schema.string({
      meta: {
        description: 'Kibana field format pattern string.',
      },
    }),
  },
  {
    meta: {
      id: 'customFormat',
      title: 'Custom Format',
      description: 'Custom format using a Kibana field format pattern string.',
    },
  }
);

/**
 * Format configuration for DSL-based visualizations.
 */
export const formatTypeSchema = schema.oneOf(
  [numericFormatSchema, byteFormatSchema, dslDurationFormatSchema, customFormatSchema],
  {
    meta: {
      id: 'formatType',
      title: 'Format Type',
      description: 'Number display format for the dimension value.',
    },
  }
);

/**
 * Format configuration for ES|QL-based visualizations.
 */
export const esqlFormatTypeSchema = schema.oneOf(
  [numericFormatSchema, byteFormatSchema, esqlDurationFormatSchema, customFormatSchema],
  {
    meta: {
      id: 'esqlFormatType',
      title: 'ES|QL Format Type',
      description: 'Number display format for ES|QL dimension values.',
    },
  }
);

export const formatSchema = {
  /**
   * Format configuration
   */
  format: schema.maybe(formatTypeSchema),
};

export const esqlFormatSchema = {
  /**
   * Format configuration for ES|QL columns
   */
  format: schema.maybe(esqlFormatTypeSchema),
};
