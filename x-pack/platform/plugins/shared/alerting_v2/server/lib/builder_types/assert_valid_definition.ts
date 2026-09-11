/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  MAX_BUILDER_FIELDS_ARRAY_ITEMS,
  MAX_BUILDER_FIELDS_BYTES,
  MAX_BUILDER_FIELDS_STRING_LENGTH,
} from '@kbn/alerting-v2-constants';
import { assertBoundedSchema } from '../bounded_schema';
import type { FoldedVersionsRecord } from './folded_versions';
import type { RegisteredBuilderType } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for a builder type id, in characters. */
const MAX_TYPE_ID_LENGTH = 64;

/**
 * A valid type id consists of dot-separated segments, each containing only
 * lowercase ASCII letters, digits, and underscores.
 */
const TYPE_ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

/**
 * The container's `ignore_above` value. Leaf strings stored in
 * `metadata.builder_fields` whose values exceed this length are silently
 * unsearchable as keywords. Any schema field with a maxLength above this
 * must have a typed sub-field declared in the manifest.
 *
 * Ref: rule-data-model.md "Constraints the mapping design works within"
 */
const BUILDER_FIELDS_IGNORE_ABOVE = 4096;

/** The bounds subject passed to assertBoundedSchema. */
const BUILDER_FIELDS_SUBJECT = {
  kind: 'Builder type',
  schemaProperty: 'builderFieldsSchema',
  rootPath: 'builder_fields',
  limits: {
    stringLength: MAX_BUILDER_FIELDS_STRING_LENGTH,
    arrayItems: MAX_BUILDER_FIELDS_ARRAY_ITEMS,
    totalBytes: MAX_BUILDER_FIELDS_BYTES,
  },
} as const;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Asserts that a builder type definition is valid.
 *
 * Runs the registration-time checks 2–8 from rule-type-registration.md, in
 * order, so a violating definition fails on its first violated check. Check 1
 * (setup-phase-only, no duplicate id) is enforced in BuilderTypeRegistry
 * before this function is called. Check 3 (bounded schema) is delegated to
 * assertBoundedSchema, which is called from within this function to preserve
 * the ordering.
 *
 * @param definition - The type definition to validate.
 * @param foldedVersions - Record of (type, version) pairs that have been
 *   folded into alerting_v2's model versions. Consulted by check 6. Step 2.3
 *   populates the production singleton; tests pass a fixture.
 */
