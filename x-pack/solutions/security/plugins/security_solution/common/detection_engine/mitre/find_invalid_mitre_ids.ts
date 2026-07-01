/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Threats } from '@kbn/securitysolution-io-ts-alerting-types';
import { tactics, techniques, subtechniques } from './mitre_tactics_techniques';
import type { MitreThreatEntityType } from './iterate_mitre_threat_entities';
import { iterateMitreThreatEntities } from './iterate_mitre_threat_entities';

const validIdsByType: Record<MitreThreatEntityType, Set<string>> = {
  tactic: new Set(tactics.map((t) => t.id)),
  technique: new Set(techniques.map((t) => t.id)),
  subtechnique: new Set(subtechniques.map((t) => t.id)),
};

/**
 * Returns the unique MITRE ATT&CK™ IDs (tactic, technique, or subtechnique)
 * referenced by a rule's threat mappings that are not present in the currently
 * bundled MITRE dataset. Returns an empty array when all referenced IDs are
 * known.
 *
 * Each invalid ID is reported at most once even if it is referenced multiple
 * times across the `threats` array, so callers can safely use the result to
 * key React elements.
 *
 * Non-MITRE framework entries are skipped. A missing or empty `threats` value
 * results in an empty array.
 */
export const findInvalidMitreIds = (threats: Threats | undefined): string[] => {
  const invalidIds = new Set<string>();

  for (const { type, id } of iterateMitreThreatEntities(threats)) {
    if (!validIdsByType[type].has(id)) {
      invalidIds.add(id);
    }
  }

  return Array.from(invalidIds);
};

/**
 * Returns `true` when the given MITRE ATT&CK™ ID exists in the currently bundled
 * dataset for the requested entity type. Useful for highlighting individual
 * unsupported fields (e.g. in a rule edit form).
 *
 * NOTE: Importing this helper statically pulls in the bundled MITRE dataset.
 * On the client, prefer lazy-loading the dataset and checking IDs against the
 * already-loaded options instead.
 */
export const isKnownMitreId = (type: MitreThreatEntityType, id: string): boolean =>
  validIdsByType[type].has(id);
