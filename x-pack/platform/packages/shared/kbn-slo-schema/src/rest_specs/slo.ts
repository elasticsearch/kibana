/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import {
  allOrAnyString,
  groupingsSchema,
  metaSchema,
  remoteSchema,
  sloDefinitionSchema,
  summarySchema,
} from '../schema';
import {
  allOrAnyString as allOrAnyStringZod,
  groupingsSchema as groupingsSchemaZod,
  metaSchema as metaSchemaZod,
  remoteSchema as remoteSchemaZod,
  sloDefinitionSchema as sloDefinitionSchemaZod,
  summarySchema as summarySchemaZod,
} from '../schema/zod';
import type { SLODefinitionResponse } from './routes/find_definition';

const sloWithDataResponseSchema = t.intersection([
  sloDefinitionSchema,
  t.type({ summary: summarySchema, groupings: groupingsSchema, instanceId: allOrAnyString }),
  t.partial({
    meta: metaSchema,
    remote: remoteSchema,
  }),
]);

// Zod twin — io-ts version stays alive until its last consumer (test_helpers/fixtures.ts) is updated.
const sloWithDataResponseSchemaZod = sloDefinitionSchemaZod.extend({
  summary: summarySchemaZod,
  groupings: groupingsSchemaZod,
  instanceId: allOrAnyStringZod,
  meta: metaSchemaZod.optional(),
  remote: remoteSchemaZod.optional(),
});

type SLOWithSummaryResponse = t.OutputOf<typeof sloWithDataResponseSchema>;

export { sloWithDataResponseSchema, sloWithDataResponseSchemaZod };
export type { SLODefinitionResponse, SLOWithSummaryResponse };
