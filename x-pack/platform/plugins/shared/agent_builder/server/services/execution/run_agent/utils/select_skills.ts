/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentConfiguration } from '@kbn/agent-builder-common';
import { isElasticCapabilitiesExcludedBuiltinSkill } from '@kbn/agent-builder-common/skills';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { SkillsService, WritableSkillsStore } from '@kbn/agent-builder-server/runner';

/**
 * Resolves the set of skills available to an agent based on its configuration:
 * - Explicitly selected skills via `skill_ids` (fetched with bulkGet)
 * - All built-in skills when `enable_elastic_capabilities` is true
 * - Additional skills from assigned plugins via `additionalSkillIds`
 *
 * Returns the merged, deduplicated list.
 */
export const resolveAgentSkills = async ({
  skills,
  agentConfiguration,
  additionalSkillIds,
}: {
  // Allows SkillRegistry to be passed as well
  skills: Pick<SkillsService, 'bulkGet' | 'list'>;
  agentConfiguration: AgentConfiguration;
  additionalSkillIds?: string[];
}): Promise<InternalSkillDefinition[]> => {
  const skillIds = agentConfiguration.skill_ids ?? [];
  const enableElasticCapabilities = agentConfiguration.enable_elastic_capabilities ?? false;
  const pluginSkillIds = additionalSkillIds ?? [];

  if (skillIds.length === 0 && !enableElasticCapabilities && pluginSkillIds.length === 0) {
    return [];
  }

  const allExplicitIds = [...skillIds, ...pluginSkillIds];

  const [explicitSkillsMap, builtinSkills] = await Promise.all([
    allExplicitIds.length > 0
      ? skills.bulkGet(allExplicitIds)
      : Promise.resolve(new Map<string, InternalSkillDefinition>()),
    enableElasticCapabilities
      ? skills.list({ type: 'built-in' })
      : Promise.resolve([] as InternalSkillDefinition[]),
  ]);

  const merged = new Map(explicitSkillsMap);
  for (const skill of builtinSkills) {
    if (!merged.has(skill.id) && !isElasticCapabilitiesExcludedBuiltinSkill(skill.id)) {
      merged.set(skill.id, skill);
    }
  }

  return [...merged.values()];
};

/**
 * Resolves agent skills and populates the writable skills store.
 */
export const selectSkills = async ({
  skills,
  skillsStore,
  agentConfiguration,
  additionalSkillIds,
}: {
  skills: SkillsService;
  skillsStore: WritableSkillsStore;
  agentConfiguration: AgentConfiguration;
  additionalSkillIds?: string[];
}): Promise<InternalSkillDefinition[]> => {
  const agentSkills = await resolveAgentSkills({ skills, agentConfiguration, additionalSkillIds });
  for (const skill of agentSkills) {
    skillsStore.add(skill);
  }
  return agentSkills;
};
