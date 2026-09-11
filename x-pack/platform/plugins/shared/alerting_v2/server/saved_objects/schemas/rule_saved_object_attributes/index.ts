/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV1 } from './v1';
import { ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV2 } from './v2';
import { ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV3 } from './v3';
import { ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV4 } from './v4';

export type RuleSavedObjectAttributesV2 = TypeOf<typeof ruleSavedObjectAttributesSchemaV2>;
export type RuleSavedObjectAttributes = TypeOf<typeof ruleSavedObjectAttributesSchemaV4>;

export {
  ruleSavedObjectAttributesSchemaV1,
  ruleSavedObjectAttributesSchemaV2,
  ruleSavedObjectAttributesSchemaV3,
  ruleSavedObjectAttributesSchemaV4,
};

/**
 * The current (latest) rule saved-object attributes schema.
 *
 * `fromBuilderManifest` uses this to build the forward-compatibility schema for
 * every fold line. Update this alias whenever a new versioned attributes schema
 * is created (e.g. v5 for identity/source/ownership fields), so that all
 * existing and future fold lines pick up the new schema automatically without
 * needing individual call-site updates.
 *
 * Ref: rule-data-migration.md "Rollback behavior"
 */
export const currentRuleSavedObjectAttributesSchema = ruleSavedObjectAttributesSchemaV4;
