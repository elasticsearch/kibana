/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import type { ToolEventEmitter } from '@kbn/agent-builder-server';
import type { RuleCreationState } from '../state';
import { MITRE_MAPPING_SELECTION_PROMPT } from './prompts';
import {
  tactics,
  techniques,
  subtechniques,
} from '../../../../../../common/detection_engine/mitre/mitre_tactics_techniques';
import type {
  MitreTactic,
  MitreTechnique,
  MitreSubTechnique,
} from '../../../../../../common/detection_engine/mitre/types';
import type {
  Threat,
  ThreatTechnique,
} from '../../../../../../common/api/detection_engine/model/rule_schema/common_attributes.gen';

interface MitreMappingSelectionResponse {
  tactics: string[]; // Array of tactic IDs like ["TA0001", "TA0002"]
  techniques: Array<{
    id: string;
    subtechnique?: string[]; // Array of subtechnique IDs like ["T1078.001"]
  }>;
}

interface AddMitreMappingsNodeParams {
  model: InferenceChatModel;
  events?: ToolEventEmitter;
}

/**
 * Validates and formats the MITRE mapping response according to the Threat schema
 */
const formatMitreMapping = (response: MitreMappingSelectionResponse): Array<Threat> => {
  const threatMappings: Array<Threat> = [];

  // Group techniques by tactic
  const tacticsMap = new Map<string, MitreTactic>();
  tactics.forEach((tactic: MitreTactic) => {
    tacticsMap.set(tactic.id, tactic);
  });

  const techniquesMap = new Map<string, MitreTechnique>();
  techniques.forEach((technique: MitreTechnique) => {
    techniquesMap.set(technique.id, technique);
  });

  const subtechniquesMap = new Map<string, MitreSubTechnique>();
  subtechniques.forEach((subTechnique: MitreSubTechnique) => {
    subtechniquesMap.set(subTechnique.id, subTechnique);
  });

  for (const tacticId of response.tactics || []) {
    const tacticData = tacticsMap.get(tacticId);
    if (tacticData) {
      // Find techniques that belong to this tactic and validate them against imported data
      const relevantTechniques = (response.techniques || [])
        .map((tech: MitreMappingSelectionResponse['techniques'][0]) => {
          const techData = techniquesMap.get(tech.id);
          if (!techData) {
            return null;
          }
          // Check if technique belongs to this tactic
          const belongsToTactic = techData.tactics.some(
            (t: string) => t.toLowerCase().replaceAll('-', '') === tacticData.value.toLowerCase()
          );
          if (!belongsToTactic) {
            return null;
          }
          return { techData, subtechniqueIds: tech.subtechnique || [] };
        })
        .filter((item) => item !== null);

      // Format techniques with subtechniques using data from imports
      const formattedTechniques = relevantTechniques.map(({ techData, subtechniqueIds }) => {
        const formatted: ThreatTechnique = {
          id: techData.id,
          name: techData.name,
          reference: techData.reference,
        };

        // Add subtechniques if present - validate and get data from imports
        if (subtechniqueIds.length > 0) {
          const formattedSubtechniques = subtechniqueIds
            .map((subId: string) => {
              const subData = subtechniquesMap.get(subId);
              if (!subData) {
                return null;
              }
              // Verify subtechnique belongs to the parent technique
              if (subData.techniqueId !== techData.id) {
                return null;
              }
              return {
                id: subData.id,
                name: subData.name,
                reference: subData.reference,
              };
            })
            .filter((sub) => sub !== null);

          if (formattedSubtechniques.length > 0) {
            formatted.subtechnique = formattedSubtechniques;
          }
        }

        return formatted;
      });

      threatMappings.push({
        framework: 'MITRE ATT&CK',
        tactic: {
          id: tacticData.id,
          name: tacticData.name,
          reference: tacticData.reference,
        },
        technique: formattedTechniques,
      });
    }
  }

  return threatMappings;
};

export const addMitreMappingsNode = ({ model, events }: AddMitreMappingsNodeParams) => {
  const jsonParser = new JsonOutputParser<MitreMappingSelectionResponse>();

  return async (state: RuleCreationState): Promise<RuleCreationState> => {
    events?.reportProgress(
      'Analyzing rule to identify relevant MITRE ATT&CK tactics and techniques...'
    );

    try {
      const mitreSelectionChain = MITRE_MAPPING_SELECTION_PROMPT.pipe(model).pipe(jsonParser);

      const ruleTags = Array.isArray(state?.rule?.tags) ? state.rule.tags.join(', ') : '';

      const mitreSelectionResult = await mitreSelectionChain.invoke({
        user_request: state.userQuery,
        esql_query: state?.rule?.query || '',
        rule_tags: ruleTags,
      });

      const threatMappings = formatMitreMapping(mitreSelectionResult);

      events?.reportProgress(
        `Identified ${threatMappings.length} MITRE ATT&CK mapping(s) with ${threatMappings.reduce(
          (sum, m) => sum + (m.technique?.length || 0),
          0
        )} technique(s)`
      );

      return {
        ...state,
        rule: {
          threat: threatMappings,
        },
      };
    } catch (error) {
      events?.reportProgress(`Failed to add MITRE mappings: ${error.message}`);
      // Don't fail the entire rule creation if MITRE mapping fails
      return {
        ...state,
        warnings: [`Failed to add MITRE mappings: ${error.message}`],
      };
    }
  };
};
