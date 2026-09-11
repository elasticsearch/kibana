/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectsModelVersion,
  SavedObjectsMappingProperties,
} from '@kbn/core-saved-objects-server';
import { BUILDER_FIELDS_IGNORE_ABOVE } from '@kbn/alerting-v2-constants';
import type {
  BuilderTypeManifest,
  MappingProperty,
  OpaqueBuilderFields,
} from '@kbn/alerting-v2-rule-builders';
import { addFoldedVersion } from '../../lib/builder_types/folded_versions';
import { currentRuleSavedObjectAttributesSchema } from '../schemas/rule_saved_object_attributes';

// Forward-compatibility schema for all manifest-folded model versions.
// Built from currentRuleSavedObjectAttributesSchema so that updating the alias
// (when a new attributes schema version is added) automatically applies to every
// fold line — no individual call-site updates are needed.
//
// Ref: rule-data-migration.md "Rollback behavior"
const forwardCompatibilitySchema = currentRuleSavedObjectAttributesSchema.extends(
  {},
  { unknowns: 'ignore' }
);

/**
 * Expands version `n` of a builder type's static manifest into an ordinary
 * saved-object model version.
 *
 * - `addedSubFieldMappings` becomes a `mappings_addition` under
 *   `metadata.builder_fields.properties`.
 * - `backfillFn` becomes a `data_backfill` confined to `metadata.builder_fields`
 *   and scoped to documents whose `metadata.builder_type` equals the manifest's
 *   type. Documents of other types (or with no builder_type) are left untouched.
 * - An identity `data_backfill` is injected automatically for any version above
 *   1 that declares `addedSubFieldMappings` without an explicit `backfillFn`,
 *   so the migration re-indexes existing documents under the new typed sub-field.
 * - Records the fold in the global FoldedVersionsSet so the registration-time
 *   manifest-consistency check can verify that every manifest version has been
 *   expanded (check 6 of registerBuilderType).
 *
 * Ref: rule-data-migration.md "From manifest version to model version"
 *      rule-data-migration.md "A mapping addition pairs with a rewrite"
 */
export function fromBuilderManifest(
  manifest: BuilderTypeManifest,
  n: number
): SavedObjectsModelVersion {
  // Populate the fold registry so registerBuilderType can verify every manifest
  // version has been expanded (registration-time check 6).
  addFoldedVersion(manifest.type, n);

  const manifestVersion = manifest.versions[n];
  if (!manifestVersion) {
    throw new Error(`Builder type "${manifest.type}" has no version ${n} in its manifest`);
  }

  const changes: SavedObjectsModelVersion['changes'] = [];
  const { addedSubFieldMappings, backfillFn } = manifestVersion;
  const hasSubFieldMappings =
    addedSubFieldMappings != null && Object.keys(addedSubFieldMappings).length > 0;

  // mappings_addition: declare the new typed sub-fields under
  // metadata.builder_fields.properties. Core requires every mappings_addition
  // to be verbatim present in the type's static mappings (rule_mappings.ts).
  if (hasSubFieldMappings) {
    changes.push({
      type: 'mappings_addition',
      addedMappings: buildMappingsAddition(addedSubFieldMappings!),
    });
  }

  // Identity backfill: injected automatically for any version above 1 that
  // declares addedSubFieldMappings without an explicit backfillFn.
  //
  // Elasticsearch indexes a typed sub-field only for documents written after
  // the sub-field was mapped. A version above 1 that maps a field that already
  // holds data must therefore rewrite every document to trigger re-indexing,
  // even when there is nothing to compute. The data_backfill achieves this.
  //
  // Version 1 is exempt: no stored rule carries the field yet when the type
  // first ships, so there is nothing to re-index.
  //
  // If an explicit backfillFn is present it already triggers a document
  // rewrite; the identity backfill would be redundant and is omitted.
  //
  // Ref: rule-data-migration.md "A mapping addition pairs with a rewrite"
  if (n > 1 && hasSubFieldMappings && !backfillFn) {
    changes.push({
      type: 'data_backfill',
      backfillFn: buildScopedBackfillFn(manifest.type, (fields) => fields),
    });
  }

  // Manifest's explicit backfill: confined to metadata.builder_fields and
  // scoped to documents of this manifest's builder_type.
  if (backfillFn) {
    changes.push({
      type: 'data_backfill',
      backfillFn: buildScopedBackfillFn(manifest.type, backfillFn),
    });
  }

  return {
    changes,
    schemas: {
      forwardCompatibility: forwardCompatibilitySchema,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the `addedMappings` structure for a mappings_addition change.
 *
 * The manifest's sub-field mappings (keyed by leaf path) are wrapped in the
 * full `metadata.builder_fields.properties` nesting that core expects. The
 * `flattened` type and `ignore_above` are repeated here because core requires
 * every mappings_addition to be verbatim present in the type's static mappings.
 *
 * Note on types: `SavedObjectsFieldMapping` explicitly carries an optional
 * `properties` key (inherited from `MappingPropertyBase` via `EsMappingProperty`),
 * so `properties` under a `flattened` field is accepted by the TypeScript types
 * natively without a cast. See:
 *   src/core/packages/saved-objects/server/src/mapping_definition.ts
 *   node_modules/@elastic/elasticsearch/lib/api/types.d.ts — `MappingPropertyBase`
 *
 * The cast on `addedSubFieldMappings` is needed because our `MappingProperty`
 * union is a narrower allowlist than the ES client's `EsMappingProperty` union;
 * every member of our union is a valid `EsMappingProperty`, so the cast is safe.
 */
function buildMappingsAddition(
  addedSubFieldMappings: Record<string, MappingProperty>
): SavedObjectsMappingProperties {
  return {
    metadata: {
      properties: {
        builder_fields: {
          type: 'flattened',
          ignore_above: BUILDER_FIELDS_IGNORE_ABOVE,
          // Cast: our MappingProperty union is narrower than EsMappingProperty
          // (it is an allowlist of the types that work reliably as flattened
          // sub-fields). Every member is a valid EsMappingProperty.
          properties: addedSubFieldMappings as Record<
            string,
            SavedObjectsMappingProperties[string]
          >,
        },
      },
    },
  };
}

/**
 * Returns a data_backfill function that:
 * 1. Skips documents whose `metadata.builder_type` does not equal `type`
 *    (type scoping: one builder type's backfill never runs over another's rules).
 * 2. Passes the document's `metadata.builder_fields` through `fn` and returns
 *    the result confined to that container.
 *
 * Core deep-merges the returned `attributes` into the document, so returning
 * `{ attributes: {} }` is a true no-op for non-matching documents.
 *
 * Ref: rule-data-migration.md "From manifest version to model version"
 */
function buildScopedBackfillFn(
  type: string,
  fn: (fields: OpaqueBuilderFields) => OpaqueBuilderFields
): (doc: { attributes?: any }, ctx: unknown) => { attributes: Record<string, unknown> } {
  return (doc) => {
    const builderType = doc.attributes?.metadata?.builder_type;

    // Type scoping: only rewrite documents for this manifest's builder type.
    if (builderType !== type) {
      return { attributes: {} };
    }

    const builderFields: OpaqueBuilderFields = doc.attributes?.metadata?.builder_fields ?? {};

    return {
      attributes: {
        metadata: {
          builder_fields: fn(builderFields),
        },
      },
    };
  };
}
