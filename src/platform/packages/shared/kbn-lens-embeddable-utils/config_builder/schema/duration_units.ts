/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';

const DURATION_FINE_GRAINED_INPUT = ['ps', 'ns', 'us'] as const;
const DURATION_STANDARD_INPUT = ['ms', 's', 'm', 'h', 'd', 'w', 'mo', 'y'] as const;
const DURATION_INPUT_UNITS_DSL = [
  ...DURATION_FINE_GRAINED_INPUT,
  ...DURATION_STANDARD_INPUT,
] as const;
const DURATION_INPUT_UNITS_ESQL = DURATION_STANDARD_INPUT;
const DURATION_FRIENDLY_OUTPUT = ['humanize', 'humanizePrecise'] as const;
const DURATION_OUTPUT_UNITS = [...DURATION_FRIENDLY_OUTPUT, ...DURATION_STANDARD_INPUT] as const;

export type DurationInputUnitDsl = (typeof DURATION_INPUT_UNITS_DSL)[number];
export type DurationInputUnitEsql = (typeof DURATION_INPUT_UNITS_ESQL)[number];
export type DurationOutputUnit = (typeof DURATION_OUTPUT_UNITS)[number];

interface Options<T extends string> {
  defaultValue?: T;
  meta?: { description: string };
}

export const durationInputUnitDslSchema = (opts?: Options<DurationInputUnitDsl>) =>
  schema.oneOf(
    [
      schema.literal('ps'),
      schema.literal('ns'),
      schema.literal('us'),
      schema.literal('ms'),
      schema.literal('s'),
      schema.literal('m'),
      schema.literal('h'),
      schema.literal('d'),
      schema.literal('w'),
      schema.literal('mo'),
      schema.literal('y'),
    ],
    opts
  );

export const durationInputUnitEsqlSchema = (opts?: Options<DurationInputUnitEsql>) =>
  schema.oneOf(
    [
      schema.literal('ms'),
      schema.literal('s'),
      schema.literal('m'),
      schema.literal('h'),
      schema.literal('d'),
      schema.literal('w'),
      schema.literal('mo'),
      schema.literal('y'),
    ],
    opts
  );

export const durationOutputUnitSchema = (opts?: Options<DurationOutputUnit>) =>
  schema.oneOf(
    [
      schema.literal('humanize'),
      schema.literal('humanizePrecise'),
      schema.literal('ms'),
      schema.literal('s'),
      schema.literal('m'),
      schema.literal('h'),
      schema.literal('d'),
      schema.literal('w'),
      schema.literal('mo'),
      schema.literal('y'),
    ],
    opts
  );

const durationFormatSuffixSchema = schema.maybe(
  schema.string({
    meta: {
      description: 'Suffix appended to the formatted value.',
    },
  })
);

const durationFormatMeta = {
  title: 'Duration Format',
  description: 'Duration format between time units.',
};

export const dslDurationFormatSchema = schema.object(
  {
    type: schema.literal('duration'),
    from: durationInputUnitDslSchema({
      meta: {
        description:
          'Source time unit. DSL supports fine-grained units (`ps`, `ns`, `us`) in addition to standard units.',
      },
    }),
    to: durationOutputUnitSchema({
      meta: {
        description:
          'Display time unit: `humanize` (friendly approximate), `humanizePrecise` (friendly precise), or a fixed conversion unit.',
      },
    }),
    suffix: durationFormatSuffixSchema,
  },
  {
    meta: {
      id: 'dslDurationFormat',
      ...durationFormatMeta,
    },
  }
);

export const esqlDurationFormatSchema = schema.object(
  {
    type: schema.literal('duration'),
    from: durationInputUnitEsqlSchema({
      meta: {
        description:
          'Source time unit for ES|QL data sources (`ms`, `s`, `m`, `h`, `d`, `w`, `mo`, `y`).',
      },
    }),
    to: durationOutputUnitSchema({
      meta: {
        description:
          'Display time unit: `humanize` (friendly approximate), `humanizePrecise` (friendly precise), or a fixed conversion unit.',
      },
    }),
    suffix: durationFormatSuffixSchema,
  },
  {
    meta: {
      id: 'esqlDurationFormat',
      ...durationFormatMeta,
    },
  }
);
