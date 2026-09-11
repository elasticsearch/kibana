/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import type {
  GetDrilldownsSchemaFnType,
  SerializedDrilldowns,
} from '@kbn/embeddable-plugin/server';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
  BY_REF_SCHEMA_META,
} from '@kbn/presentation-publishing-schemas';
import { VEGA_SUPPORTED_TRIGGERS } from '../../common/constants';
import { vegaSpecSchema } from '../api/schema';

export const getVegaEmbeddableSchema = (getDrilldownsSchema: GetDrilldownsSchemaFnType) => {
  return (
    z
      .object({
        ...serializedTitlesSchema.shape,
        ...serializedTimeRangeSchema.shape,
        ...getDrilldownsSchema(VEGA_SUPPORTED_TRIGGERS).shape,
        spec: vegaSpecSchema,
      })
      // Strip unknown keys for forward-compatible additive changes in this public contract.
      .strip()
      .meta({
        id: 'kbn-vega-embeddable',
        title: 'Vega',
        description: 'Vega by-value embeddable state schema.',
      })
  );
};

/**
 * `vis_types/vega` compiles with `strictNullChecks: false`, which makes the Zod-inferred drilldowns
 * output type incompatible with `SerializedDrilldowns` (e.g. `trigger` becomes optional). Replace
 * only that inferred property until strict null checks are enabled.
 * See https://github.com/elastic/kibana/issues/287451
 */
type WithSerializedDrilldowns<State> = Omit<State, keyof SerializedDrilldowns> &
  SerializedDrilldowns;

export type VegaByValueState = WithSerializedDrilldowns<
  z.output<ReturnType<typeof getVegaEmbeddableSchema>>
>;

export const vegaByReferenceStateSchema = z
  .object({
    ...serializedTitlesSchema.shape,
    ref_id: z.string().meta({
      description: 'The unique identifier of the Vega library item.',
    }),
  })
  .strip()
  .meta(BY_REF_SCHEMA_META);

export type VegaByReferenceState = WithSerializedDrilldowns<
  z.output<typeof vegaByReferenceStateSchema>
>;

export type VegaEmbeddableState = VegaByValueState | VegaByReferenceState;
