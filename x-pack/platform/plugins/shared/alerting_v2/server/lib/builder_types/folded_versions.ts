/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Records which (type, version) pairs have been folded into alerting_v2's
 * model versions via fromBuilderManifest() calls in rule_model_versions.ts.
 *
 * The manifest-consistency check (check 6 of registerBuilderType) consults
 * this record to verify that every manifest version declared in a
 * BuilderTypeDefinition has been expanded into a model version.
 *
 * Step 2.3 populates the global instance via addFoldedVersion(); tests pass
 * a locally constructed FoldedVersionsSet as a fixture.
 */
export interface FoldedVersionsRecord {
  /** Returns true if (type, version) has been folded into a model version. */
  has(type: string, version: number): boolean;
}

/**
 * Mutable implementation of FoldedVersionsRecord. Tests construct fresh
 * instances; the module-level globalFoldedVersions is the production singleton.
 */
export class FoldedVersionsSet implements FoldedVersionsRecord {
  private readonly entries = new Set<string>();

  /** Record that (type, version) has been folded. */
  record(type: string, version: number): void {
    this.entries.add(`${type}:${version}`);
  }

  has(type: string, version: number): boolean {
    return this.entries.has(`${type}:${version}`);
  }
}

/**
 * The production singleton, populated by addFoldedVersion() which is called
 * from fromBuilderManifest() in rule_model_versions.ts (step 2.3). The
 * BuilderTypeRegistry reads this by default; tests inject a fixture instead.
 */
export const globalFoldedVersions = new FoldedVersionsSet();

/**
 * Called by fromBuilderManifest() (step 2.3) to record that (type, version)
 * has been folded into alerting_v2's model versions. This populates the global
 * singleton that the registry consults during registerBuilderType.
 */
export function addFoldedVersion(type: string, version: number): void {
  globalFoldedVersions.record(type, version);
}
