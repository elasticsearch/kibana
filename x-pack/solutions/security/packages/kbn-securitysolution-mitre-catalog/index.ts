/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  MitreAttackCatalog,
  MitreAttackCatalogMeta,
  MitreSubTechnique,
  MitreTactic,
  MitreTechnique,
} from './src/types';

export { CATALOG_META, subtechniques, tactics, techniques } from './src/catalog';

export { subtechniqueById } from './src/lookup/subtechnique_by_id';
export { tacticsToIds } from './src/lookup/tactics_to_ids';
export { techniqueById } from './src/lookup/technique_by_id';
