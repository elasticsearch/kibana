/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

const MAX_RULE_SNAPSHOT_FIELD_LENGTH = 1024;

export const ruleSnapshotSchema = z.object({
  ruleId: z.string().max(MAX_RULE_SNAPSHOT_FIELD_LENGTH).describe('Unique rule identifier.'),
  spaceId: z
    .string()
    .max(MAX_RULE_SNAPSHOT_FIELD_LENGTH)
    .describe('Kibana space ID where the rule lives.'),
});

export type RuleSnapshot = z.infer<typeof ruleSnapshotSchema>;

export const ruleLifecycleEventSchema = z.object({
  rule: ruleSnapshotSchema.describe('Rule affected by this operation.'),
});

export type RuleLifecycleEvent = z.infer<typeof ruleLifecycleEventSchema>;
