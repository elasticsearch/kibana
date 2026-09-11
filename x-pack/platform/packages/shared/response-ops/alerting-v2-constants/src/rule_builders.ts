/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const MAX_BUILDER_FIELDS_STRING_LENGTH = 8_192;
export const MAX_BUILDER_FIELDS_ARRAY_ITEMS = 64;
export const MAX_BUILDER_FIELDS_BYTES = 262_144;

/**
 * The `ignore_above` threshold of the `metadata.builder_fields` flattened
 * container. Strings stored in builder_fields whose values exceed this length
 * are stored but silently unsearchable as keywords. Shared between:
 *
 * - `rule_mappings.ts` (the static saved-object mapping definition)
 * - `from_builder_manifest.ts` (mappings_addition in model versions)
 * - `assert_valid_definition.ts` (check 4: ignore_above consistency)
 *
 * All three must agree byte-for-byte so core's startup consistency check
 * passes automatically.
 *
 * Ref: rule-type-registration.md "The fold into the saved-object registration"
 */
export const BUILDER_FIELDS_IGNORE_ABOVE = 4096;