export function assertValidDefinition(
  definition: RegisteredBuilderType,
  foldedVersions: FoldedVersionsRecord
): void {
  // ---------------------------------------------------------------------------
  // Prerequisites (not numbered in the design — these are structural guards
  // that enable the numbered checks to run meaningfully).
  // ---------------------------------------------------------------------------

  if (typeof definition.type !== 'string' || definition.type.trim().length === 0) {
    throw new Error('Builder type definition requires a non-empty type');
  }

  if (definition.builderFieldsSchema == null) {
    throw new Error(`Builder type "${definition.type}" requires a builderFieldsSchema`);
  }

  if (typeof definition.generateQuery !== 'function') {
    throw new Error(`Builder type "${definition.type}" requires a generateQuery function`);
  }

  // ---------------------------------------------------------------------------
  // Check 2: id format
  // Lowercase letters, digits, underscores; dot-separated segments; ≤ 64 chars.
  // Ref: rule-type-registration.md "Registration-time checks" item 2
  // ---------------------------------------------------------------------------

  if (definition.type.length > MAX_TYPE_ID_LENGTH) {
    throw new Error(
      `Builder type "${definition.type}" id exceeds the maximum length of ` +
        `${MAX_TYPE_ID_LENGTH} characters (id format check)`
    );
  }
  if (!TYPE_ID_PATTERN.test(definition.type)) {
    throw new Error(
      `Builder type "${definition.type}" id must consist of dot-separated segments ` +
        `of lowercase letters, digits, and underscores (id format check)`
    );
  }

  // ---------------------------------------------------------------------------
  // Check 3: bounded schema
  // The bounded-schema walk (extended with the top-level key count and the
  // no-defaults/no-transforms rule). Delegated to assertBoundedSchema.
  // Ref: rule-type-registration.md check 3 + rule-validation.md "No defaults"
  // ---------------------------------------------------------------------------

  assertBoundedSchema(definition.builderFieldsSchema, definition.type, BUILDER_FIELDS_SUBJECT);

  // ---------------------------------------------------------------------------
  // Check 4: ignore_above consistency
  // Every schema string whose bound > BUILDER_FIELDS_IGNORE_ABOVE must have a
  // typed sub-field declared in the manifest. A string exceeding ignore_above
  // is stored but silently unsearchable as a keyword.
  // Ref: rule-data-model.md "Constraints the mapping design works within"
  // ---------------------------------------------------------------------------

  assertIgnoreAboveConsistency(definition);

  // ---------------------------------------------------------------------------
  // Check 5: kind pin validity
  // If `kind` is declared, it must be 'alert' or 'signal'.
  // Ref: rule-type-registration.md check 5
  // ---------------------------------------------------------------------------

  if (definition.kind !== undefined) {
    if (definition.kind !== 'alert' && definition.kind !== 'signal') {
      throw new Error(
        `Builder type "${definition.type}" has an invalid kind pin "${String(
          definition.kind
        )}" — must be 'alert' or 'signal' (kind pin validity check)`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Check 6: manifest consistency
  // The manifest's type matches the definition's type, versions are dense from
  // 1, currentVersion is the maximum, and every version is folded into
  // alerting_v2's model versions.
  // Ref: rule-type-registration.md check 6
  // ---------------------------------------------------------------------------

  if (definition.manifest !== undefined) {
    assertManifestConsistency(definition, foldedVersions);
  }

  // ---------------------------------------------------------------------------
  // Check 7: managed-type completeness
  // A type with `ownership` must declare `compilation` explicitly, carry a
  // manifest, and have an id whose first two dot-segments equal the declared
  // solution and domain.
  // Ref: rule-type-registration.md check 7 + rule-ownership.md "Managed rule types"
  // ---------------------------------------------------------------------------

  if (definition.ownership !== undefined) {
    assertManagedTypeCompleteness(definition);
  }

  // ---------------------------------------------------------------------------
  // Check 8: mode consistency
  // `deriveRuleFields` is only allowed on execution-time types.
  // Ref: rule-type-registration.md check 8
  //      rule-execution-logic.md "Derived rule fields at write time"
  // ---------------------------------------------------------------------------

  if (definition.deriveRuleFields !== undefined && definition.compilation !== 'execution_time') {
    throw new Error(
      `Builder type "${definition.type}" declares deriveRuleFields but compilation is not ` +
        `'execution_time' — deriveRuleFields is only allowed on execution-time types ` +
        `(mode consistency check)`
    );
  }
}

// ---------------------------------------------------------------------------
// Check 4 helper: ignore_above consistency
// ---------------------------------------------------------------------------

/**
 * Collects all sub-field paths declared across all manifest versions.
 */
function collectManifestSubFieldPaths(definition: RegisteredBuilderType): Set<string> {
  const paths = new Set<string>();
  if (!definition.manifest) return paths;
  for (const version of Object.values(definition.manifest.versions)) {
    for (const path of Object.keys(version.addedSubFieldMappings ?? {})) {
      paths.add(path);
    }
  }
  return paths;
}

/**
 * Walks a JSON-Schema node to find string fields whose maxLength exceeds
 * BUILDER_FIELDS_IGNORE_ABOVE. For each such field, the path (relative to
 * the builder_fields container) must appear in the manifest's declared
 * sub-fields.
 *
 * @param node - Current JSON-Schema node.
 * @param relPath - Path relative to the builder_fields root (empty at root).
 * @param typeName - The builder type id, for error messages.
 * @param declaredPaths - Set of manifest sub-field paths to check against.
 */
function walkForIgnoreAbove(
  node: Record<string, unknown>,
  relPath: string,
  typeName: string,
  declaredPaths: Set<string>
): void {
  if (node.type === 'string') {
    const maxLength = node.maxLength as number | undefined;
    if (maxLength !== undefined && maxLength > BUILDER_FIELDS_IGNORE_ABOVE) {
      if (!declaredPaths.has(relPath)) {
        throw new Error(
          `Builder type "${typeName}" field "${relPath}": maxLength ${maxLength} exceeds ` +
            `ignore_above ${BUILDER_FIELDS_IGNORE_ABOVE} but no typed sub-field is declared ` +
            `in the manifest for this path — an unmapped leaf longer than ignore_above is ` +
            `stored but silently unsearchable (ignore_above consistency check)`
        );
      }
    }
    return;
  }

  if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
    for (const [key, child] of Object.entries(
      node.properties as Record<string, Record<string, unknown>>
    )) {
      const childPath = relPath ? `${relPath}.${key}` : key;
      walkForIgnoreAbove(child, childPath, typeName, declaredPaths);
    }
  }

  if (
    node.type === 'array' &&
    node.items !== undefined &&
    typeof node.items === 'object' &&
    !Array.isArray(node.items)
  ) {
    // For arrays, the sub-field path in a flattened mapping uses dot notation
    // (no array marker). We pass relPath unchanged so element string paths
    // compute correctly.
    walkForIgnoreAbove(
      node.items as Record<string, unknown>,
      relPath,
      typeName,
      declaredPaths
    );
  }

  const anyOf = node.anyOf ?? node.oneOf;
  if (Array.isArray(anyOf)) {
    for (const branch of anyOf as Record<string, unknown>[]) {
      walkForIgnoreAbove(branch, relPath, typeName, declaredPaths);
    }
  }
}

function assertIgnoreAboveConsistency(definition: RegisteredBuilderType): void {
  // Only meaningful when a manifest is present; without a manifest there are
  // no typed sub-fields to declare, so any string > ignore_above is an error.
  // If there is no manifest, the check still runs — it will fail on any
  // string whose maxLength exceeds BUILDER_FIELDS_IGNORE_ABOVE, because there
  // is nowhere to declare the required sub-field.
  const declaredPaths = collectManifestSubFieldPaths(definition);

  let json: Record<string, unknown>;
  try {
    json = z.toJSONSchema(definition.builderFieldsSchema, { io: 'input' }) as Record<
      string,
      unknown
    >;
  } catch {
    // assertBoundedSchema (check 3) will surface JSON-Schema conversion errors.
    return;
  }

  walkForIgnoreAbove(json, '', definition.type, declaredPaths);
}

// ---------------------------------------------------------------------------
// Check 6 helper: manifest consistency
// ---------------------------------------------------------------------------

function assertManifestConsistency(
  definition: RegisteredBuilderType,
  foldedVersions: FoldedVersionsRecord
): void {
  const { type, manifest } = definition;
  // assertValidDefinition only calls this when manifest !== undefined.
  const m = manifest!;

  // The manifest's type must match the definition's type.
  if (m.type !== type) {
    throw new Error(
      `Builder type "${type}" manifest.type "${m.type}" does not match the definition's type ` +
        `(manifest consistency check)`
    );
  }

  // Versions must be a non-empty object.
  const versionKeys = Object.keys(m.versions).map(Number).filter(Number.isFinite);
  if (versionKeys.length === 0) {
    throw new Error(
      `Builder type "${type}" manifest has no versions (manifest consistency check)`
    );
  }

  // Versions must be dense from 1.
  const maxVersion = Math.max(...versionKeys);
  for (let v = 1; v <= maxVersion; v++) {
    if (!(v in m.versions)) {
      throw new Error(
        `Builder type "${type}" manifest versions are not dense from 1 — ` +
          `version ${v} is missing (manifest consistency check)`
      );
    }
  }

  // currentVersion must equal the highest key.
  if (m.currentVersion !== maxVersion) {
    throw new Error(
      `Builder type "${type}" manifest.currentVersion ${m.currentVersion} does not match ` +
        `the highest version key ${maxVersion} (manifest consistency check)`
    );
  }

  // Every manifest version must be folded into alerting_v2's model versions.
  for (let v = 1; v <= maxVersion; v++) {
    if (!foldedVersions.has(type, v)) {
      throw new Error(
        `Builder type "${type}" manifest version ${v} has not been folded into ` +
          `alerting_v2's model versions — add a fromBuilderManifest("${type}", ${v}) ` +
          `line to rule_model_versions.ts (manifest consistency check)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7 helper: managed-type completeness
// ---------------------------------------------------------------------------

function assertManagedTypeCompleteness(definition: RegisteredBuilderType): void {
  const { type, ownership } = definition;
  // assertValidDefinition only calls this when ownership !== undefined.
  const o = ownership!;

  // Must declare compilation explicitly.
  if (definition.compilation === undefined) {
    throw new Error(
      `Builder type "${type}" declares ownership but does not declare compilation explicitly — ` +
        `managed types must declare compilation (managed-type completeness check)`
    );
  }

  // Must carry a manifest.
  if (definition.manifest === undefined) {
    throw new Error(
      `Builder type "${type}" declares ownership but has no manifest — ` +
        `managed types must carry a manifest (managed-type completeness check)`
    );
  }

  // The type id's first two dot-segments must equal solution and domain.
  const segments = type.split('.');
  if (segments.length < 3 || segments[0] !== o.solution || segments[1] !== o.domain) {
    throw new Error(
      `Builder type "${type}" declares ownership { solution: "${o.solution}", domain: "${o.domain}" } ` +
        `but its id's first two segments ("${segments[0]}", "${segments[1] ?? ''}") do not match — ` +
        `a managed type's id must start with "<solution>.<domain>." ` +
        `(managed-type completeness check)`
    );
  }
}
