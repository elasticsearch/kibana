/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { subtechniqueById, tactics, techniqueById } from '@kbn/securitysolution-mitre-catalog';

export interface MitreTechniqueMetadata {
  technique_id: string;
  name: string;
  reference?: string;
  tactic_name?: string;
}

const normalizeTacticKey = (value: string): string => value.replace(/-/g, '').toLowerCase();

const tacticNameByKey = new Map(
  tactics.map((tactic) => [normalizeTacticKey(tactic.value), tactic.name])
);

const tacticNameForTechnique = (tacticValues: readonly string[]): string | undefined => {
  const primary = tacticValues[0];
  if (!primary) {
    return undefined;
  }
  return tacticNameByKey.get(normalizeTacticKey(primary));
};

/**
 * Resolves ATT&CK technique IDs from threat-report aggregations to human-readable
 * names, tactic labels, and MITRE reference URLs via the shared catalog.
 */
export const getMitreTechniqueMetadata = (techniqueId: string): MitreTechniqueMetadata => {
  const technique = techniqueById.get(techniqueId);
  if (technique) {
    return {
      technique_id: techniqueId,
      name: technique.name,
      reference: technique.reference,
      tactic_name: tacticNameForTechnique(technique.tactics),
    };
  }

  const subtechnique = subtechniqueById.get(techniqueId);
  if (subtechnique) {
    return {
      technique_id: techniqueId,
      name: subtechnique.name,
      reference: subtechnique.reference,
      tactic_name: tacticNameForTechnique(subtechnique.tactics),
    };
  }

  return {
    technique_id: techniqueId,
    name: techniqueId,
  };
};
