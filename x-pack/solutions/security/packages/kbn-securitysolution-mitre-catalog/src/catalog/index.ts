/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import catalogJson from '../data/mitre_attack_catalog.json';
import type {
  MitreAttackCatalog,
  MitreAttackCatalogMeta,
  MitreSubTechnique,
  MitreTactic,
  MitreTechnique,
} from '../types';

const catalog = catalogJson as MitreAttackCatalog;

export const tactics: readonly MitreTactic[] = catalog.tactics;
export const techniques: readonly MitreTechnique[] = catalog.techniques;
export const subtechniques: readonly MitreSubTechnique[] = catalog.subtechniques;

/**
 * Provenance of the bundled catalog snapshot — which upstream file it was
 * generated from, which script produced it, and how to refresh it.
 */
export const CATALOG_META: Readonly<MitreAttackCatalogMeta> = catalog._meta;
