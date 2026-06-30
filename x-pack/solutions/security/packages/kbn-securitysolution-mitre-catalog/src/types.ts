/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Slim shape of a MITRE ATT&CK tactic. No i18n label — consumers that render
 * tactics in the UI should layer translated labels on top in their own
 * adapter, keyed off `value`.
 */
export interface MitreTactic {
  /** Canonical MITRE tactic ID, e.g. `TA0001`. */
  id: string;
  /** Display name as published by MITRE, e.g. `Initial Access`. */
  name: string;
  /** Link to the tactic's MITRE ATT&CK page. */
  reference: string;
  /** camelCased version of `name`, used as the join key on `MitreTechnique.tactics`. */
  value: string;
}

export interface MitreTechnique {
  id: string;
  name: string;
  reference: string;
  /**
   * Tactics this technique is mapped to, expressed as lowercase dash-separated
   * MITRE tactic short names (e.g. `initial-access`). Note: this differs from
   * `MitreTactic.value` (camelCase). Use `tacticsToIds` to translate to the
   * canonical `TAxxxx` IDs.
   */
  tactics: string[];
  /**
   * camelCased version of `name`. Stable across regenerations and used as a
   * stable per-entry key by labeled adapters layered on top of the catalog.
   */
  value: string;
}

export interface MitreSubTechnique extends MitreTechnique {
  /** Parent technique ID, e.g. `T1059` for sub-technique `T1059.001`. */
  techniqueId: string;
}

export interface MitreAttackCatalogMeta {
  generated_from: string;
  generator: string;
  regenerate_with: string;
}

export interface MitreAttackCatalog {
  _meta: MitreAttackCatalogMeta;
  tactics: MitreTactic[];
  techniques: MitreTechnique[];
  subtechniques: MitreSubTechnique[];
}
