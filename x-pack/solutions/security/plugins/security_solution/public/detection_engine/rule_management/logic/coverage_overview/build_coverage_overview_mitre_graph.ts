/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kebabCase } from 'lodash';
import { tacticOrder } from '../../../../../common/detection_engine/mitre/mitre_tactics_order';
import type {
  MitreTactic,
  MitreTechnique,
  MitreSubTechnique,
} from '../../../../../common/detection_engine/mitre/types';
import type { CoverageOverviewMitreSubTechnique } from '../../model/coverage_overview/mitre_subtechnique';
import type { CoverageOverviewMitreTactic } from '../../model/coverage_overview/mitre_tactic';
import type { CoverageOverviewMitreTechnique } from '../../model/coverage_overview/mitre_technique';

export function buildCoverageOverviewMitreGraph(
  tactics: MitreTactic[],
  techniques: MitreTechnique[],
  subtechniques: MitreSubTechnique[]
): CoverageOverviewMitreTactic[] {
  const techniqueToSubtechniquesMap = new Map<string, CoverageOverviewMitreSubTechnique[]>(); // Map(TechniqueId -> SubTechniqueId[])

  for (const subtechnique of subtechniques) {
    const coverageOverviewMitreSubTechnique = {
      id: subtechnique.id,
      name: subtechnique.name,
      reference: subtechnique.reference,
      enabledRules: [],
      disabledRules: [],
      availableRules: [],
    };

    const techniqueSubtechniques = techniqueToSubtechniquesMap.get(subtechnique.techniqueId);

    if (!techniqueSubtechniques) {
      techniqueToSubtechniquesMap.set(subtechnique.techniqueId, [
        coverageOverviewMitreSubTechnique,
      ]);
    } else {
      techniqueSubtechniques.push(coverageOverviewMitreSubTechnique);
    }
  }

  const tacticToTechniquesMap = new Map<string, CoverageOverviewMitreTechnique[]>(); // Map(kebabCase(tactic name) -> CoverageOverviewMitreTechnique)

  for (const technique of techniques) {
    const relatedSubtechniques = techniqueToSubtechniquesMap.get(technique.id) ?? [];

    for (const kebabCaseTacticName of technique.tactics) {
      const coverageOverviewMitreTechnique: CoverageOverviewMitreTechnique = {
        id: technique.id,
        name: technique.name,
        reference: technique.reference,
        subtechniques: relatedSubtechniques,
        enabledRules: [],
        disabledRules: [],
        availableRules: [],
      };
      const tacticTechniques = tacticToTechniquesMap.get(kebabCaseTacticName);

      if (!tacticTechniques) {
        tacticToTechniquesMap.set(kebabCaseTacticName, [coverageOverviewMitreTechnique]);
      } else {
        tacticTechniques.push(coverageOverviewMitreTechnique);
      }
    }
  }

  const sortedTactics = tactics.sort(
    (a, b) => tacticOrder.indexOf(a.id) - tacticOrder.indexOf(b.id)
  );

  const result: CoverageOverviewMitreTactic[] = [];

  for (const tactic of sortedTactics) {
    result.push({
      id: tactic.id,
      name: tactic.name,
      reference: tactic.reference,
      techniques: tacticToTechniquesMap.get(kebabCase(tactic.name)) ?? [],
      enabledRules: [],
      disabledRules: [],
      availableRules: [],
    });
  }

  return result;
}
