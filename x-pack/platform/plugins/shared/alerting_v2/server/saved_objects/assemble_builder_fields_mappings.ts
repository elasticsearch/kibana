/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsMappingProperties } from '@kbn/core-saved-objects-server';
import type { BuilderTypeManifest, MappingProperty } from '@kbn/alerting-v2-rule-builders';

/**
 * Assembles the typed sub-field properties that belong under
 * `metadata.builder_fields.properties` in `rule_mappings.ts`, by collecting
 * all `addedSubFieldMappings` declarations across every version of every
 * supplied manifest.
 *
 * Cross-manifest conflict detection:
 * - Two manifests declaring the same leaf path with **different** field types
 *   fail `alerting_v2`'s setup with an error naming both types and the path.
 * - The same path with **identical** declarations merges silently — which is
 *   what happens to the shared detection fragment's sub-fields when several
 *   types declare them by spreading shared package constants.
 *
 * The returned object is intended to be used as the `properties` value of the
 * `builder_fields` entry in `rule_mappings.ts`, extending:
 *
 * ```typescript
 * builder_fields: {
 *   type: 'flattened',
 *   ignore_above: 4096,
 *   properties: assembleBuilderFieldsMappings([queryManifest, thresholdManifest]),
 * }
 * ```
 *
 * Step 3.5 wires the actual detection-type manifests in. An empty array
 * produces an empty object (no properties added to the static mapping).
 *
 * Ref: rule-type-registration.md "The fold into the saved-object registration"
 */
export function assembleBuilderFieldsMappings(
  manifests: BuilderTypeManifest[]
): SavedObjectsMappingProperties {
  // Accumulator: path → { property, declaredByType }
  // `declaredByType` is retained only for conflict-error messages.
  const accumulated = new Map<string, { property: MappingProperty; declaredByType: string }>();

  for (const manifest of manifests) {
    for (const version of Object.values(manifest.versions)) {
      if (!version.addedSubFieldMappings) continue;

      for (const [path, property] of Object.entries(version.addedSubFieldMappings)) {
        const existing = accumulated.get(path);

        if (existing) {
          // Same leaf path already declared by another manifest (or a previous
          // version of this one). Check for a conflict.
          if (!areMappingPropertiesEqual(existing.property, property)) {
            throw new Error(
              `Builder type mapping conflict: leaf path "${path}" is declared by both ` +
                `"${existing.declaredByType}" and "${manifest.type}" with different field ` +
                `types — identical declarations merge silently, differing declarations fail ` +
                `alerting_v2's setup`
            );
          }
          // Identical declaration: merge silently (keep the existing entry).
        } else {
          accumulated.set(path, { property, declaredByType: manifest.type });
        }
      }
    }
  }

  // Build the final properties object.
  // Cast: our MappingProperty union is a narrower allowlist than the ES client's
  // EsMappingProperty union (it covers the types known to work reliably as
  // flattened sub-fields). Every member is a valid EsMappingProperty.
  const properties: SavedObjectsMappingProperties = {};
  for (const [path, { property }] of accumulated) {
    properties[path] = property as SavedObjectsMappingProperties[string];
  }

  return properties;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compares two MappingProperty values for deep equality.
 *
 * JSON.stringify is used because MappingProperty values are plain data objects
 * (no function values, no symbol keys, no circular references). Key order in
 * a MappingProperty is deterministic — all properties come from object
 * literals with a fixed set of fields — so stringify comparison is reliable.
 */
function areMappingPropertiesEqual(a: MappingProperty, b: MappingProperty): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
