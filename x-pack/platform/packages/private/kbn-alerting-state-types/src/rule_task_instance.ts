/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { asSpaceId, type SpaceId } from '@kbn/core-spaces-common';

export enum ActionsCompletion {
  COMPLETE = 'complete',
  PARTIAL = 'partial',
}

/**
 * io-ts codec that decodes a serialized space id into a branded {@link SpaceId}.
 *
 * The value was already a valid space id when the task was scheduled, so this is
 * a trusted-boundary re-brand on deserialization rather than fresh validation.
 */
const spaceIdCodec = new t.Type<SpaceId, string, unknown>(
  'SpaceId',
  (input): input is SpaceId => typeof input === 'string',
  (input, context) => {
    if (typeof input !== 'string') {
      return t.failure(input, context);
    }
    try {
      return t.success(asSpaceId(input));
    } catch {
      return t.failure(input, context);
    }
  },
  t.identity
);

export const ruleParamsSchema = t.intersection([
  t.type({
    alertId: t.string,
  }),
  t.partial({
    spaceId: spaceIdCodec,
  }),
]);
export type RuleTaskParams = t.TypeOf<typeof ruleParamsSchema>;
