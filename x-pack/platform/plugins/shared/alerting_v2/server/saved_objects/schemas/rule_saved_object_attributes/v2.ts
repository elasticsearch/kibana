/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV1,
  ruleMetadataSchema as ruleMetadataSchemaV1,
} from './v1';

/**
 * v2 adds the server-managed `metadata.version` counter. It is incremented on
 * every successful mutation and used as `object.sequence` in the change history
 * index and as `rule.version` on emitted rule events. The field is optional so
 * rules created before v3 (which have no counter yet) remain valid; readers
 * fall back to `RULE_VERSION_FALLBACK`.
 */
export const ruleMetadataSchema = ruleMetadataSchemaV1.extends({
  version: schema.maybe(schema.number()),
});

export const ruleSavedObjectAttributesSchema = ruleSavedObjectAttributesSchemaV1.extends({
  metadata: ruleMetadataSchema,
});
